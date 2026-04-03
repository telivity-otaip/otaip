/**
 * Agent 4.1 — Hotel Search Aggregator
 *
 * Multi-source hotel availability search across GDS hotel segments,
 * direct APIs (Amadeus Hotel, Hotelbeds, Duffel Stays), and channel manager feeds.
 * Returns raw, unmerged results from all connected sources.
 *
 * Downstream: Feeds Agent 4.2 (Property Deduplication) and Agent 4.4 (Rate Comparison)
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  AgentHealthStatus,
} from '@otaip/core';
import {
  AgentNotInitializedError,
  AgentInputValidationError,
} from '@otaip/core';
import type { HotelSearchInput, HotelSearchOutput } from './types.js';
import type { HotelSourceAdapter } from './adapters/base-adapter.js';
import { MockAmadeusHotelAdapter } from './adapters/amadeus-hotel.js';
import { MockHotelbedsAdapter } from './adapters/hotelbeds.js';
import { MockDuffelStaysAdapter } from './adapters/duffel-stays.js';
import { aggregateSearch } from './search-aggregator.js';

const DEFAULT_TIMEOUT_MS = 5000;

let searchCounter = 0;
function generateSearchId(): string {
  searchCounter += 1;
  return `search-${Date.now()}-${searchCounter}`;
}

export interface HotelSearchAggregatorOptions {
  /** Custom adapters (overrides defaults). If omitted, uses mock adapters. */
  adapters?: HotelSourceAdapter[];
}

export class HotelSearchAggregatorAgent
  implements Agent<HotelSearchInput, HotelSearchOutput>
{
  readonly id = '4.1';
  readonly name = 'Hotel Search Aggregator';
  readonly version = '0.1.0';

  private initialized = false;
  private adapters: HotelSourceAdapter[] = [];
  private readonly customAdapters?: HotelSourceAdapter[];

  constructor(options?: HotelSearchAggregatorOptions) {
    this.customAdapters = options?.adapters;
  }

  async initialize(): Promise<void> {
    if (this.customAdapters) {
      this.adapters = this.customAdapters;
    } else {
      this.adapters = [
        new MockAmadeusHotelAdapter(),
        new MockHotelbedsAdapter(),
        new MockDuffelStaysAdapter(),
      ];
    }
    this.initialized = true;
  }

  async execute(
    input: AgentInput<HotelSearchInput>,
  ): Promise<AgentOutput<HotelSearchOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const timeoutMs = input.data.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Filter adapters if specific IDs requested
    let activeAdapters = this.adapters;
    if (input.data.adapterIds && input.data.adapterIds.length > 0) {
      activeAdapters = this.adapters.filter((a) =>
        input.data.adapterIds!.includes(a.adapterId),
      );
    }

    const result = await aggregateSearch(
      activeAdapters,
      {
        destination: input.data.destination,
        checkIn: input.data.checkIn,
        checkOut: input.data.checkOut,
        rooms: input.data.rooms,
        adults: input.data.adults,
        children: input.data.children,
        currency: input.data.currency,
      },
      timeoutMs,
    );

    const warnings: string[] = [];
    for (const ar of result.adapterResults) {
      if (ar.timedOut) {
        warnings.push(`Adapter ${ar.adapterName} timed out after ${ar.responseTimeMs}ms`);
      }
      if (ar.error) {
        warnings.push(`Adapter ${ar.adapterName} error: ${ar.error}`);
      }
    }

    const searchId = generateSearchId();

    return {
      data: {
        properties: result.properties,
        totalResults: result.properties.length,
        adapterResults: result.adapterResults,
        partialResults: result.partialResults,
        searchId,
      },
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        adapters_queried: activeAdapters.length,
        search_id: searchId,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }

    if (this.adapters.length === 0) {
      return { status: 'degraded', details: 'No adapters registered.' };
    }

    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
    this.adapters = [];
  }

  private validateInput(data: HotelSearchInput): void {
    if (!data.destination || data.destination.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'destination', 'Destination is required');
    }
    if (!data.checkIn) {
      throw new AgentInputValidationError(this.id, 'checkIn', 'Check-in date is required');
    }
    if (!data.checkOut) {
      throw new AgentInputValidationError(this.id, 'checkOut', 'Check-out date is required');
    }
    if (data.checkIn >= data.checkOut) {
      throw new AgentInputValidationError(this.id, 'checkOut', 'Check-out date must be after check-in date');
    }
    if (!data.rooms || data.rooms < 1) {
      throw new AgentInputValidationError(this.id, 'rooms', 'At least 1 room is required');
    }
    if (!data.adults || data.adults < 1) {
      throw new AgentInputValidationError(this.id, 'adults', 'At least 1 adult is required');
    }
  }
}

export type { HotelSearchInput, HotelSearchOutput, AdapterResult } from './types.js';
export type { HotelSourceAdapter, HotelSearchParams } from './adapters/base-adapter.js';
export { MockAmadeusHotelAdapter } from './adapters/amadeus-hotel.js';
export { MockHotelbedsAdapter } from './adapters/hotelbeds.js';
export { MockDuffelStaysAdapter } from './adapters/duffel-stays.js';
