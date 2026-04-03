/**
 * Agent 4.6 — Hotel Modification & Cancellation Agent
 *
 * Handles post-booking changes: free modifications, date changes (cancel/rebook),
 * cancellations with penalty calculation, and no-show processing.
 *
 * Key domain rule: Date changes = cancel + rebook (NOT a modification).
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
import type { ModificationInput, ModificationOutput } from './types.js';
import { classifyChange } from './modification-classifier.js';
import { calculateCancellationPenalty, calculateNoShowPenalty } from './cancellation-calculator.js';

export class HotelModificationAgent
  implements Agent<ModificationInput, ModificationOutput>
{
  readonly id = '4.6';
  readonly name = 'Hotel Modification & Cancellation';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<ModificationInput>,
  ): Promise<AgentOutput<ModificationOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    let result: ModificationOutput;

    switch (input.data.operation) {
      case 'modify':
        result = this.handleModification(input.data);
        break;
      case 'cancel':
        result = this.handleCancellation(input.data);
        break;
      case 'check_penalty':
        result = this.handlePenaltyCheck(input.data);
        break;
      case 'process_no_show':
        result = this.handleNoShow(input.data);
        break;
    }

    return {
      data: result,
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: input.data.operation,
        classification: result.classification,
      },
    };
  }

  private handleModification(input: ModificationInput): ModificationOutput {
    const classification = classifyChange(input.modifications, input.dateChange);

    if (classification === 'cancel_rebook_required') {
      return {
        success: false,
        classification,
        isFreeMod: false,
        rebookRequired: true,
        message: 'Date changes require cancel and rebook — new rates will apply. This is NOT a modification.',
      };
    }

    // Free modification
    return {
      success: true,
      classification: 'free_modification',
      isFreeMod: true,
      rebookRequired: false,
      message: 'Modification applied successfully. No cancel/rebook required.',
    };
  }

  private handleCancellation(input: ModificationInput): ModificationOutput {
    if (!input.cancellationPolicy || !input.checkInDate || !input.bookedAt) {
      return {
        success: true,
        classification: 'free_modification',
        isFreeMod: false,
        rebookRequired: false,
        message: 'Cancellation processed. Penalty details unavailable without policy/dates.',
      };
    }

    const penalty = calculateCancellationPenalty(
      input.cancellationPolicy,
      input.checkInDate,
      new Date().toISOString(),
      input.bookedAt,
      input.nightlyRate ?? { amount: '0.00', currency: 'USD' },
    );

    return {
      success: true,
      classification: penalty.isWithinFreeWindow ? 'free_modification' : 'not_modifiable',
      isFreeMod: penalty.isWithinFreeWindow,
      penalty,
      rebookRequired: false,
      message: penalty.isWithinFreeWindow
        ? `Cancellation within free window${penalty.californiaRuleApplies ? ' (California 24hr rule)' : ''}. No penalty.`
        : `Cancellation penalty: ${penalty.penaltyAmount.amount} ${penalty.penaltyAmount.currency}`,
    };
  }

  private handlePenaltyCheck(input: ModificationInput): ModificationOutput {
    return this.handleCancellation(input);
  }

  private handleNoShow(input: ModificationInput): ModificationOutput {
    const penalty = calculateNoShowPenalty(input.nightlyRate ?? { amount: '0.00', currency: 'USD' });

    return {
      success: true,
      classification: 'not_modifiable',
      isFreeMod: false,
      penalty,
      rebookRequired: false,
      message: `No-show processed. Penalty: ${penalty.penaltyAmount.amount} ${penalty.penaltyAmount.currency} (1 night charge)`,
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

  private validateInput(data: ModificationInput): void {
    if (!data.operation) {
      throw new AgentInputValidationError(this.id, 'operation', 'Operation is required');
    }
    const validOps = ['modify', 'cancel', 'check_penalty', 'process_no_show'];
    if (!validOps.includes(data.operation)) {
      throw new AgentInputValidationError(this.id, 'operation', `Invalid operation. Must be one of: ${validOps.join(', ')}`);
    }
    if (!data.bookingId) {
      throw new AgentInputValidationError(this.id, 'bookingId', 'Booking ID is required');
    }
  }
}

export type {
  ModificationInput, ModificationOutput, FreeModifications,
  DateChangeRequest, ChangeClassification, PenaltyCalculation,
  ModificationOperation,
} from './types.js';
