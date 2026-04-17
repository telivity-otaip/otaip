import { describe, expect, it } from 'vitest';
import type {
  DistributionAdapter,
  SearchRequest,
  SearchResponse,
  SearchOffer,
} from '@otaip/core';
import { MultiSearchService } from '../services/multi-search-service.js';

// ============================================================
// TEST HELPERS
// ============================================================

function makeSearchRequest(): SearchRequest {
  return {
    segments: [
      {
        origin: 'JFK',
        destination: 'LAX',
        departure_date: '2026-07-01',
      },
    ],
    passengers: [{ type: 'ADT', count: 1 }],
  };
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

function createMockAdapter(
  name: string,
  offers: SearchOffer[],
  shouldFail = false,
  delayMs = 0,
): DistributionAdapter {
  return {
    name,
    async search(_request: SearchRequest): Promise<SearchResponse> {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      if (shouldFail) {
        throw new Error(`Adapter ${name} failed`);
      }
      return { offers, truncated: false };
    },
    async isAvailable(): Promise<boolean> {
      return !shouldFail;
    },
  };
}

// ============================================================
// TESTS
// ============================================================

describe('MultiSearchService', () => {
  it('single adapter returns results normally', async () => {
    const adapter = createMockAdapter('mock', [
      makeOffer('offer-1', 295, 'mock'),
    ]);
    const service = new MultiSearchService({
      adapters: new Map([['mock', adapter]]),
    });

    const result = await service.search(makeSearchRequest());
    expect(result.offers).toHaveLength(1);
    expect(result.totalFound).toBe(1);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]!.success).toBe(true);
  });

  it('two adapters merge results', async () => {
    const adapter1 = createMockAdapter('source-a', [
      makeOffer('a-1', 295, 'source-a'),
    ]);
    const adapter2 = createMockAdapter('source-b', [
      makeOffer('b-1', 250, 'source-b'),
      makeOffer('b-2', 350, 'source-b'),
    ]);
    const service = new MultiSearchService({
      adapters: new Map([
        ['source-a', adapter1],
        ['source-b', adapter2],
      ]),
    });

    const result = await service.search(makeSearchRequest());
    expect(result.offers).toHaveLength(3);
    expect(result.totalFound).toBe(3);
  });

  it('results include adapterSource field', async () => {
    const adapter = createMockAdapter('duffel', [
      makeOffer('dfl-1', 200, 'duffel'),
    ]);
    const service = new MultiSearchService({
      adapters: new Map([['duffel', adapter]]),
    });

    const result = await service.search(makeSearchRequest());
    expect(result.offers[0]!.adapterSource).toBe('duffel');
  });

  it('failed adapter does not block other results', async () => {
    const good = createMockAdapter('good', [makeOffer('g-1', 200, 'good')]);
    const bad = createMockAdapter('bad', [], true);

    const service = new MultiSearchService({
      adapters: new Map([
        ['good', good],
        ['bad', bad],
      ]),
    });

    const result = await service.search(makeSearchRequest());
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]!.adapterSource).toBe('good');
  });

  it('per-source status shows success/failure', async () => {
    const good = createMockAdapter('good', [makeOffer('g-1', 200, 'good')]);
    const bad = createMockAdapter('bad', [], true);

    const service = new MultiSearchService({
      adapters: new Map([
        ['good', good],
        ['bad', bad],
      ]),
    });

    const result = await service.search(makeSearchRequest());
    const goodSource = result.sources.find((s) => s.adapter === 'good');
    const badSource = result.sources.find((s) => s.adapter === 'bad');
    expect(goodSource!.success).toBe(true);
    expect(goodSource!.offerCount).toBe(1);
    expect(badSource!.success).toBe(false);
    expect(badSource!.error).toContain('bad');
  });

  it('results sorted by price across adapters', async () => {
    const a1 = createMockAdapter('a', [makeOffer('a-1', 300, 'a')]);
    const a2 = createMockAdapter('b', [
      makeOffer('b-1', 100, 'b'),
      makeOffer('b-2', 500, 'b'),
    ]);

    const service = new MultiSearchService({
      adapters: new Map([
        ['a', a1],
        ['b', a2],
      ]),
    });

    const result = await service.search(makeSearchRequest());
    expect(result.offers[0]!.price.total).toBe(100);
    expect(result.offers[1]!.price.total).toBe(300);
    expect(result.offers[2]!.price.total).toBe(500);
  });

  it('timeout does not crash — adapter marked as failed', async () => {
    const slow = createMockAdapter('slow', [makeOffer('s-1', 200, 'slow')], false, 500);
    const fast = createMockAdapter('fast', [makeOffer('f-1', 150, 'fast')]);

    const service = new MultiSearchService({
      adapters: new Map([
        ['slow', slow],
        ['fast', fast],
      ]),
      timeoutMs: 50, // 50ms timeout — slow adapter will exceed
    });

    const result = await service.search(makeSearchRequest());
    // Fast adapter succeeds
    const fastSource = result.sources.find((s) => s.adapter === 'fast');
    expect(fastSource!.success).toBe(true);
    // Slow adapter times out
    const slowSource = result.sources.find((s) => s.adapter === 'slow');
    expect(slowSource!.success).toBe(false);
    expect(slowSource!.error).toContain('timed out');
  });

  it('empty results from all adapters returns empty array', async () => {
    const empty1 = createMockAdapter('empty1', []);
    const empty2 = createMockAdapter('empty2', []);

    const service = new MultiSearchService({
      adapters: new Map([
        ['empty1', empty1],
        ['empty2', empty2],
      ]),
    });

    const result = await service.search(makeSearchRequest());
    expect(result.offers).toHaveLength(0);
    expect(result.totalFound).toBe(0);
    expect(result.sources).toHaveLength(2);
    expect(result.sources.every((s) => s.success)).toBe(true);
  });
});
