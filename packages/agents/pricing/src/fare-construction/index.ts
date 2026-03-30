/**
 * Fare Construction — Agent 2.2
 *
 * NUC × ROE fare construction with mileage validation,
 * HIP/BHC/CTM checks, surcharges, and IATA rounding.
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
import type { FareConstructionInput, FareConstructionOutput, JourneyType } from './types.js';
import { constructFare } from './fare-engine.js';

const VALID_JOURNEY_TYPES = new Set<JourneyType>(['OW', 'RT', 'CT']);
const IATA_CODE_RE = /^[A-Z]{3}$/i;
const CURRENCY_RE = /^[A-Z]{3}$/;

export class FareConstruction
  implements Agent<FareConstructionInput, FareConstructionOutput>
{
  readonly id = '2.2';
  readonly name = 'Fare Construction';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<FareConstructionInput>,
  ): Promise<AgentOutput<FareConstructionOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = constructFare(input.data);

    const warnings: string[] = [];
    if (result.mileage_exceeded) {
      warnings.push(`Mileage exceeded: TPM ${result.total_tpm} > MPM ${result.total_mph}. Surcharge of ${result.mileage_surcharge.percentage}% applied.`);
    }
    if (result.hip_check.detected) {
      warnings.push(`HIP detected at ${result.hip_check.hip_point}.`);
    }
    if (result.bhc_check.detected) {
      warnings.push(result.bhc_check.description);
    }

    const missingMileage = result.mileage_checks.filter((m) => !m.data_available);
    for (const m of missingMileage) {
      warnings.push(`No mileage data for ${m.origin}-${m.destination}.`);
    }

    return {
      data: result,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        journey_type: input.data.journey_type,
        component_count: input.data.components.length,
        currency: input.data.selling_currency,
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

  private validateInput(data: FareConstructionInput): void {
    if (!VALID_JOURNEY_TYPES.has(data.journey_type)) {
      throw new AgentInputValidationError(this.id, 'journey_type', 'Must be OW, RT, or CT.');
    }

    if (!data.components || !Array.isArray(data.components) || data.components.length === 0) {
      throw new AgentInputValidationError(this.id, 'components', 'At least one fare component required.');
    }

    for (let i = 0; i < data.components.length; i++) {
      const comp = data.components[i]!;
      if (!comp.origin || !IATA_CODE_RE.test(comp.origin)) {
        throw new AgentInputValidationError(this.id, `components[${i}].origin`, 'Must be a 3-letter IATA code.');
      }
      if (!comp.destination || !IATA_CODE_RE.test(comp.destination)) {
        throw new AgentInputValidationError(this.id, `components[${i}].destination`, 'Must be a 3-letter IATA code.');
      }
      if (!comp.nuc_amount || isNaN(Number(comp.nuc_amount))) {
        throw new AgentInputValidationError(this.id, `components[${i}].nuc_amount`, 'Must be a valid numeric string.');
      }
    }

    if (!data.selling_currency || !CURRENCY_RE.test(data.selling_currency)) {
      throw new AgentInputValidationError(this.id, 'selling_currency', 'Must be a 3-letter ISO 4217 currency code.');
    }
  }
}

export type {
  FareConstructionInput,
  FareConstructionOutput,
  FareComponent,
  JourneyType,
  MileageCheck,
  MileageSurcharge,
  HipCheck,
  BhcCheck,
  CtmCheck,
  AuditStep,
} from './types.js';
