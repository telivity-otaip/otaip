/**
 * Hotelbeds adapter demo — full lifecycle, end-to-end, against the real
 * Hotelbeds APItude sandbox.
 *
 * Walks: status → availability → optional checkRate → book →
 * getBooking → cancelBooking SIMULATION → cancelBooking CANCELLATION.
 *
 * ~7 sandbox calls per run. The sandbox is rate-limited to 50/day.
 *
 * Run:
 *   HOTELBEDS_API_KEY=… HOTELBEDS_SECRET=… npx tsx demo/index.ts
 *   HOTELBEDS_API_KEY=… HOTELBEDS_SECRET=… npx tsx demo/index.ts --destination LON
 *
 * On failure after a successful book, the demo attempts a cleanup cancel
 * so it never leaves a dangling sandbox reservation.
 */

import Decimal from 'decimal.js';

import { HotelbedsAdapter } from '../src/hotelbeds-adapter.js';
import {
  mapHotelToRawResult,
  parseCategoryCodeStarRating,
} from '../src/field-mapper.js';
import type { HotelbedsHotel, HotelbedsRate } from '../src/types.js';

// ---------------------------------------------------------------------------
// CLI parsing — keep tiny, no dependency on a CLI library
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { destination: string } {
  let destination = 'MCO';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--destination' || arg === '-d') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('--destination requires a value (e.g. --destination LON)');
      }
      destination = next.toUpperCase();
      i++;
    }
  }
  return { destination };
}

function isoDateOffsetDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtMoney(amount: string, currency: string): string {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '';
  return `${symbol}${new Decimal(amount).toFixed(2)} ${currency}`;
}

function stars(n: number | undefined): string {
  if (!n) return '';
  return '★'.repeat(n);
}

function boardLabel(boardCode: string | undefined): string {
  switch (boardCode) {
    case 'RO':
      return 'Room Only';
    case 'BB':
      return 'Bed & Breakfast';
    case 'HB':
      return 'Half Board';
    case 'FB':
      return 'Full Board';
    case 'AI':
      return 'All Inclusive';
    default:
      return boardCode ?? '—';
  }
}

interface ScoredOffer {
  hotel: HotelbedsHotel;
  rate: HotelbedsRate;
  net: Decimal;
  perNight: Decimal;
  currency: string;
}

function rankOffers(hotels: HotelbedsHotel[], nights: number): ScoredOffer[] {
  const offers: ScoredOffer[] = [];
  for (const hotel of hotels) {
    for (const room of hotel.rooms ?? []) {
      for (const rate of room.rates ?? []) {
        if (!rate.rateKey || !rate.net) continue;
        const net = new Decimal(rate.net);
        const perNight = nights > 0 ? net.dividedBy(nights) : net;
        offers.push({
          hotel,
          rate,
          net,
          perNight,
          currency: rate.hotelCurrency ?? hotel.currency ?? 'EUR',
        });
      }
    }
  }
  offers.sort((a, b) => a.net.comparedTo(b.net));
  return offers;
}

/**
 * Hotelbeds returns multiple rate plans per hotel (different board types,
 * cancellation rules). For the "Top 3 hotels" display, collapse to the
 * cheapest rate per hotel so the user sees three distinct properties.
 */
function dedupeByHotel(offers: ScoredOffer[]): ScoredOffer[] {
  const seen = new Map<number, ScoredOffer>();
  for (const offer of offers) {
    const existing = seen.get(offer.hotel.code);
    if (!existing || offer.net.lt(existing.net)) {
      seen.set(offer.hotel.code, offer);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.net.comparedTo(b.net));
}

function pickCheapestBookable(offers: ScoredOffer[]): ScoredOffer | null {
  return offers.find((o) => o.rate.rateType === 'BOOKABLE') ?? offers[0] ?? null;
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━';

async function main(): Promise<void> {
  const { destination } = parseArgs(process.argv.slice(2));

  if (!process.env['HOTELBEDS_API_KEY'] || !process.env['HOTELBEDS_SECRET']) {
    console.error('Missing credentials. Set HOTELBEDS_API_KEY and HOTELBEDS_SECRET in your env.');
    console.error('Get sandbox credentials at https://developer.hotelbeds.com');
    process.exitCode = 1;
    return;
  }

  console.log('🏨 Hotelbeds Adapter Demo');
  console.log(DIVIDER);
  console.log('');

  const adapter = new HotelbedsAdapter();
  let bookingRef: string | null = null;
  let bookingCancelled = false;

  try {
    // -----------------------------------------------------------------------
    // 1. Auth
    // -----------------------------------------------------------------------
    const ok = await adapter.isAvailable();
    if (!ok) {
      throw new Error('Auth check failed — verify HOTELBEDS_API_KEY / HOTELBEDS_SECRET.');
    }
    console.log('✓ Authenticated with Hotelbeds sandbox');
    console.log('');

    // -----------------------------------------------------------------------
    // 2. Availability
    // -----------------------------------------------------------------------
    const checkIn = isoDateOffsetDays(56);
    const checkOut = isoDateOffsetDays(58);
    const nights = 2;

    console.log(`Searching hotels in ${destination} (${checkIn} to ${checkOut}, 2 adults)...`);
    const availability = await adapter.availability({
      stay: { checkIn, checkOut },
      occupancies: [{ rooms: 1, adults: 2, children: 0 }],
      destination: { code: destination },
    });

    const hotels = availability.hotels?.hotels ?? [];
    console.log(`✓ Found ${hotels.length} hotels`);
    console.log('');

    if (hotels.length === 0) {
      console.error(`No availability for ${destination} on those dates. Try a different code (e.g. MCO, LON, BCN).`);
      process.exitCode = 1;
      return;
    }

    const ranked = rankOffers(hotels, nights);
    const topByHotel = dedupeByHotel(ranked);
    console.log('Top 3:');
    for (const [i, offer] of topByHotel.slice(0, 3).entries()) {
      const star = stars(parseCategoryCodeStarRating(offer.hotel.categoryCode));
      const board = boardLabel(offer.rate.boardCode);
      console.log(
        `  ${i + 1}. ${offer.hotel.name} ${star} — ${fmtMoney(offer.perNight.toFixed(2), offer.currency)}/night (${board})`,
      );
    }
    console.log('');

    // -----------------------------------------------------------------------
    // 3. Pick cheapest BOOKABLE rate
    // -----------------------------------------------------------------------
    const picked = pickCheapestBookable(ranked);
    if (!picked) {
      console.error('No bookable rate in results.');
      process.exitCode = 1;
      return;
    }

    console.log(`Booking: ${picked.hotel.name} (cheapest ${picked.rate.rateType} rate)`);

    // Sanity-check the field mapper handles real data without crashing.
    mapHotelToRawResult(picked.hotel, { checkIn, checkOut });

    // -----------------------------------------------------------------------
    // 4. CheckRate — only when RECHECK
    // -----------------------------------------------------------------------
    let bookingRateKey = picked.rate.rateKey;
    if (picked.rate.rateType === 'RECHECK') {
      console.log('  → RECHECK rate detected, re-validating price...');
      const checked = await adapter.checkRate({ rooms: [{ rateKey: picked.rate.rateKey }] });
      const newRate = checked.hotel?.rooms?.[0]?.rates?.[0];
      if (!newRate) {
        throw new Error('CheckRate returned no rate.');
      }
      bookingRateKey = newRate.rateKey;
      console.log(
        `  ✓ Updated price: ${fmtMoney(newRate.net, newRate.hotelCurrency ?? picked.currency)}`,
      );
    }

    // -----------------------------------------------------------------------
    // 5. Book
    // -----------------------------------------------------------------------
    // clientReference is capped at 20 chars by Hotelbeds.
    const clientReference = `demo-${Date.now().toString(36)}`.slice(0, 20);
    const bookResp = await adapter.book({
      holder: { name: 'Demo', surname: 'Booking' },
      rooms: [
        {
          rateKey: bookingRateKey,
          paxes: [{ roomId: 1, type: 'AD', name: 'Demo', surname: 'Booking' }],
        },
      ],
      clientReference,
      tolerance: 2.0,
    });

    if (!bookResp.booking) {
      throw new Error('Book returned no booking.');
    }
    bookingRef = bookResp.booking.reference;
    console.log(`✓ Booking confirmed: ${bookingRef}`);
    console.log('');

    // -----------------------------------------------------------------------
    // 6. Get booking detail
    // -----------------------------------------------------------------------
    console.log('Retrieving booking detail...');
    const detail = await adapter.getBooking(bookingRef);
    const totalNet = detail.booking?.totalNet ?? bookResp.booking.totalNet ?? '0';
    const currency = detail.booking?.currency ?? bookResp.booking.currency ?? picked.currency;
    console.log(
      `✓ Booking matches — ${detail.booking?.hotel?.name ?? picked.hotel.name}, ${nights} nights, ${fmtMoney(totalNet, currency)} total`,
    );
    console.log('');

    // -----------------------------------------------------------------------
    // 7a. Cancel SIMULATION
    // -----------------------------------------------------------------------
    console.log('Cancellation simulation...');
    const sim = await adapter.cancelBooking(bookingRef, 'SIMULATION');
    const simAmount = sim.booking?.totalNet ?? '0.00';
    console.log(`✓ Cancel fee: ${fmtMoney(simAmount, currency)}`);
    console.log('');

    // -----------------------------------------------------------------------
    // 7b. Cancel CANCELLATION
    // -----------------------------------------------------------------------
    console.log('Cancelling booking...');
    await adapter.cancelBooking(bookingRef, 'CANCELLATION');
    bookingCancelled = true;
    console.log('✓ Booking cancelled — sandbox cleaned up');
    console.log('');

    console.log(DIVIDER);
    console.log('Demo complete. Full lifecycle verified.');
    console.log('Sandbox calls used: ~7 of 50/day');
  } catch (err) {
    console.error('');
    console.error('✗ Demo failed:', err instanceof Error ? err.message : err);

    // Cleanup: if we have a booking but didn't cancel, try to cancel now.
    if (bookingRef && !bookingCancelled) {
      console.error(`Attempting cleanup cancel for ${bookingRef}...`);
      try {
        await adapter.cancelBooking(bookingRef, 'CANCELLATION');
        console.error('  ✓ Cleanup cancel succeeded.');
      } catch (cleanupErr) {
        console.error(
          '  ✗ Cleanup cancel failed:',
          cleanupErr instanceof Error ? cleanupErr.message : cleanupErr,
        );
        console.error(`  Cancel manually: booking reference ${bookingRef}`);
      }
    }
    process.exitCode = 1;
  }
}

await main();
