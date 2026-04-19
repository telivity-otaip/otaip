/**
 * Mock Hotelbeds adapter — in-memory data, no network.
 *
 * Mirrors the public surface of `HotelbedsAdapter` so upstream tests can
 * swap it in by interface, but uses no real API. Returns Hotelbeds-shaped
 * fixtures so the field-mapper paths are exercised end-to-end.
 *
 * NOT a replacement for the existing
 * `packages/agents/lodging/src/hotel-search/adapters/hotelbeds.ts` mock,
 * which is narrower (search-only, returns pre-mapped RawHotelResult). This
 * mock simulates the wire shapes so the same `HotelbedsAdapter`
 * lifecycle (availability → checkrate → book → cancel) is testable.
 */

import { mapHotelToRawResult, summarizeBooking, type BookingSummary } from './field-mapper.js';
import type {
  HotelbedsAvailabilityRequest,
  HotelbedsAvailabilityResponse,
  HotelbedsBooking,
  HotelbedsBookingListResponse,
  HotelbedsBookingRequest,
  HotelbedsBookingResponse,
  HotelbedsCancellationFlag,
  HotelbedsCancellationResponse,
  HotelbedsCheckRateRequest,
  HotelbedsCheckRateResponse,
  HotelbedsHotel,
  HotelbedsRate,
} from './types.js';
import type { HotelSearchParams, HotelSourceAdapter } from './lodging-source-interface.js';
import type { RawHotelResult } from '@otaip/agents-lodging';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRate(overrides: Partial<HotelbedsRate> & { rateKey: string }): HotelbedsRate {
  return {
    rateType: 'BOOKABLE',
    rateClass: 'NOR',
    net: '610.00',
    boardCode: 'RO',
    boardName: 'ROOM ONLY',
    paymentType: 'AT_WEB',
    cancellationPolicies: [{ amount: '305.00', from: '2026-06-13T23:59:59+00:00' }],
    ...overrides,
  };
}

const HOTEL_MCO_BOOKABLE: HotelbedsHotel = {
  code: 12345,
  name: 'Mock Bedbank Resort Orlando',
  categoryCode: '4EST',
  destinationCode: 'MCO',
  destinationName: 'Orlando area',
  countryCode: 'US',
  stateCode: 'FL',
  postalCode: '32830',
  city: 'Orlando',
  address: { content: '1500 Mock Resort Blvd' },
  latitude: '28.3852',
  longitude: '-81.5639',
  currency: 'USD',
  chainCode: 'MOK',
  rooms: [
    {
      code: 'STD.ST',
      name: 'STANDARD ROOM',
      rates: [makeRate({ rateKey: 'mock-mco-bookable-1' })],
    },
  ],
};

const HOTEL_MCO_RECHECK: HotelbedsHotel = {
  ...HOTEL_MCO_BOOKABLE,
  code: 67890,
  name: 'Mock Bedbank Suites Orlando',
  rooms: [
    {
      code: 'SUITE.ST',
      name: 'JUNIOR SUITE',
      rates: [
        makeRate({
          rateKey: 'mock-mco-recheck-1',
          rateType: 'RECHECK',
          net: '780.00',
          rateClass: 'NRF',
          cancellationPolicies: [],
        }),
      ],
    },
  ],
};

const FIXTURES_BY_DESTINATION: Record<string, HotelbedsHotel[]> = {
  MCO: [HOTEL_MCO_BOOKABLE, HOTEL_MCO_RECHECK],
};

// After a successful checkrate, the recheck rate gets a new rateKey and a
// slightly higher price (Hotelbeds simulates this; we mimic it).
const RECHECK_REPRICED: Record<string, HotelbedsRate> = {
  'mock-mco-recheck-1': makeRate({
    rateKey: 'mock-mco-recheck-1-repriced',
    rateType: 'BOOKABLE',
    net: '795.00',
    rateClass: 'NRF',
    cancellationPolicies: [],
  }),
};

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------

export class MockHotelbedsAdapter implements HotelSourceAdapter {
  readonly adapterId = 'hotelbeds';
  readonly adapterName = 'Hotelbeds (mock)';

  private available = true;
  private readonly bookings = new Map<string, HotelbedsBooking>();
  private nextRef = 1;

  setAvailable(available: boolean): void {
    this.available = available;
  }

  // -------------------------------------------------------------------------
  // HotelSourceAdapter
  // -------------------------------------------------------------------------

  async searchHotels(params: HotelSearchParams): Promise<RawHotelResult[]> {
    if (!this.available) {
      throw new Error('Hotelbeds (mock) is not available');
    }
    const hotels = FIXTURES_BY_DESTINATION[params.destination.toUpperCase()] ?? [];
    return hotels.map((h) =>
      mapHotelToRawResult(h, {
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        responseLatencyMs: 1,
      }),
    );
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  // -------------------------------------------------------------------------
  // Hotels API surface
  // -------------------------------------------------------------------------

  async availability(request: HotelbedsAvailabilityRequest): Promise<HotelbedsAvailabilityResponse> {
    this.assertAvailable();
    const code = request.destination?.code?.toUpperCase();
    const hotels = code ? (FIXTURES_BY_DESTINATION[code] ?? []) : [];
    return {
      hotels: {
        hotels,
        checkIn: request.stay.checkIn,
        checkOut: request.stay.checkOut,
        total: hotels.length,
      },
    };
  }

  async checkRate(request: HotelbedsCheckRateRequest): Promise<HotelbedsCheckRateResponse> {
    this.assertAvailable();
    const room = request.rooms[0];
    if (!room) {
      throw new Error('Hotelbeds (mock) checkrate requires at least one room');
    }
    const repriced = RECHECK_REPRICED[room.rateKey];
    if (repriced) {
      return {
        hotel: {
          ...HOTEL_MCO_RECHECK,
          rooms: [{ code: 'SUITE.ST', name: 'JUNIOR SUITE', rates: [repriced] }],
        },
      };
    }
    // BOOKABLE rate echoed back unchanged.
    const sourceHotel = HOTEL_MCO_BOOKABLE.rooms?.[0]?.rates?.find((r) => r.rateKey === room.rateKey);
    if (!sourceHotel) {
      throw new Error(`Hotelbeds (mock) checkrate: unknown rateKey ${room.rateKey}`);
    }
    return {
      hotel: {
        ...HOTEL_MCO_BOOKABLE,
        rooms: [{ code: 'STD.ST', name: 'STANDARD ROOM', rates: [sourceHotel] }],
      },
    };
  }

  async book(request: HotelbedsBookingRequest): Promise<HotelbedsBookingResponse> {
    this.assertAvailable();
    const reference = `MOCK-HB-${String(this.nextRef++).padStart(6, '0')}`;
    const booking: HotelbedsBooking = {
      reference,
      clientReference: request.clientReference,
      creationDate: new Date().toISOString(),
      status: 'CONFIRMED',
      holder: request.holder,
      totalNet: '610.00',
      currency: 'USD',
      hotel: HOTEL_MCO_BOOKABLE,
    };
    this.bookings.set(reference, booking);
    return { booking };
  }

  async getBooking(reference: string): Promise<HotelbedsBookingResponse> {
    this.assertAvailable();
    const booking = this.bookings.get(reference);
    if (!booking) {
      throw new Error(`Hotelbeds (mock) getBooking: unknown reference ${reference}`);
    }
    return { booking };
  }

  async listBookings(): Promise<HotelbedsBookingListResponse> {
    this.assertAvailable();
    return { bookings: Array.from(this.bookings.values()) };
  }

  async cancelBooking(
    reference: string,
    flag: HotelbedsCancellationFlag = 'SIMULATION',
  ): Promise<HotelbedsCancellationResponse> {
    this.assertAvailable();
    const booking = this.bookings.get(reference);
    if (!booking) {
      throw new Error(`Hotelbeds (mock) cancelBooking: unknown reference ${reference}`);
    }
    if (flag === 'SIMULATION') {
      return {
        booking: { ...booking, cancellationReference: `SIM-${reference}` },
      };
    }
    const cancelled: HotelbedsBooking = {
      ...booking,
      status: 'CANCELLED',
      cancellationReference: `CXL-${reference}`,
    };
    this.bookings.set(reference, cancelled);
    return { booking: cancelled };
  }

  async availabilityRawResults(
    request: HotelbedsAvailabilityRequest,
  ): Promise<RawHotelResult[]> {
    const response = await this.availability(request);
    const hotels = response.hotels?.hotels ?? [];
    return hotels.map((h) =>
      mapHotelToRawResult(h, {
        checkIn: request.stay.checkIn,
        checkOut: request.stay.checkOut,
        responseLatencyMs: 1,
      }),
    );
  }

  async bookSummary(request: HotelbedsBookingRequest): Promise<BookingSummary | null> {
    const response = await this.book(request);
    if (!response.booking) return null;
    return summarizeBooking(response.booking);
  }

  // -------------------------------------------------------------------------

  private assertAvailable(): void {
    if (!this.available) {
      throw new Error('Hotelbeds (mock) is not available');
    }
  }
}
