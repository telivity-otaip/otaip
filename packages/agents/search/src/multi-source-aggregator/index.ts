import Decimal from 'decimal.js';
import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  MultiSourceInput,
  MultiSourceOutput,
  NormalizedFlight,
  SearchResult,
} from './types.js';

function dedupKey(f: SearchResult): string {
  return `${f.carrier}-${f.flightNumber}-${f.departureDate}-${f.origin}-${f.destination}`;
}

export class MultiSourceAggregatorAgent implements Agent<MultiSourceInput, MultiSourceOutput> {
  readonly id = '1.6';
  readonly name = 'Multi-Source Aggregator';
  readonly version = '0.1.0';
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(input: AgentInput<MultiSourceInput>): Promise<AgentOutput<MultiSourceOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);
    const d = input.data;
    if (!d.results) throw new AgentInputValidationError(this.id, 'results', 'Required.');

    let totalRaw = 0;
    const grouped = new Map<
      string,
      { flights: Array<{ adapter: string; flight: SearchResult }> }
    >();

    for (const adapter of d.results) {
      for (const flight of adapter.results) {
        totalRaw++;
        const key = dedupKey(flight);
        const group = grouped.get(key) ?? { flights: [] };
        group.flights.push({ adapter: adapter.adapterName, flight });
        grouped.set(key, group);
      }
    }

    let flights: NormalizedFlight[] = [];

    for (const [, group] of grouped) {
      const allPrices = group.flights.map((g) => ({
        adapter: g.adapter,
        amount: g.flight.price.amount,
        currency: g.flight.price.currency,
      }));
      const cheapest = allPrices.reduce((a, b) =>
        new Decimal(a.amount).lessThan(new Decimal(b.amount)) ? a : b,
      );

      if (d.deduplicationStrategy === 'keep_cheapest') {
        const cheapestEntry = group.flights.reduce((a, b) =>
          new Decimal(a.flight.price.amount).lessThan(new Decimal(b.flight.price.amount)) ? a : b,
        );
        flights.push({
          ...cheapestEntry.flight,
          sources: group.flights.map((g) => g.adapter),
          lowestPrice: { amount: cheapest.amount, currency: cheapest.currency },
          allPrices,
        });
      } else if (d.deduplicationStrategy === 'keep_first') {
        const first = group.flights[0]!;
        flights.push({
          ...first.flight,
          sources: group.flights.map((g) => g.adapter),
          lowestPrice: { amount: cheapest.amount, currency: cheapest.currency },
          allPrices,
        });
      } else {
        // keep_all
        for (const entry of group.flights) {
          flights.push({
            ...entry.flight,
            sources: [entry.adapter],
            lowestPrice: { amount: cheapest.amount, currency: cheapest.currency },
            allPrices,
          });
        }
      }
    }

    // Sort
    if (d.rankBy === 'price')
      flights.sort((a, b) =>
        new Decimal(a.lowestPrice.amount).comparedTo(new Decimal(b.lowestPrice.amount)),
      );
    else if (d.rankBy === 'duration') flights.sort((a, b) => a.durationMinutes - b.durationMinutes);
    else if (d.rankBy === 'stops') flights.sort((a, b) => a.stops - b.stops);

    if (d.maxResults && flights.length > d.maxResults) flights = flights.slice(0, d.maxResults);

    const adapterSummary = d.results.map((r) => ({
      adapter: r.adapterName,
      count: r.results.length,
      error: r.error,
      responseTimeMs: r.responseTimeMs,
    }));

    return {
      data: {
        flights,
        totalRaw,
        totalAfterDedup: flights.length,
        adapterSummary,
        rankBy: d.rankBy,
      },
      confidence: 1.0,
      metadata: { agent_id: this.id, totalRaw, totalAfterDedup: flights.length },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }
  destroy(): void {
    this.initialized = false;
  }
}

export type {
  MultiSourceInput,
  MultiSourceOutput,
  NormalizedFlight,
  SearchResult,
  AdapterSearchResult,
  AdapterSummary,
  DeduplicationStrategy,
  RankBy,
} from './types.js';
