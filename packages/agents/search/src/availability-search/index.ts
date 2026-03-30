/**
 * Availability Search — Agent 1.1
 *
 * Queries distribution adapters in parallel, normalizes, deduplicates,
 * filters, and sorts flight availability offers.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  AgentHealthStatus,
  DistributionAdapter,
} from '@otaip/core';
import {
  AgentNotInitializedError,
  AgentInputValidationError,
} from '@otaip/core';
import type {
  AvailabilitySearchInput,
  AvailabilitySearchOutput,
} from './types.js';
import { executeSearch } from './search-engine.js';

const VALID_CABIN_CLASSES = new Set(['economy', 'premium_economy', 'business', 'first']);
const VALID_SORT_FIELDS = new Set(['price', 'duration', 'departure', 'arrival', 'connections']);
const VALID_SORT_ORDERS = new Set(['asc', 'desc']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class AvailabilitySearch
  implements Agent<AvailabilitySearchInput, AvailabilitySearchOutput>
{
  readonly id = '1.1';
  readonly name = 'Availability Search';
  readonly version = '0.1.0';

  private adapters: DistributionAdapter[] = [];
  private initialized = false;

  constructor(private readonly adapterProviders: DistributionAdapter[] = []) {}

  async initialize(): Promise<void> {
    this.adapters = [];
    for (const adapter of this.adapterProviders) {
      const available = await adapter.isAvailable();
      if (available) {
        this.adapters.push(adapter);
      }
    }
    this.initialized = true;
  }

  async execute(
    input: AgentInput<AvailabilitySearchInput>,
  ): Promise<AgentOutput<AvailabilitySearchOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = await executeSearch(input.data, this.adapters);

    const warnings: string[] = [];
    if (this.adapters.length === 0) {
      warnings.push('No distribution adapters available. Results may be empty.');
    }

    const failedSources = result.source_status.filter((s) => !s.success);
    for (const failed of failedSources) {
      warnings.push(`Adapter "${failed.source}" failed: ${failed.error ?? 'unknown error'}`);
    }

    return {
      data: result,
      confidence: result.offers.length > 0 ? 1.0 : 0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        adapter_count: this.adapters.length,
        total_raw_offers: result.total_raw_offers,
        deduplicated_count: result.offers.length,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }

    if (this.adapters.length === 0) {
      return { status: 'degraded', details: 'No distribution adapters available.' };
    }

    return { status: 'healthy' };
  }

  destroy(): void {
    this.adapters = [];
    this.initialized = false;
  }

  private validateInput(data: AvailabilitySearchInput): void {
    if (!data.origin || typeof data.origin !== 'string' || data.origin.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'origin', 'Required non-empty string.');
    }

    if (!data.destination || typeof data.destination !== 'string' || data.destination.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'destination', 'Required non-empty string.');
    }

    if (data.origin.trim().toUpperCase() === data.destination.trim().toUpperCase()) {
      throw new AgentInputValidationError(this.id, 'destination', 'Origin and destination must be different.');
    }

    if (!data.departure_date || !ISO_DATE_RE.test(data.departure_date)) {
      throw new AgentInputValidationError(this.id, 'departure_date', 'Required ISO 8601 date (YYYY-MM-DD).');
    }

    if (data.return_date !== undefined && !ISO_DATE_RE.test(data.return_date)) {
      throw new AgentInputValidationError(this.id, 'return_date', 'Must be ISO 8601 date (YYYY-MM-DD).');
    }

    if (!data.passengers || !Array.isArray(data.passengers) || data.passengers.length === 0) {
      throw new AgentInputValidationError(this.id, 'passengers', 'At least one passenger required.');
    }

    if (data.cabin_class !== undefined && !VALID_CABIN_CLASSES.has(data.cabin_class)) {
      throw new AgentInputValidationError(this.id, 'cabin_class', `Must be one of: ${[...VALID_CABIN_CLASSES].join(', ')}`);
    }

    if (data.sort_by !== undefined && !VALID_SORT_FIELDS.has(data.sort_by)) {
      throw new AgentInputValidationError(this.id, 'sort_by', `Must be one of: ${[...VALID_SORT_FIELDS].join(', ')}`);
    }

    if (data.sort_order !== undefined && !VALID_SORT_ORDERS.has(data.sort_order)) {
      throw new AgentInputValidationError(this.id, 'sort_order', 'Must be "asc" or "desc".');
    }

    if (data.max_connections !== undefined && (data.max_connections < 0 || data.max_connections > 5)) {
      throw new AgentInputValidationError(this.id, 'max_connections', 'Must be between 0 and 5.');
    }

    if (data.max_results !== undefined && (data.max_results < 1 || data.max_results > 200)) {
      throw new AgentInputValidationError(this.id, 'max_results', 'Must be between 1 and 200.');
    }
  }
}

export type { AvailabilitySearchInput, AvailabilitySearchOutput, SourceStatus, CabinClass, SortField, SortOrder } from './types.js';
