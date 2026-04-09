import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MultiSourceAggregatorAgent } from '../index.js';
import type { MultiSourceInput, AdapterSearchResult, SearchResult } from '../types.js';

let agent: MultiSourceAggregatorAgent;
beforeAll(async () => {
  agent = new MultiSourceAggregatorAgent();
  await agent.initialize();
});
afterAll(() => {
  agent.destroy();
});

function makeFlight(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    carrier: 'BA',
    flightNumber: '115',
    origin: 'LHR',
    destination: 'JFK',
    departureDate: '2026-06-15',
    departureTime: '09:00',
    arrivalTime: '12:00',
    durationMinutes: 480,
    stops: 0,
    price: { amount: '500.00', currency: 'USD' },
    cabin: 'Y',
    ...overrides,
  };
}

function makeAdapter(name: string, flights: SearchResult[], error?: string): AdapterSearchResult {
  return { adapterName: name, results: flights, error, responseTimeMs: 100 };
}

const MULTI_INPUT: MultiSourceInput = {
  results: [
    makeAdapter('GDS', [
      makeFlight({ price: { amount: '500.00', currency: 'USD' } }),
      makeFlight({ flightNumber: '200', price: { amount: '600.00', currency: 'USD' } }),
    ]),
    makeAdapter('NDC', [makeFlight({ price: { amount: '480.00', currency: 'USD' } })]),
  ],
  deduplicationStrategy: 'keep_cheapest',
  rankBy: 'price',
};

describe('MultiSourceAggregatorAgent', () => {
  it('deduplicates with keep_cheapest', async () => {
    const r = await agent.execute({ data: MULTI_INPUT });
    const ba115 = r.data.flights.find((f) => f.flightNumber === '115');
    expect(ba115!.lowestPrice.amount).toBe('480.00');
    expect(ba115!.sources).toContain('GDS');
    expect(ba115!.sources).toContain('NDC');
  });
  it('totalRaw counts all', async () => {
    const r = await agent.execute({ data: MULTI_INPUT });
    expect(r.data.totalRaw).toBe(3);
  });
  it('totalAfterDedup is less', async () => {
    const r = await agent.execute({ data: MULTI_INPUT });
    expect(r.data.totalAfterDedup).toBe(2);
  });
  it('keep_all keeps duplicates', async () => {
    const r = await agent.execute({ data: { ...MULTI_INPUT, deduplicationStrategy: 'keep_all' } });
    expect(r.data.totalAfterDedup).toBe(3);
  });
  it('keep_first keeps first encountered', async () => {
    const r = await agent.execute({
      data: { ...MULTI_INPUT, deduplicationStrategy: 'keep_first' },
    });
    const ba115 = r.data.flights.find((f) => f.flightNumber === '115');
    expect(ba115!.price.amount).toBe('500.00'); // GDS was first
  });
  it('ranks by price ascending', async () => {
    const r = await agent.execute({ data: MULTI_INPUT });
    for (let i = 1; i < r.data.flights.length; i++) {
      expect(Number(r.data.flights[i]!.lowestPrice.amount)).toBeGreaterThanOrEqual(
        Number(r.data.flights[i - 1]!.lowestPrice.amount),
      );
    }
  });
  it('ranks by duration', async () => {
    const input: MultiSourceInput = {
      results: [
        makeAdapter('GDS', [
          makeFlight({ durationMinutes: 600 }),
          makeFlight({ flightNumber: '200', durationMinutes: 300 }),
        ]),
      ],
      deduplicationStrategy: 'keep_cheapest',
      rankBy: 'duration',
    };
    const r = await agent.execute({ data: input });
    expect(r.data.flights[0]!.durationMinutes).toBe(300);
  });
  it('ranks by stops', async () => {
    const input: MultiSourceInput = {
      results: [
        makeAdapter('GDS', [
          makeFlight({ stops: 2 }),
          makeFlight({ flightNumber: '200', stops: 0 }),
        ]),
      ],
      deduplicationStrategy: 'keep_cheapest',
      rankBy: 'stops',
    };
    const r = await agent.execute({ data: input });
    expect(r.data.flights[0]!.stops).toBe(0);
  });
  it('respects maxResults', async () => {
    const r = await agent.execute({ data: { ...MULTI_INPUT, maxResults: 1 } });
    expect(r.data.flights.length).toBe(1);
  });
  it('adapter summary includes all adapters', async () => {
    const r = await agent.execute({ data: MULTI_INPUT });
    expect(r.data.adapterSummary.length).toBe(2);
  });
  it('partial failure: errored adapter included in summary', async () => {
    const input: MultiSourceInput = {
      results: [makeAdapter('GDS', [makeFlight()]), makeAdapter('NDC_FAIL', [], 'Timeout')],
      deduplicationStrategy: 'keep_cheapest',
      rankBy: 'price',
    };
    const r = await agent.execute({ data: input });
    expect(r.data.flights.length).toBe(1);
    expect(r.data.adapterSummary.find((a) => a.adapter === 'NDC_FAIL')?.error).toBe('Timeout');
  });
  it('empty adapters return empty flights', async () => {
    const r = await agent.execute({
      data: { results: [], deduplicationStrategy: 'keep_cheapest', rankBy: 'price' },
    });
    expect(r.data.flights).toHaveLength(0);
  });
  it('allPrices includes all adapter prices', async () => {
    const r = await agent.execute({ data: MULTI_INPUT });
    const ba115 = r.data.flights.find((f) => f.flightNumber === '115');
    expect(ba115!.allPrices.length).toBe(2);
  });
  it('has correct agent id', () => {
    expect(agent.id).toBe('1.6');
  });
  it('reports healthy', async () => {
    expect((await agent.health()).status).toBe('healthy');
  });
  it('throws when not initialized', async () => {
    const u = new MultiSourceAggregatorAgent();
    await expect(u.execute({ data: MULTI_INPUT })).rejects.toThrow('not been initialized');
  });
  it('single adapter single flight works', async () => {
    const input: MultiSourceInput = {
      results: [makeAdapter('GDS', [makeFlight()])],
      deduplicationStrategy: 'keep_cheapest',
      rankBy: 'price',
    };
    const r = await agent.execute({ data: input });
    expect(r.data.flights.length).toBe(1);
  });
  it('different routes are not deduped', async () => {
    const input: MultiSourceInput = {
      results: [
        makeAdapter('GDS', [makeFlight(), makeFlight({ origin: 'CDG', destination: 'LAX' })]),
      ],
      deduplicationStrategy: 'keep_cheapest',
      rankBy: 'price',
    };
    const r = await agent.execute({ data: input });
    expect(r.data.flights.length).toBe(2);
  });
  it('responseTimeMs passed through', async () => {
    const r = await agent.execute({ data: MULTI_INPUT });
    expect(r.data.adapterSummary[0]!.responseTimeMs).toBe(100);
  });
  it('three adapters same flight', async () => {
    const input: MultiSourceInput = {
      results: [
        makeAdapter('A', [makeFlight({ price: { amount: '300.00', currency: 'USD' } })]),
        makeAdapter('B', [makeFlight({ price: { amount: '400.00', currency: 'USD' } })]),
        makeAdapter('C', [makeFlight({ price: { amount: '350.00', currency: 'USD' } })]),
      ],
      deduplicationStrategy: 'keep_cheapest',
      rankBy: 'price',
    };
    const r = await agent.execute({ data: input });
    expect(r.data.flights.length).toBe(1);
    expect(r.data.flights[0]!.lowestPrice.amount).toBe('300.00');
    expect(r.data.flights[0]!.sources.length).toBe(3);
  });
  it('keep_cheapest uses cheapest flight data', async () => {
    const input: MultiSourceInput = {
      results: [
        makeAdapter('A', [makeFlight({ price: { amount: '999.00', currency: 'USD' } })]),
        makeAdapter('B', [makeFlight({ price: { amount: '100.00', currency: 'USD' } })]),
      ],
      deduplicationStrategy: 'keep_cheapest',
      rankBy: 'price',
    };
    const r = await agent.execute({ data: input });
    expect(r.data.flights[0]!.price.amount).toBe('100.00');
  });
  it('adapter count in summary', async () => {
    const r = await agent.execute({ data: MULTI_INPUT });
    expect(r.data.adapterSummary.find((a) => a.adapter === 'GDS')?.count).toBe(2);
    expect(r.data.adapterSummary.find((a) => a.adapter === 'NDC')?.count).toBe(1);
  });
});
