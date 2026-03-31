/**
 * Void Agent — Agent 4.3
 *
 * Ticket/EMD void processing — coupon status check, carrier void window,
 * BSP/ARC cut-off validation.
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
import type { VoidAgentInput, VoidAgentOutput } from './types.js';
import { processVoid } from './void-engine.js';

const DOCUMENT_NUMBER_RE = /^\d{13}$/;
const CARRIER_RE = /^[A-Z0-9]{2}$/;

export class VoidAgent
  implements Agent<VoidAgentInput, VoidAgentOutput>
{
  readonly id = '4.3';
  readonly name = 'Void Agent';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<VoidAgentInput>,
  ): Promise<AgentOutput<VoidAgentOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = processVoid(input.data);

    const warnings: string[] = [];
    if (!result.result.permitted) {
      warnings.push(`Void rejected: ${result.result.rejection_reason ?? 'unknown reason'}`);
    }

    return {
      data: result,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        document_number: input.data.document_number,
        permitted: result.result.permitted,
        rejection_reason: result.result.rejection_reason,
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

  private validateInput(data: VoidAgentInput): void {
    if (!data.document_number || !DOCUMENT_NUMBER_RE.test(data.document_number)) {
      throw new AgentInputValidationError(this.id, 'document_number', 'Must be a 13-digit ticket/EMD number.');
    }
    if (!data.issuing_carrier || !CARRIER_RE.test(data.issuing_carrier)) {
      throw new AgentInputValidationError(this.id, 'issuing_carrier', 'Must be a 2-character IATA carrier code.');
    }
    if (!data.coupons || data.coupons.length === 0) {
      throw new AgentInputValidationError(this.id, 'coupons', 'At least one coupon required.');
    }
    if (!data.issue_datetime) {
      throw new AgentInputValidationError(this.id, 'issue_datetime', 'Issue date/time is required.');
    }
    if (data.settlement_system && data.settlement_system !== 'BSP' && data.settlement_system !== 'ARC') {
      throw new AgentInputValidationError(this.id, 'settlement_system', 'Must be BSP or ARC.');
    }
  }
}

export type {
  VoidAgentInput,
  VoidAgentOutput,
  VoidResult,
  VoidRejectionReason,
  VoidSettlementSystem,
  VoidCouponInput,
  CarrierVoidWindow,
} from './types.js';
