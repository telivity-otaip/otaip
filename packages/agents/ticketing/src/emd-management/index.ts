/**
 * EMD Management — Agent 4.2
 *
 * EMD-A (associated) and EMD-S (standalone) issuance,
 * RFIC/RFISC handling, coupon lifecycle.
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
import type { EmdManagementInput, EmdManagementOutput } from './types.js';
import { issueEmd } from './emd-engine.js';

const RECORD_LOCATOR_RE = /^[A-Z0-9]{6}$/;
const CARRIER_RE = /^[A-Z0-9]{2}$/;
const PASSENGER_NAME_RE = /^[A-Z][A-Z' -]+\/[A-Z][A-Z' -]+$/;
const VALID_RFIC = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
const TICKET_NUMBER_RE = /^\d{13}$/;

export class EmdManagement
  implements Agent<EmdManagementInput, EmdManagementOutput>
{
  readonly id = '4.2';
  readonly name = 'EMD Management';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<EmdManagementInput>,
  ): Promise<AgentOutput<EmdManagementOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = issueEmd(input.data);

    return {
      data: result,
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        emd_type: input.data.emd_type,
        emd_number: result.emd.emd_number,
        coupon_count: result.coupon_count,
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

  private validateInput(data: EmdManagementInput): void {
    if (!data.record_locator || !RECORD_LOCATOR_RE.test(data.record_locator)) {
      throw new AgentInputValidationError(this.id, 'record_locator', 'Must be a 6-character alphanumeric PNR locator.');
    }
    if (!data.issuing_carrier || !CARRIER_RE.test(data.issuing_carrier)) {
      throw new AgentInputValidationError(this.id, 'issuing_carrier', 'Must be a 2-character IATA carrier code.');
    }
    if (!data.passenger_name || !PASSENGER_NAME_RE.test(data.passenger_name)) {
      throw new AgentInputValidationError(this.id, 'passenger_name', 'Must be in LAST/FIRST format.');
    }
    if (data.emd_type !== 'EMD-A' && data.emd_type !== 'EMD-S') {
      throw new AgentInputValidationError(this.id, 'emd_type', 'Must be EMD-A or EMD-S.');
    }
    if (!data.services || data.services.length === 0) {
      throw new AgentInputValidationError(this.id, 'services', 'At least one service required.');
    }
    if (data.services.length > 4) {
      throw new AgentInputValidationError(this.id, 'services', 'Maximum 4 coupons per EMD.');
    }

    for (const svc of data.services) {
      if (!VALID_RFIC.has(svc.rfic)) {
        throw new AgentInputValidationError(this.id, 'rfic', `Invalid RFIC code: ${svc.rfic}. Must be A-G.`);
      }
      if (isNaN(Number(svc.amount))) {
        throw new AgentInputValidationError(this.id, 'amount', 'Service amount must be a valid decimal string.');
      }
    }

    // EMD-A must have associated ticket references
    if (data.emd_type === 'EMD-A') {
      for (const svc of data.services) {
        if (!svc.associated_ticket_number) {
          throw new AgentInputValidationError(this.id, 'associated_ticket_number', 'EMD-A services must link to a ticket coupon number.');
        }
        if (!TICKET_NUMBER_RE.test(svc.associated_ticket_number)) {
          throw new AgentInputValidationError(this.id, 'associated_ticket_number', `Invalid ticket number format: ${svc.associated_ticket_number}`);
        }
      }
    }
  }
}

export type {
  EmdManagementInput,
  EmdManagementOutput,
  EmdRecord,
  EmdCoupon,
  EmdType,
  RficCode,
} from './types.js';

export { RFIC_DESCRIPTIONS } from './types.js';
