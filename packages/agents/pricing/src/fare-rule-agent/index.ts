/**
 * Fare Rule Agent — Agent 2.1
 *
 * Parses ATPCO fare rules (categories 1-20) into human-readable
 * structured format. Uses curated tariff snapshot data.
 *
 * Implements the base Agent interface from @otaip/core.
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
import type { FareRuleInput, FareRuleOutput } from './types.js';
import { lookupFareRules } from './rule-parser.js';

const IATA_CODE_RE = /^[A-Z]{2,3}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class FareRuleAgent
  implements Agent<FareRuleInput, FareRuleOutput>
{
  readonly id = '2.1';
  readonly name = 'Fare Rule Agent';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<FareRuleInput>,
  ): Promise<AgentOutput<FareRuleOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const data = {
      ...input.data,
      fare_basis: input.data.fare_basis.toUpperCase().trim(),
      carrier: input.data.carrier.toUpperCase().trim(),
      origin: input.data.origin.toUpperCase().trim(),
      destination: input.data.destination.toUpperCase().trim(),
    };

    const result = lookupFareRules(data);

    const warnings: string[] = [];
    if (result.in_blackout === true) {
      warnings.push('Travel date falls within a blackout period.');
    }
    if (result.valid_for_date === false) {
      warnings.push('Fare rule is not valid for the specified travel date.');
    }

    return {
      data: result,
      confidence: result.total_rules > 0 ? 1.0 : 0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        rules_found: result.total_rules,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
  }

  private validateInput(data: FareRuleInput): void {
    if (!data.fare_basis || typeof data.fare_basis !== 'string' || data.fare_basis.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'fare_basis', 'Required non-empty string.');
    }

    if (data.fare_basis.trim().length > 15) {
      throw new AgentInputValidationError(this.id, 'fare_basis', 'Must be <= 15 characters.');
    }

    if (!data.carrier || !IATA_CODE_RE.test(data.carrier.trim())) {
      throw new AgentInputValidationError(this.id, 'carrier', 'Must be a 2-3 letter IATA code.');
    }

    if (!data.origin || !IATA_CODE_RE.test(data.origin.trim())) {
      throw new AgentInputValidationError(this.id, 'origin', 'Must be a 2-3 letter IATA code.');
    }

    if (!data.destination || !IATA_CODE_RE.test(data.destination.trim())) {
      throw new AgentInputValidationError(this.id, 'destination', 'Must be a 2-3 letter IATA code.');
    }

    if (data.travel_date !== undefined && !ISO_DATE_RE.test(data.travel_date)) {
      throw new AgentInputValidationError(this.id, 'travel_date', 'Must be ISO 8601 date (YYYY-MM-DD).');
    }

    if (data.categories !== undefined) {
      if (!Array.isArray(data.categories)) {
        throw new AgentInputValidationError(this.id, 'categories', 'Must be an array of numbers.');
      }
      for (const cat of data.categories) {
        if (typeof cat !== 'number' || cat < 1 || cat > 50) {
          throw new AgentInputValidationError(this.id, 'categories', 'Each category must be a number 1-50.');
        }
      }
    }
  }
}

export type {
  FareRuleInput,
  FareRuleOutput,
  FareRuleResult,
  FareRuleCategory,
  PenaltyRule,
  AdvancePurchaseRule,
  MinimumStayRule,
  MaximumStayRule,
  SeasonalityRule,
  BlackoutPeriod,
  MoneyAmount,
} from './types.js';
