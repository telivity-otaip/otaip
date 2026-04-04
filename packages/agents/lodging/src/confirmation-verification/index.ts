/**
 * Agent 20.7 — Confirmation Verification Agent
 *
 * Cross-checks CRS↔PMS booking data to detect discrepancies before guest arrival.
 * Escalates missing PMS codes, waitlist/tentative status, rate/date mismatches.
 *
 * Key domain rule: PMS sync can take 1-4 hours. >24hr delay = escalate.
 * Three confirmation layers: CRS (immediate), PMS (may be async), Channel.
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
import type { VerificationInput, VerificationOutput } from './types.js';
import { verifyBooking } from './verification-workflow.js';

export class ConfirmationVerificationAgent
  implements Agent<VerificationInput, VerificationOutput>
{
  readonly id = '20.7';
  readonly name = 'Confirmation Verification';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<VerificationInput>,
  ): Promise<AgentOutput<VerificationOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = verifyBooking(input.data);

    return {
      data: result,
      confidence: result.verified ? 1.0 : 0.5,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: input.data.operation,
        discrepancy_count: result.discrepancies.length,
        escalation_required: result.escalationRequired,
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

  private validateInput(data: VerificationInput): void {
    if (!data.operation) {
      throw new AgentInputValidationError(this.id, 'operation', 'Operation is required');
    }
    const validOps = ['verify', 'check_pms_sync', 'batch_verify'];
    if (!validOps.includes(data.operation)) {
      throw new AgentInputValidationError(
        this.id,
        'operation',
        `Invalid operation. Must be one of: ${validOps.join(', ')}`,
      );
    }
    if (!data.bookingId) {
      throw new AgentInputValidationError(this.id, 'bookingId', 'Booking ID is required');
    }
    if (!data.confirmation) {
      throw new AgentInputValidationError(this.id, 'confirmation', 'Confirmation codes are required');
    }
    if (!data.crsData) {
      throw new AgentInputValidationError(this.id, 'crsData', 'CRS booking data is required');
    }
  }
}

export type {
  VerificationInput, VerificationOutput, CrsBookingData, PmsBookingData,
  Discrepancy, DiscrepancySeverity, DiscrepancyField, EscalationReason,
  VerificationOperation,
} from './types.js';
