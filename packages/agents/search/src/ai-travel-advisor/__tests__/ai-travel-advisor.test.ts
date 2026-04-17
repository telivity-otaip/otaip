import { describe, it, expect } from 'vitest';
import type { DistributionAdapter, SearchOffer, SearchRequest, SearchResponse } from '@otaip/core';
import { AvailabilitySearch } from '../../availability-search/index.js';
import { AITravelAdvisorAgent } from '../index.js';
import type { AdvisorInput } from '../types.js';

// ───────────────────────────────────────────────────────────────────────────
// Test fixtures
// ───────────────────────────────────────────────────────────────────────────

let flightNumberCounter = 100;
function nextFlightNumber(): string {
  flightNumberCounter++;
  return String(flightNumberCounter);
}

function makeOffer(opts: {
  id: string;
  carrier?: string;
  price?: number;
  currency?: string;
  departureHour?: number;
  connections?: number;
  cabin?: 'economy' | 'business' | 'first' | 'premium_economy';
  departureDate?: string;
}): SearchOffer {
  const carrier = opts.carrier ?? 'BA';
  const date = opts.departureDate ?? '2026-06-01';
  const hour = opts.departureHour ?? 8;
  const hourStr = hour.toString().padStart(2, '0');
  const flightNumber = nextFlightNumber();

  const segments = [
    {
      carrier,
      flight_number: flightNumber,
      origin: 'JFK',
      destination: opts.connections && opts.connections > 0 ? 'LHR' : 'CDG',
      departure_time: `${date}T${hourStr}:00:00Z`,
      arrival_time: `${date}T${hour + 7}:00:00Z`,
      duration_minutes: 420,
      cabin_class: opts.cabin ?? 'economy',
      stops: 0,
    },
  ];
  if (opts.connections && opts.connections > 0) {
    for (let i = 0; i < opts.connections; i++) {
      segments.push({
        carrier,
        flight_number: nextFlightNumber(),
        origin: 'LHR',
        destination: 'CDG',
        departure_time: `${date}T${(hour + 8 + i).toString().padStart(2, '0')}:00:00Z`,
        arrival_time: `${date}T${(hour + 9 + i).toString().padStart(2, '0')}:30:00Z`,
        duration_minutes: 90,
        cabin_class: opts.cabin ?? 'economy',
        stops: 0,
      });
    }
  }

  return {
    offer_id: opts.id,
    source: 'mock',
    itinerary: {
      source_id: opts.id,
      source: 'mock',
      segments,
      total_duration_minutes: 420 + (opts.connections ?? 0) * 90,
      connection_count: opts.connections ?? 0,
    },
    price: {
      base_fare: (opts.price ?? 400) - 50,
      taxes: 50,
      total: opts.price ?? 400,
      currency: opts.currency ?? 'USD',
    },
  };
}

class MockAdapter implements DistributionAdapter {
  readonly name = 'mock';
  constructor(private readonly offersByDate: Map<string, SearchOffer[]> = new Map()) {}
  static withOffers(offers: SearchOffer[], date = '2026-06-01'): MockAdapter {
    return new MockAdapter(new Map([[date, offers]]));
  }
  static multiDate(offersByDate: Record<string, SearchOffer[]>): MockAdapter {
    return new MockAdapter(new Map(Object.entries(offersByDate)));
  }
  async search(req: SearchRequest): Promise<SearchResponse> {
    const date = req.segments[0]?.departure_date ?? '';
    const offers = this.offersByDate.get(date) ?? [];
    return { offers, truncated: false };
  }
  async isAvailable() {
    return true;
  }
}

async function makeAdvisor(adapter: DistributionAdapter): Promise<AITravelAdvisorAgent> {
  const search = new AvailabilitySearch([adapter]);
  await search.initialize();
  const advisor = new AITravelAdvisorAgent({ availabilitySearch: search });
  await advisor.initialize();
  return advisor;
}

const BASE_INPUT: AdvisorInput = {
  origin: 'JFK',
  destination: 'CDG',
  departureDate: '2026-06-01',
};

// ───────────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────────

describe('AITravelAdvisorAgent (1.8)', () => {
  describe('ranking + scoring', () => {
    it('returns ranked recommendations from a single date', async () => {
      const advisor = await makeAdvisor(
        MockAdapter.withOffers([
          makeOffer({ id: 'a', price: 400 }),
          makeOffer({ id: 'b', price: 600 }),
          makeOffer({ id: 'c', price: 300 }),
        ]),
      );
      const r = await advisor.execute({ data: BASE_INPUT });
      expect(r.data.recommendations).toHaveLength(3);
      expect(r.data.recommendations[0]!.rank).toBe(1);
      expect(r.data.recommendations[2]!.rank).toBe(3);
    });

    it('ranks by composite score descending', async () => {
      const advisor = await makeAdvisor(
        MockAdapter.withOffers([
          makeOffer({ id: 'expensive', price: 900 }),
          makeOffer({ id: 'cheap', price: 200 }),
          makeOffer({ id: 'mid', price: 500 }),
        ]),
      );
      const r = await advisor.execute({ data: BASE_INPUT });
      const scores = r.data.recommendations.map((rec) => rec.score);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1]!).toBeGreaterThanOrEqual(scores[i]!);
      }
    });

    it('cheapest offer wins under leisure weights (price-heavy)', async () => {
      const advisor = await makeAdvisor(
        MockAdapter.withOffers([
          makeOffer({ id: 'cheap', price: 200 }),
          makeOffer({ id: 'expensive', price: 800 }),
        ]),
      );
      const r = await advisor.execute({
        data: { ...BASE_INPUT, preferences: { tripPurpose: 'leisure' } },
      });
      expect(r.data.recommendations[0]!.offer.offer_id).toBe('cheap');
    });

    it('business weights shift priority away from price', async () => {
      // Two offers: cheap but direct at 5am (bad schedule), expensive but
      // at 8am (ideal schedule). Business should prefer the 8am flight.
      const advisor = await makeAdvisor(
        MockAdapter.withOffers([
          makeOffer({ id: 'cheap-redeye', price: 200, departureHour: 5 }),
          makeOffer({ id: 'expensive-morning', price: 700, departureHour: 8 }),
        ]),
      );
      const r = await advisor.execute({
        data: { ...BASE_INPUT, preferences: { tripPurpose: 'business' } },
      });
      expect(r.data.recommendations[0]!.offer.offer_id).toBe('expensive-morning');
    });

    it('default weights apply when tripPurpose unset', async () => {
      const advisor = await makeAdvisor(
        MockAdapter.withOffers([makeOffer({ id: 'only', price: 400 })]),
      );
      const r = await advisor.execute({ data: BASE_INPUT });
      expect(r.data.appliedPreferences.weights.price).toBe(0.4);
    });
  });

  describe('filters', () => {
    it('budgetMax excludes expensive offers before scoring', async () => {
      const advisor = await makeAdvisor(
        MockAdapter.withOffers([
          makeOffer({ id: 'cheap', price: 200 }),
          makeOffer({ id: 'mid', price: 500 }),
          makeOffer({ id: 'expensive', price: 1000 }),
        ]),
      );
      const r = await advisor.execute({
        data: { ...BASE_INPUT, preferences: { budgetMax: 600 } },
      });
      const ids = r.data.recommendations.map((rec) => rec.offer.offer_id);
      expect(ids).not.toContain('expensive');
      expect(ids).toContain('cheap');
      expect(ids).toContain('mid');
    });

    it('budgetMin excludes too-cheap offers (corporate minimum)', async () => {
      const advisor = await makeAdvisor(
        MockAdapter.withOffers([
          makeOffer({ id: 'too-cheap', price: 100 }),
          makeOffer({ id: 'ok', price: 400 }),
        ]),
      );
      const r = await advisor.execute({
        data: { ...BASE_INPUT, preferences: { budgetMin: 200 } },
      });
      expect(r.data.recommendations.map((rec) => rec.offer.offer_id)).toEqual(['ok']);
    });

    it('cabinClass filter excludes mismatches', async () => {
      const advisor = await makeAdvisor(
        MockAdapter.withOffers([
          makeOffer({ id: 'eco', cabin: 'economy' }),
          makeOffer({ id: 'biz', cabin: 'business' }),
        ]),
      );
      const r = await advisor.execute({
        data: { ...BASE_INPUT, preferences: { cabinClass: 'business' } },
      });
      expect(r.data.recommendations.map((rec) => rec.offer.offer_id)).toEqual(['biz']);
    });

    it('preferredAirlines boosts matching offers', async () => {
      const advisor = await makeAdvisor(
        MockAdapter.withOffers([
          makeOffer({ id: 'unknown', carrier: 'UA', price: 400 }),
          makeOffer({ id: 'preferred', carrier: 'BA', price: 400 }),
        ]),
      );
      const r = await advisor.execute({
        data: { ...BASE_INPUT, preferences: { preferredAirlines: ['BA'] } },
      });
      expect(r.data.recommendations[0]!.offer.offer_id).toBe('preferred');
    });

    it('maxConnections = 0 excludes offers with stops', async () => {
      const advisor = await makeAdvisor(
        MockAdapter.withOffers([
          makeOffer({ id: 'direct', connections: 0 }),
          makeOffer({ id: 'one-stop', connections: 1 }),
          makeOffer({ id: 'two-stop', connections: 2 }),
        ]),
      );
      const r = await advisor.execute({
        data: { ...BASE_INPUT, preferences: { maxConnections: 0 } },
      });
      expect(r.data.recommendations.map((rec) => rec.offer.offer_id)).toEqual(['direct']);
    });
  });

  describe('flexible dates', () => {
    it('expands ±3 days when flexibleDates=true', async () => {
      const adapter = MockAdapter.multiDate({
        '2026-05-29': [makeOffer({ id: 'd-3', departureDate: '2026-05-29', price: 500 })],
        '2026-05-30': [makeOffer({ id: 'd-2', departureDate: '2026-05-30', price: 400 })],
        '2026-05-31': [makeOffer({ id: 'd-1', departureDate: '2026-05-31', price: 300 })],
        '2026-06-01': [makeOffer({ id: 'd0', departureDate: '2026-06-01', price: 600 })],
        '2026-06-02': [makeOffer({ id: 'd+1', departureDate: '2026-06-02', price: 700 })],
        '2026-06-03': [makeOffer({ id: 'd+2', departureDate: '2026-06-03', price: 800 })],
        '2026-06-04': [makeOffer({ id: 'd+3', departureDate: '2026-06-04', price: 900 })],
      });
      const advisor = await makeAdvisor(adapter);
      const r = await advisor.execute({ data: { ...BASE_INPUT, flexibleDates: true } });

      expect(r.data.searchSummary.dateRangeSearched).toHaveLength(7);
      expect(r.data.searchSummary.dateRangeSearched).toContain('2026-05-29');
      expect(r.data.searchSummary.dateRangeSearched).toContain('2026-06-04');
      // Cheapest across all days is d-1 at 300
      expect(r.data.recommendations[0]!.offer.offer_id).toBe('d-1');
    });

    it('flexibleDates=false (default) searches only requested date', async () => {
      const advisor = await makeAdvisor(
        MockAdapter.withOffers([makeOffer({ id: 'x' })], '2026-06-01'),
      );
      const r = await advisor.execute({ data: BASE_INPUT });
      expect(r.data.searchSummary.dateRangeSearched).toEqual(['2026-06-01']);
    });
  });

  describe('output shape', () => {
    it('maxRecommendations caps output', async () => {
      const advisor = await makeAdvisor(
        MockAdapter.withOffers([
          makeOffer({ id: 'a' }),
          makeOffer({ id: 'b' }),
          makeOffer({ id: 'c' }),
          makeOffer({ id: 'd' }),
          makeOffer({ id: 'e' }),
        ]),
      );
      const r = await advisor.execute({ data: { ...BASE_INPUT, maxRecommendations: 2 } });
      expect(r.data.recommendations).toHaveLength(2);
    });

    it('zero offers returns empty recommendations with metadata', async () => {
      const advisor = await makeAdvisor(MockAdapter.withOffers([]));
      const r = await advisor.execute({ data: BASE_INPUT });
      expect(r.data.recommendations).toEqual([]);
      expect(r.data.searchSummary.totalOffersFound).toBe(0);
      expect(r.confidence).toBe(0.5);
    });

    it('missing preferences use defaults', async () => {
      const advisor = await makeAdvisor(MockAdapter.withOffers([makeOffer({ id: 'x' })]));
      const r = await advisor.execute({ data: BASE_INPUT });
      expect(r.data.appliedPreferences.passengers).toEqual({ adults: 1, children: 0, infants: 0 });
      expect(r.data.appliedPreferences.maxConnections).toBe(1);
      expect(r.data.appliedPreferences.currency).toBe('USD');
    });

    it('explanation mentions cheapest + direct + preferred airline', async () => {
      const advisor = await makeAdvisor(
        MockAdapter.withOffers([
          makeOffer({ id: 'winner', carrier: 'BA', price: 200, connections: 0 }),
          makeOffer({ id: 'other', carrier: 'UA', price: 500, connections: 1 }),
        ]),
      );
      const r = await advisor.execute({
        data: { ...BASE_INPUT, preferences: { preferredAirlines: ['BA'] } },
      });
      const top = r.data.recommendations[0]!;
      expect(top.explanation).toMatch(/cheapest/i);
      expect(top.explanation).toMatch(/direct/i);
      expect(top.explanation).toMatch(/preferred airline/i);
    });
  });

  describe('validation + lifecycle', () => {
    it('throws on non-IATA origin', async () => {
      const advisor = await makeAdvisor(MockAdapter.withOffers([]));
      await expect(
        advisor.execute({ data: { ...BASE_INPUT, origin: 'JFKK' } }),
      ).rejects.toThrow(/origin/);
    });

    it('throws on same origin/destination', async () => {
      const advisor = await makeAdvisor(MockAdapter.withOffers([]));
      await expect(
        advisor.execute({ data: { ...BASE_INPUT, destination: 'JFK' } }),
      ).rejects.toThrow(/destination/);
    });

    it('throws AgentNotInitializedError before initialize', async () => {
      const search = new AvailabilitySearch([MockAdapter.withOffers([])]);
      const advisor = new AITravelAdvisorAgent({ availabilitySearch: search });
      await expect(advisor.execute({ data: BASE_INPUT })).rejects.toThrow(/not been initialized/);
    });

    it('has correct id, name, version', () => {
      const search = new AvailabilitySearch([MockAdapter.withOffers([])]);
      const advisor = new AITravelAdvisorAgent({ availabilitySearch: search });
      expect(advisor.id).toBe('1.8');
      expect(advisor.name).toBe('AI Travel Advisor');
      expect(advisor.version).toBe('0.2.0');
    });
  });
});
