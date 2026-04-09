/**
 * Mock Duffel Adapter — realistic test data for Stage 1 agent tests.
 *
 * Returns pre-built flight offers for known city pairs.
 * TODO: [FUTURE] Replace with real Duffel API integration.
 */

import type {
  DistributionAdapter,
  SearchRequest,
  SearchResponse,
  SearchOffer,
  FlightSegment,
  PriceRequest,
  PriceResponse,
} from '@otaip/core';

// ---------------------------------------------------------------------------
// Mock flight data
// ---------------------------------------------------------------------------

interface MockRoute {
  origin: string;
  destination: string;
  offers: SearchOffer[];
}

function makeSegment(
  partial: Partial<FlightSegment> & {
    carrier: string;
    flight_number: string;
    origin: string;
    destination: string;
    departure_time: string;
    arrival_time: string;
    duration_minutes: number;
  },
): FlightSegment {
  return {
    operating_carrier: undefined,
    aircraft: undefined,
    booking_class: undefined,
    cabin_class: undefined,
    stops: 0,
    ...partial,
  };
}

const JFK_LAX_DIRECT: SearchOffer = {
  offer_id: 'mock-duffel-jfk-lax-1',
  source: 'duffel',
  itinerary: {
    source_id: 'duffel-itin-1',
    source: 'duffel',
    segments: [
      makeSegment({
        carrier: 'UA',
        flight_number: '1234',
        origin: 'JFK',
        destination: 'LAX',
        departure_time: '2025-06-15T08:00:00-04:00',
        arrival_time: '2025-06-15T11:30:00-07:00',
        duration_minutes: 330,
        aircraft: '787-9',
        booking_class: 'Y',
        cabin_class: 'economy',
      }),
    ],
    total_duration_minutes: 330,
    connection_count: 0,
  },
  price: {
    base_fare: 250,
    taxes: 45,
    total: 295,
    currency: 'USD',
    per_passenger: [{ type: 'ADT', base_fare: 250, taxes: 45, total: 295 }],
  },
  fare_basis: ['Y26NR'],
  booking_classes: ['Y'],
  instant_ticketing: true,
  expires_at: '2025-06-14T23:59:59Z',
};

const JFK_LAX_CONNECTING: SearchOffer = {
  offer_id: 'mock-duffel-jfk-lax-2',
  source: 'duffel',
  itinerary: {
    source_id: 'duffel-itin-2',
    source: 'duffel',
    segments: [
      makeSegment({
        carrier: 'UA',
        flight_number: '456',
        origin: 'JFK',
        destination: 'ORD',
        departure_time: '2025-06-15T07:00:00-04:00',
        arrival_time: '2025-06-15T08:30:00-05:00',
        duration_minutes: 150,
        aircraft: 'A320',
        booking_class: 'B',
        cabin_class: 'economy',
      }),
      makeSegment({
        carrier: 'UA',
        flight_number: '789',
        origin: 'ORD',
        destination: 'LAX',
        departure_time: '2025-06-15T10:00:00-05:00',
        arrival_time: '2025-06-15T12:15:00-07:00',
        duration_minutes: 255,
        aircraft: '737-900',
        booking_class: 'B',
        cabin_class: 'economy',
      }),
    ],
    total_duration_minutes: 495,
    connection_count: 1,
  },
  price: {
    base_fare: 180,
    taxes: 38,
    total: 218,
    currency: 'USD',
    per_passenger: [{ type: 'ADT', base_fare: 180, taxes: 38, total: 218 }],
  },
  fare_basis: ['B14NR'],
  booking_classes: ['B', 'B'],
  instant_ticketing: true,
  expires_at: '2025-06-14T23:59:59Z',
};

const JFK_LAX_BUSINESS: SearchOffer = {
  offer_id: 'mock-duffel-jfk-lax-3',
  source: 'duffel',
  itinerary: {
    source_id: 'duffel-itin-3',
    source: 'duffel',
    segments: [
      makeSegment({
        carrier: 'DL',
        flight_number: '100',
        origin: 'JFK',
        destination: 'LAX',
        departure_time: '2025-06-15T09:00:00-04:00',
        arrival_time: '2025-06-15T12:20:00-07:00',
        duration_minutes: 320,
        aircraft: 'A330-900',
        booking_class: 'J',
        cabin_class: 'business',
      }),
    ],
    total_duration_minutes: 320,
    connection_count: 0,
  },
  price: {
    base_fare: 1200,
    taxes: 95,
    total: 1295,
    currency: 'USD',
    per_passenger: [{ type: 'ADT', base_fare: 1200, taxes: 95, total: 1295 }],
  },
  fare_basis: ['J'],
  booking_classes: ['J'],
  instant_ticketing: true,
  expires_at: '2025-06-14T23:59:59Z',
};

const LHR_CDG_DIRECT: SearchOffer = {
  offer_id: 'mock-duffel-lhr-cdg-1',
  source: 'duffel',
  itinerary: {
    source_id: 'duffel-itin-4',
    source: 'duffel',
    segments: [
      makeSegment({
        carrier: 'BA',
        flight_number: '304',
        origin: 'LHR',
        destination: 'CDG',
        departure_time: '2025-06-15T10:00:00+01:00',
        arrival_time: '2025-06-15T12:15:00+02:00',
        duration_minutes: 75,
        aircraft: 'A320',
        booking_class: 'Y',
        cabin_class: 'economy',
      }),
    ],
    total_duration_minutes: 75,
    connection_count: 0,
  },
  price: {
    base_fare: 120,
    taxes: 55,
    total: 175,
    currency: 'GBP',
    per_passenger: [{ type: 'ADT', base_fare: 120, taxes: 55, total: 175 }],
  },
  fare_basis: ['YOW'],
  booking_classes: ['Y'],
  instant_ticketing: true,
};

const SFO_NRT_DIRECT: SearchOffer = {
  offer_id: 'mock-duffel-sfo-nrt-1',
  source: 'duffel',
  itinerary: {
    source_id: 'duffel-itin-5',
    source: 'duffel',
    segments: [
      makeSegment({
        carrier: 'NH',
        flight_number: '7',
        origin: 'SFO',
        destination: 'NRT',
        departure_time: '2025-06-15T11:00:00-07:00',
        arrival_time: '2025-06-16T14:00:00+09:00',
        duration_minutes: 660,
        aircraft: '787-10',
        booking_class: 'Y',
        cabin_class: 'economy',
      }),
    ],
    total_duration_minutes: 660,
    connection_count: 0,
  },
  price: {
    base_fare: 850,
    taxes: 120,
    total: 970,
    currency: 'USD',
    per_passenger: [{ type: 'ADT', base_fare: 850, taxes: 120, total: 970 }],
  },
  fare_basis: ['V14NR'],
  booking_classes: ['V'],
  instant_ticketing: true,
};

const MOCK_ROUTES: MockRoute[] = [
  {
    origin: 'JFK',
    destination: 'LAX',
    offers: [JFK_LAX_DIRECT, JFK_LAX_CONNECTING, JFK_LAX_BUSINESS],
  },
  { origin: 'LHR', destination: 'CDG', offers: [LHR_CDG_DIRECT] },
  { origin: 'SFO', destination: 'NRT', offers: [SFO_NRT_DIRECT] },
];

// ---------------------------------------------------------------------------
// MockDuffelAdapter
// ---------------------------------------------------------------------------

export class MockDuffelAdapter implements DistributionAdapter {
  readonly name = 'duffel';

  private available = true;

  /** Set adapter availability for testing error scenarios */
  setAvailable(available: boolean): void {
    this.available = available;
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    if (!this.available) {
      throw new Error('Duffel adapter is not available');
    }

    const firstSegment = request.segments[0];
    if (!firstSegment) {
      return { offers: [], truncated: false };
    }

    const route = MOCK_ROUTES.find(
      (r) => r.origin === firstSegment.origin && r.destination === firstSegment.destination,
    );

    if (!route) {
      return { offers: [], truncated: false };
    }

    let offers = [...route.offers];

    // Filter by cabin class if specified
    if (request.cabin_class) {
      offers = offers.filter((o) =>
        o.itinerary.segments.some((s) => s.cabin_class === request.cabin_class),
      );
    }

    // Filter direct only
    if (request.direct_only) {
      offers = offers.filter((o) => o.itinerary.connection_count === 0);
    }

    // Filter max connections
    if (request.max_connections !== undefined) {
      offers = offers.filter((o) => o.itinerary.connection_count <= request.max_connections!);
    }

    return {
      offers,
      truncated: false,
      metadata: { source: 'mock-duffel', route_count: MOCK_ROUTES.length },
    };
  }

  async price(request: PriceRequest): Promise<PriceResponse> {
    if (!this.available) {
      throw new Error('Duffel adapter is not available');
    }

    // Find the offer across all routes
    for (const route of MOCK_ROUTES) {
      const offer = route.offers.find((o) => o.offer_id === request.offer_id);
      if (offer) {
        return {
          price: offer.price,
          available: true,
          expires_at: offer.expires_at,
        };
      }
    }

    return {
      price: { base_fare: 0, taxes: 0, total: 0, currency: request.currency ?? 'USD' },
      available: false,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }
}
