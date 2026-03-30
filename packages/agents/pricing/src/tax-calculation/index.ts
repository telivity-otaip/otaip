/**
 * Tax Calculation — Agent 2.3
 *
 * Per-segment tax computation with exemption engine,
 * ~30 countries, ~50 tax codes, currency conversion.
 *
 * ALL financial math uses decimal.js — no floating point for currency.
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
import type { TaxCalculationInput, TaxCalculationOutput, PassengerType, CabinClass } from './types.js';
import { calculateTaxes } from './tax-engine.js';

const IATA_CODE_RE = /^[A-Z]{3}$/i;
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const VALID_PASSENGER_TYPES = new Set<PassengerType>(['adult', 'child', 'infant', 'crew', 'diplomatic']);
const VALID_CABIN_CLASSES = new Set<CabinClass>(['economy', 'premium', 'business', 'first']);

export class TaxCalculation
  implements Agent<TaxCalculationInput, TaxCalculationOutput>
{
  readonly id = '2.3';
  readonly name = 'Tax Calculation';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<TaxCalculationInput>,
  ): Promise<AgentOutput<TaxCalculationOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = calculateTaxes(input.data);

    const warnings: string[] = [];

    const exemptTaxes = result.taxes.filter((t) => t.exempt);
    if (exemptTaxes.length > 0) {
      warnings.push(`${exemptTaxes.length} tax(es) exempted.`);
    }

    return {
      data: result,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        segments_processed: input.data.segments.length,
        passenger_type: input.data.passenger_type,
        selling_currency: input.data.selling_currency,
        taxes_applied: result.taxes.length,
        exemptions_applied: result.exemptions_applied.length,
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

  private validateInput(data: TaxCalculationInput): void {
    if (!data.segments || !Array.isArray(data.segments) || data.segments.length === 0) {
      throw new AgentInputValidationError(this.id, 'segments', 'At least one segment required.');
    }

    for (let i = 0; i < data.segments.length; i++) {
      const seg = data.segments[i]!;
      if (!seg.origin || !IATA_CODE_RE.test(seg.origin)) {
        throw new AgentInputValidationError(this.id, `segments[${i}].origin`, 'Must be a 3-letter IATA code.');
      }
      if (!seg.destination || !IATA_CODE_RE.test(seg.destination)) {
        throw new AgentInputValidationError(this.id, `segments[${i}].destination`, 'Must be a 3-letter IATA code.');
      }
      if (!seg.origin_country || !COUNTRY_CODE_RE.test(seg.origin_country)) {
        throw new AgentInputValidationError(this.id, `segments[${i}].origin_country`, 'Must be a 2-letter ISO country code.');
      }
      if (!seg.destination_country || !COUNTRY_CODE_RE.test(seg.destination_country)) {
        throw new AgentInputValidationError(this.id, `segments[${i}].destination_country`, 'Must be a 2-letter ISO country code.');
      }
      if (!seg.base_fare_nuc || isNaN(Number(seg.base_fare_nuc))) {
        throw new AgentInputValidationError(this.id, `segments[${i}].base_fare_nuc`, 'Must be a valid numeric string.');
      }
      if (!VALID_CABIN_CLASSES.has(seg.cabin_class)) {
        throw new AgentInputValidationError(this.id, `segments[${i}].cabin_class`, 'Must be economy, premium, business, or first.');
      }
    }

    if (!VALID_PASSENGER_TYPES.has(data.passenger_type)) {
      throw new AgentInputValidationError(this.id, 'passenger_type', 'Must be adult, child, infant, crew, or diplomatic.');
    }

    if (!data.total_base_fare_nuc || isNaN(Number(data.total_base_fare_nuc))) {
      throw new AgentInputValidationError(this.id, 'total_base_fare_nuc', 'Must be a valid numeric string.');
    }

    if (!data.selling_currency || !CURRENCY_RE.test(data.selling_currency)) {
      throw new AgentInputValidationError(this.id, 'selling_currency', 'Must be a 3-letter ISO 4217 currency code.');
    }
  }
}

export type {
  TaxCalculationInput,
  TaxCalculationOutput,
  TaxSegment,
  AppliedTax,
  TaxBreakdown,
  CountryTaxSummary,
  CabinClass,
  PassengerType,
  ExemptionType,
} from './types.js';
