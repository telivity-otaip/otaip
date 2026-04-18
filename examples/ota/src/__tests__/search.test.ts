/**
 * Integration tests for the OTAIP Reference OTA.
 *
 * Uses Fastify inject (no real HTTP) with MockDuffelAdapter.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  DistributionAdapter,
  SearchOffer,
  SearchRequest,
  SearchResponse,
} from '@otaip/core';
import { MockDuffelAdapter } from '@otaip/adapter-duffel';
import { buildApp } from '../server.js';
import { MultiSearchService } from '../services/multi-search-service.js';

let app: FastifyInstance;
const mockAdapter = new MockDuffelAdapter();

beforeAll(async () => {
  app = await buildApp({ adapter: mockAdapter, initResolver: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// Search tests
// ---------------------------------------------------------------------------

describe('POST /api/search', () => {
  it('returns offers for a valid search', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.offers).toBeDefined();
    expect(body.offers.length).toBeGreaterThan(0);
    expect(body.totalFound).toBeGreaterThan(0);
  });

  it('returns error for invalid airport code format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFKX',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.details).toContain('origin must be a 3-letter IATA airport code');
  });

  it('returns 400 for missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        // missing destination, date, passengers
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.details.length).toBeGreaterThanOrEqual(2);
  });

  it('returns the correct number of offers for JFK-LAX', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // MockDuffelAdapter has 3 JFK-LAX offers (direct economy, connecting, business)
    expect(body.totalFound).toBe(3);
    expect(body.offers).toHaveLength(3);
  });

  it('includes source attribution', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
      },
    });

    const body = res.json();
    expect(body.sources).toBeDefined();
    expect(body.sources).toContain('duffel');
  });

  it('results are sorted by price by default', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
      },
    });

    const body = res.json();
    const prices = body.offers.map(
      (o: { price: { total: number } }) => o.price.total,
    );

    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]!);
    }
  });

  it('search with cabinClass filter works', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
        cabinClass: 'business',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // MockDuffelAdapter has 1 business class JFK-LAX offer
    expect(body.offers.length).toBe(1);
    expect(body.offers[0].itinerary.segments[0].cabin_class).toBe('business');
  });
});

// ---------------------------------------------------------------------------
// Offer tests
// ---------------------------------------------------------------------------

describe('GET /api/offers/:id', () => {
  it('returns offer details for a valid ID after search', async () => {
    // First, search to populate the cache
    await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/offers/mock-duffel-jfk-lax-1',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.offer).toBeDefined();
    expect(body.offer.offer_id).toBe('mock-duffel-jfk-lax-1');
    expect(body.fareRules).toBeDefined();
  });

  it('returns 404 for an unknown offer ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/offers/nonexistent-offer-id',
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toContain('Offer not found');
  });
});

// ---------------------------------------------------------------------------
// Health test
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.agents).toBeDefined();
    expect(body.agents.initialized).toBe(true);
    expect(body.adapter).toBe('duffel');
  });
});

// ---------------------------------------------------------------------------
// Sprint H multi-adapter integration tests — cover the 3 bugs Codex found:
//   1) buildApp() never wired multiSearchService into the search route
//   2) multi=true branch bypassed the SearchService offer cache (follow-up
//      GET /api/offers/:id 404'd; BookingService.createBooking likewise)
//   3) multi=true branch dropped body.returnDate (round-trip collapsed to
//      one-way before hitting the adapters)
// ---------------------------------------------------------------------------

interface RecordingAdapter extends DistributionAdapter {
  lastRequest: SearchRequest | null;
}

function makeOffer(id: string, total: number, source: string): SearchOffer {
  return {
    offer_id: id,
    source,
    itinerary: {
      source_id: `itin-${id}`,
      source,
      segments: [
        {
          carrier: 'UA',
          flight_number: '100',
          origin: 'JFK',
          destination: 'LAX',
          departure_time: '2026-07-01T08:00:00-04:00',
          arrival_time: '2026-07-01T11:30:00-07:00',
          duration_minutes: 330,
          stops: 0,
        },
      ],
      total_duration_minutes: 330,
      connection_count: 0,
    },
    price: {
      base_fare: total - 45,
      taxes: 45,
      total,
      currency: 'USD',
      per_passenger: [{ type: 'ADT', base_fare: total - 45, taxes: 45, total }],
    },
    fare_basis: ['Y26NR'],
    booking_classes: ['Y'],
    instant_ticketing: true,
  };
}

function createRecordingAdapter(name: string, offers: SearchOffer[]): RecordingAdapter {
  const stub: RecordingAdapter = {
    name,
    lastRequest: null,
    async search(request: SearchRequest): Promise<SearchResponse> {
      stub.lastRequest = request;
      return { offers, truncated: false };
    },
    async isAvailable(): Promise<boolean> {
      return true;
    },
  };
  return stub;
}

describe('POST /api/search?multi=true — Sprint H bugfixes', () => {
  let multiApp: FastifyInstance;
  let adapterA: RecordingAdapter;
  let adapterB: RecordingAdapter;

  beforeAll(async () => {
    adapterA = createRecordingAdapter('source-a', [
      makeOffer('offer-a-1', 250, 'source-a'),
      makeOffer('offer-a-2', 400, 'source-a'),
    ]);
    adapterB = createRecordingAdapter('source-b', [
      makeOffer('offer-b-1', 175, 'source-b'),
    ]);
    const multiSearch = new MultiSearchService({
      adapters: new Map<string, DistributionAdapter>([
        ['source-a', adapterA],
        ['source-b', adapterB],
      ]),
    });
    multiApp = await buildApp({
      adapter: new MockDuffelAdapter(),
      initResolver: false,
      multiSearch,
    });
    await multiApp.ready();
  });

  afterAll(async () => {
    await multiApp.close();
  });

  // Bug 1 — multiSearch is actually reachable
  it('routes ?multi=true to the aggregated multi-search response', async () => {
    const res = await multiApp.inject({
      method: 'POST',
      url: '/api/search?multi=true',
      payload: { origin: 'JFK', destination: 'LAX', date: '2026-07-01', passengers: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalFound).toBe(3);
    expect(body.offers).toHaveLength(3);
    // Aggregated shape: sources is an array of per-adapter status records.
    expect(Array.isArray(body.sources)).toBe(true);
    expect(body.sources[0]).toHaveProperty('adapter');
    expect(body.sources[0]).toHaveProperty('success');
  });

  // Bug 1 — single-adapter path is NOT routed through MultiSearchService when
  // `multi=true` is absent. (Response shape divergence proves the branch.)
  it('leaves single-adapter search untouched when multi=true is not set', async () => {
    const res = await multiApp.inject({
      method: 'POST',
      url: '/api/search',
      payload: { origin: 'JFK', destination: 'LAX', date: '2026-07-01', passengers: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Single-adapter path returns `sources: string[]` (unique source names).
    expect(Array.isArray(body.sources)).toBe(true);
    if (body.sources.length > 0) {
      expect(typeof body.sources[0]).toBe('string');
    }
  });

  // Bug 2 — multi-search offers are cached so detail lookup doesn't 404
  it('caches multi-search offers for GET /api/offers/:id', async () => {
    const searchRes = await multiApp.inject({
      method: 'POST',
      url: '/api/search?multi=true',
      payload: { origin: 'JFK', destination: 'LAX', date: '2026-07-01', passengers: 1 },
    });
    expect(searchRes.statusCode).toBe(200);
    const offers = searchRes.json().offers as Array<{ offer_id: string; adapterSource: string }>;
    const firstOfferId = offers[0]!.offer_id;

    const detailRes = await multiApp.inject({
      method: 'GET',
      url: `/api/offers/${firstOfferId}`,
    });
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json().offer.offer_id).toBe(firstOfferId);
  });

  // Bug 2 — offers from ANY aggregated adapter are retrievable (not just the
  // first one). A plausible regression would only cache one adapter's offers.
  it('caches offers from every aggregated adapter, not just the first', async () => {
    await multiApp.inject({
      method: 'POST',
      url: '/api/search?multi=true',
      payload: { origin: 'JFK', destination: 'LAX', date: '2026-07-01', passengers: 1 },
    });
    const detailA = await multiApp.inject({ method: 'GET', url: '/api/offers/offer-a-2' });
    const detailB = await multiApp.inject({ method: 'GET', url: '/api/offers/offer-b-1' });
    expect(detailA.statusCode).toBe(200);
    expect(detailB.statusCode).toBe(200);
  });

  // Bug 3 — round-trip request reaches adapters with 2 segments
  it('forwards returnDate as a second segment on the multi-adapter path', async () => {
    const res = await multiApp.inject({
      method: 'POST',
      url: '/api/search?multi=true',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2026-07-01',
        returnDate: '2026-07-08',
        passengers: 2,
      },
    });
    expect(res.statusCode).toBe(200);
    // Each aggregated adapter must have received the full round-trip.
    for (const adapter of [adapterA, adapterB]) {
      expect(adapter.lastRequest).not.toBeNull();
      expect(adapter.lastRequest!.segments).toHaveLength(2);
      expect(adapter.lastRequest!.segments[0]).toEqual({
        origin: 'JFK',
        destination: 'LAX',
        departure_date: '2026-07-01',
      });
      expect(adapter.lastRequest!.segments[1]).toEqual({
        origin: 'LAX',
        destination: 'JFK',
        departure_date: '2026-07-08',
      });
      expect(adapter.lastRequest!.passengers[0]!.count).toBe(2);
    }
  });

  // Bug 3 — one-way request still forwards only one segment (no regression)
  it('forwards a single segment when returnDate is absent', async () => {
    adapterA.lastRequest = null;
    adapterB.lastRequest = null;
    const res = await multiApp.inject({
      method: 'POST',
      url: '/api/search?multi=true',
      payload: { origin: 'JFK', destination: 'LAX', date: '2026-07-01', passengers: 1 },
    });
    expect(res.statusCode).toBe(200);
    for (const adapter of [adapterA, adapterB]) {
      expect(adapter.lastRequest!.segments).toHaveLength(1);
    }
  });
});
