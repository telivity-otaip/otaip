/**
 * Class of Service Mapper — Agent 0.4
 *
 * Maps single-letter booking class codes to cabin class, fare family,
 * upgrade eligibility, and loyalty program earning rates.
 * Booking classes are airline-specific — the same letter can mean
 * different things on different carriers.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type { ClassOfServiceMapperInput, ClassOfServiceMapperOutput } from './types.js';
import { mapClassOfService } from './mapper.js';

/** Valid IATA 2-letter carrier code pattern */
const CARRIER_PATTERN = /^[A-Z0-9]{2}$/;

/** Valid booking class: single letter A-Z */
const BOOKING_CLASS_PATTERN = /^[A-Z]$/;

export class ClassOfServiceMapper implements Agent<
  ClassOfServiceMapperInput,
  ClassOfServiceMapperOutput
> {
  readonly id = '0.4';
  readonly name = 'Class of Service Mapper';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    // Data is inline (static reference data in data.ts), so initialization is lightweight.
    this.initialized = true;
  }

  async execute(
    input: AgentInput<ClassOfServiceMapperInput>,
  ): Promise<AgentOutput<ClassOfServiceMapperOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = mapClassOfService(input.data);

    return {
      data: result,
      confidence: result.match_confidence,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }

    return { status: 'healthy' };
  }

  private validateInput(data: ClassOfServiceMapperInput): void {
    if (!data.booking_class || typeof data.booking_class !== 'string') {
      throw new AgentInputValidationError(
        this.id,
        'booking_class',
        'Required string field. Provide a single-letter booking class code (A-Z).',
      );
    }

    const trimmedClass = data.booking_class.trim().toUpperCase();
    if (!BOOKING_CLASS_PATTERN.test(trimmedClass)) {
      throw new AgentInputValidationError(this.id, 'booking_class', 'Must be a single letter A-Z.');
    }

    if (!data.carrier || typeof data.carrier !== 'string') {
      throw new AgentInputValidationError(
        this.id,
        'carrier',
        'Required string field. Provide an IATA 2-letter airline code.',
      );
    }

    const trimmedCarrier = data.carrier.trim().toUpperCase();
    if (!CARRIER_PATTERN.test(trimmedCarrier)) {
      throw new AgentInputValidationError(
        this.id,
        'carrier',
        'Must be a valid IATA 2-letter carrier code (e.g., UA, AA, DL).',
      );
    }
  }

  /**
   * Tear down resources (used in testing).
   */
  destroy(): void {
    this.initialized = false;
  }
}

export type { ClassOfServiceMapperInput, ClassOfServiceMapperOutput } from './types.js';
export type {
  ClassMapping,
  LoyaltyEarning,
  CabinClass,
  UpgradeType,
  SeatSelection,
  PriorityLevel,
  PqpEarning,
} from './types.js';
