/**
 * PNR Validation — Agent 3.3
 *
 * Pre-ticketing validation — 13 checks to catch errors before ADMs.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type { PnrValidationInput, PnrValidationOutput } from './types.js';
import { validatePnr } from './validation-engine.js';

const RECORD_LOCATOR_RE = /^[A-Z0-9]{6}$/;

export class PnrValidation implements Agent<PnrValidationInput, PnrValidationOutput> {
  readonly id = '3.3';
  readonly name = 'PNR Validation';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(input: AgentInput<PnrValidationInput>): Promise<AgentOutput<PnrValidationOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = validatePnr(input.data);

    const warnings: string[] = [];
    if (result.error_count > 0) {
      warnings.push(`${result.error_count} validation error(s) — PNR not ready for ticketing.`);
    }
    if (result.warning_count > 0) {
      warnings.push(`${result.warning_count} validation warning(s).`);
    }

    return {
      data: result,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        record_locator: input.data.record_locator,
        valid: result.valid,
        error_count: result.error_count,
        warning_count: result.warning_count,
        checks_run: result.checks.length,
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

  private validateInput(data: PnrValidationInput): void {
    if (!data.record_locator || !RECORD_LOCATOR_RE.test(data.record_locator)) {
      throw new AgentInputValidationError(
        this.id,
        'record_locator',
        'Must be a 6-character alphanumeric PNR locator.',
      );
    }
    if (!data.passengers || data.passengers.length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'passengers',
        'At least one passenger required.',
      );
    }
    if (!data.segments || data.segments.length === 0) {
      throw new AgentInputValidationError(this.id, 'segments', 'At least one segment required.');
    }
  }
}

export type {
  PnrValidationInput,
  PnrValidationOutput,
  ValidationCheck,
  ValidationSeverity,
  PnrPassengerData,
  PnrSegmentData,
  PnrContactData,
  PnrTicketingData,
  PnrFareData,
  SegmentStatus,
} from './types.js';
