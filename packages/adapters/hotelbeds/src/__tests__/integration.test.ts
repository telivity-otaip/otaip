/**
 * Hotelbeds APItude — sandbox integration test.
 *
 * Hits the REAL Hotelbeds test sandbox at https://api.test.hotelbeds.com.
 * Auto-skips when HOTELBEDS_API_KEY / HOTELBEDS_SECRET are not set, so
 * CI never accidentally runs it. The full happy-path flow is:
 *
 *     status (auth check)
 *       → availability (Orlando MCO, 2 nights)
 *       → checkRate    (only when a RECHECK rate is selected)
 *       → book         (creates a real sandbox reservation)
 *       → getBooking
 *       → cancelBooking SIMULATION
 *       → cancelBooking CANCELLATION   (cleanup)
 *
 * That is 6-7 calls per run. The sandbox is rate-limited to 50 calls/day.
 *
 * Run with:
 *   HOTELBEDS_API_KEY=... HOTELBEDS_SECRET=... HOTELBEDS_ENV=test \
 *     pnpm exec vitest run packages/adapters/hotelbeds/src/__tests__/integration.test.ts
 *
 * Tests within the describe execute sequentially (Vitest's default for
 * non-`.concurrent` tests), so each step can rely on shared state
 * captured by the previous step. An afterAll cleanup attempts to cancel
 * any booking that wasn't explicitly cancelled — important for not
 * leaving dangling reservations in the sandbox account.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

import { HotelbedsAdapter } from '../hotelbeds-adapter.js';
import {
  HOTELBEDS_CANCEL_FEE_MARKUP,
  mapBookingStatus,
  mapHotelToRawResult,
  summarizeBooking,
} from '../field-mapper.js';
import type { HotelbedsBooking, HotelbedsHotel, HotelbedsRate } from '../types.js';

const HAS_CREDENTIALS = Boolean(process.env['HOTELBEDS_API_KEY'] && process.env['HOTELBEDS_SECRET']);

// 8 weeks out to maximize the chance of availability in any season.
const CHECK_IN = isoDateOffsetDays(56);
const CHECK_OUT = isoDateOffsetDays(58);
const DESTINATION = 'MCO';

describe.skipIf(!HAS_CREDENTIALS)('Hotelbeds Sandbox — happy path integration', () => {
  let adapter: HotelbedsAdapter;
  let pickedRate: HotelbedsRate | null = null;
  let pickedHotel: HotelbedsHotel | null = null;
  let bookingRef: string | null = null;
  let bookingForCleanup: HotelbedsBooking | null = null;

  beforeAll(() => {
    adapter = new HotelbedsAdapter({
      // env vars resolved by the constructor; passing nothing exercises that path.
    });
  });

  afterAll(async () => {
    // Cleanup: if we booked but didn't cancel, cancel now to not leave
    // a dangling reservation in the sandbox account.
    if (bookingRef && bookingForCleanup?.status !== 'CANCELLED') {
      try {
        await adapter.cancelBooking(bookingRef, 'CANCELLATION');
      } catch (err) {
        // Surface but don't fail the suite; cleanup is best-effort.
        console.warn(`[hotelbeds-integration] cleanup cancel failed for ${bookingRef}:`, err);
      }
    }
  });

  // -------------------------------------------------------------------------
  // 1. Auth — confirm we get past the signature check
  // -------------------------------------------------------------------------
  it('auth: status endpoint returns 200 (no 401/INVALID_SIGNATURE)', async () => {
    const ok = await adapter.isAvailable();
    expect(ok, 'expected /status to return 200 with a valid signature').toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. Availability — Orlando MCO
  // -------------------------------------------------------------------------
  it('availability: returns hotels with bookable rates for MCO', async () => {
    const response = await adapter.availability({
      stay: { checkIn: CHECK_IN, checkOut: CHECK_OUT },
      occupancies: [{ rooms: 1, adults: 2, children: 0 }],
      destination: { code: DESTINATION },
    });

    const hotels = response.hotels?.hotels ?? [];
    expect(hotels.length, 'sandbox should always return Orlando hotels').toBeGreaterThan(0);

    // Walk hotels for a usable rate.
    for (const hotel of hotels) {
      for (const room of hotel.rooms ?? []) {
        for (const rate of room.rates ?? []) {
          expect(rate.rateKey, 'every rate must carry a rateKey').toBeTruthy();
          expect(rate.net, 'every rate must carry a net amount').toBeTruthy();
          // net must parse as Decimal
          expect(() => new Decimal(rate.net), 'net must parse as Decimal').not.toThrow();
        }
      }
    }

    // Pick the cheapest BOOKABLE rate; fall back to cheapest RECHECK.
    pickedRate = pickCheapestRate(hotels, 'BOOKABLE') ?? pickCheapestRate(hotels, 'RECHECK');
    pickedHotel = hotels.find((h) =>
      (h.rooms ?? []).some((r) => (r.rates ?? []).some((x) => x.rateKey === pickedRate?.rateKey)),
    ) ?? null;

    expect(pickedRate, 'expected to find at least one rate to test with').not.toBeNull();
    expect(pickedHotel, 'expected to find the hotel that owns the picked rate').not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // 3. Field mapping survives real-world payload
  // -------------------------------------------------------------------------
  it('field mapper: real availability hotel maps to a valid RawHotelResult', () => {
    if (!pickedHotel) return;
    const mapped = mapHotelToRawResult(pickedHotel, {
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
    });
    expect(mapped.source.sourceId).toBe('hotelbeds');
    expect(mapped.source.sourcePropertyId).toBe(String(pickedHotel.code));
    if (mapped.starRating !== undefined) {
      expect(typeof mapped.starRating).toBe('number');
      expect(Number.isInteger(mapped.starRating)).toBe(true);
    }
    expect(mapped.rates.length).toBeGreaterThan(0);
    for (const rate of mapped.rates) {
      // Strings, parseable as Decimal — money never leaves Decimal/string land.
      expect(() => new Decimal(rate.totalRate)).not.toThrow();
      expect(() => new Decimal(rate.nightlyRate)).not.toThrow();
    }
  });

  // -------------------------------------------------------------------------
  // 4. CheckRate — only when picked rate is RECHECK
  // -------------------------------------------------------------------------
  it('checkRate: re-validates a RECHECK rate (skipped when picked rate is BOOKABLE)', async () => {
    if (!pickedRate) return;
    if (pickedRate.rateType !== 'RECHECK') {
      // Step doesn't apply — pickedRate is already BOOKABLE.
      return;
    }
    const response = await adapter.checkRate({ rooms: [{ rateKey: pickedRate.rateKey }] });
    const newRate = response.hotel?.rooms?.[0]?.rates?.[0];
    expect(newRate, 'checkrate must return at least one rate').toBeTruthy();
    expect(newRate?.rateKey).toBeTruthy();

    // Use the (possibly new) rateKey for booking.
    if (newRate) pickedRate = newRate;
  });

  // -------------------------------------------------------------------------
  // 5. Book — real sandbox reservation
  // -------------------------------------------------------------------------
  it('book: creates a real sandbox reservation and returns CONFIRMED', async () => {
    if (!pickedRate) throw new Error('no rate picked — earlier step must have failed');

    const response = await adapter.book({
      holder: { name: 'Test', surname: 'Booking' },
      rooms: [
        {
          rateKey: pickedRate.rateKey,
          paxes: [{ roomId: 1, type: 'AD', name: 'Test', surname: 'Booking' }],
        },
      ],
      // Hotelbeds caps clientReference at 20 chars. Use a short prefix +
      // a base36 timestamp suffix that fits within the limit.
      clientReference: `it-${Date.now().toString(36)}`,
      tolerance: 2.0,
    });

    expect(response.booking, 'book must return a booking').toBeTruthy();
    bookingForCleanup = response.booking ?? null;
    bookingRef = response.booking?.reference ?? null;

    expect(bookingRef, 'booking must have a reference').toBeTruthy();
    expect(mapBookingStatus(response.booking?.status)).toBe('confirmed');

    // Decimal amount round-trips.
    if (response.booking?.totalNet) {
      expect(() => new Decimal(response.booking!.totalNet!)).not.toThrow();
    }

    // Summary mapper produces a valid record.
    const summary = summarizeBooking(response.booking!);
    expect(summary.reference).toBe(bookingRef);
    expect(summary.status).toBe('confirmed');
  });

  // -------------------------------------------------------------------------
  // 6. Get booking — verify retrieval matches what we just booked
  // -------------------------------------------------------------------------
  it('getBooking: retrieves the booking and matches step 5', async () => {
    if (!bookingRef) throw new Error('no booking reference — earlier step must have failed');
    const detail = await adapter.getBooking(bookingRef);
    expect(detail.booking?.reference).toBe(bookingRef);
    expect(mapBookingStatus(detail.booking?.status)).toBe('confirmed');
  });

  // -------------------------------------------------------------------------
  // 7a. Cancel SIMULATION — preview cost, booking unchanged
  // -------------------------------------------------------------------------
  it('cancelBooking SIMULATION: returns the cancellation preview', async () => {
    if (!bookingRef) throw new Error('no booking reference — earlier step must have failed');
    const sim = await adapter.cancelBooking(bookingRef, 'SIMULATION');
    expect(sim.booking, 'simulation must return a booking record').toBeTruthy();
    // Sandbox cost is sometimes 0; the field is still expected to exist.
    if (sim.booking?.totalNet) {
      expect(() => new Decimal(sim.booking!.totalNet!)).not.toThrow();
    }

    // Check that the markup constant is reasonable (sanity, not network) —
    // any real penalty surfaced through the rate-mapper would carry a
    // gross figure of net * HOTELBEDS_CANCEL_FEE_MARKUP.
    expect(HOTELBEDS_CANCEL_FEE_MARKUP).toBeGreaterThanOrEqual(1);

    // Booking should still be retrievable with status not yet CANCELLED.
    const detail = await adapter.getBooking(bookingRef);
    expect(detail.booking?.status).not.toBe('CANCELLED');
  });

  // -------------------------------------------------------------------------
  // 7b. Cancel CANCELLATION — actually cancel
  // -------------------------------------------------------------------------
  it('cancelBooking CANCELLATION: actually cancels the booking', async () => {
    if (!bookingRef) throw new Error('no booking reference — earlier step must have failed');
    const result = await adapter.cancelBooking(bookingRef, 'CANCELLATION');
    expect(result.booking, 'cancellation must return the cancelled booking').toBeTruthy();
    expect(mapBookingStatus(result.booking?.status)).toBe('cancelled');
    bookingForCleanup = result.booking ?? bookingForCleanup;
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDateOffsetDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function pickCheapestRate(
  hotels: HotelbedsHotel[],
  rateType: 'BOOKABLE' | 'RECHECK',
): HotelbedsRate | null {
  let cheapest: HotelbedsRate | null = null;
  for (const hotel of hotels) {
    for (const room of hotel.rooms ?? []) {
      for (const rate of room.rates ?? []) {
        if (rate.rateType !== rateType) continue;
        if (!rate.rateKey || !rate.net) continue;
        if (cheapest === null || new Decimal(rate.net).lt(new Decimal(cheapest.net))) {
          cheapest = rate;
        }
      }
    }
  }
  return cheapest;
}
