/**
 * Ticket Issuance — Agent 4.1
 *
 * ETR generation with conjunction ticket support, BSP reporting,
 * and commission handling.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type { TicketIssuanceInput, TicketIssuanceOutput } from './types.js';
import { issueTickets } from './issuance-engine.js';

const RECORD_LOCATOR_RE = /^[A-Z0-9]{6}$/;
const CARRIER_RE = /^[A-Z0-9]{2}$/;
const AIRPORT_RE = /^[A-Z]{3}$/;
const PASSENGER_NAME_RE = /^[A-Z][A-Z' -]+\/[A-Z][A-Z' -]+$/;

export class TicketIssuance implements Agent<TicketIssuanceInput, TicketIssuanceOutput> {
  readonly id = '4.1';
  readonly name = 'Ticket Issuance';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<TicketIssuanceInput>,
  ): Promise<AgentOutput<TicketIssuanceOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = issueTickets(input.data);

    const warnings: string[] = [];
    if (result.is_conjunction) {
      warnings.push(
        `Conjunction ticketing: ${result.tickets.length} tickets generated for ${result.total_coupons} coupons.`,
      );
    }

    return {
      data: result,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        record_locator: input.data.record_locator,
        ticket_count: result.tickets.length,
        total_coupons: result.total_coupons,
        is_conjunction: result.is_conjunction,
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

  private validateInput(data: TicketIssuanceInput): void {
    if (!data.record_locator || !RECORD_LOCATOR_RE.test(data.record_locator)) {
      throw new AgentInputValidationError(
        this.id,
        'record_locator',
        'Must be a 6-character alphanumeric PNR locator.',
      );
    }
    if (!data.issuing_carrier || !CARRIER_RE.test(data.issuing_carrier)) {
      throw new AgentInputValidationError(
        this.id,
        'issuing_carrier',
        'Must be a 2-character IATA carrier code.',
      );
    }
    if (!data.passenger_name || !PASSENGER_NAME_RE.test(data.passenger_name)) {
      throw new AgentInputValidationError(
        this.id,
        'passenger_name',
        'Must be in LAST/FIRST format with alphabetic characters.',
      );
    }
    if (!data.segments || data.segments.length === 0) {
      throw new AgentInputValidationError(this.id, 'segments', 'At least one segment required.');
    }
    for (const seg of data.segments) {
      if (!CARRIER_RE.test(seg.carrier)) {
        throw new AgentInputValidationError(
          this.id,
          'segment.carrier',
          `Invalid carrier: ${seg.carrier}`,
        );
      }
      if (!AIRPORT_RE.test(seg.origin) || !AIRPORT_RE.test(seg.destination)) {
        throw new AgentInputValidationError(
          this.id,
          'segment.origin/destination',
          `Invalid airport code in segment.`,
        );
      }
    }
    if (!data.base_fare || isNaN(Number(data.base_fare))) {
      throw new AgentInputValidationError(this.id, 'base_fare', 'Must be a valid decimal string.');
    }
    if (!data.form_of_payment) {
      throw new AgentInputValidationError(
        this.id,
        'form_of_payment',
        'Form of payment is required.',
      );
    }
    if (!data.fare_calculation) {
      throw new AgentInputValidationError(
        this.id,
        'fare_calculation',
        'Fare calculation line is required.',
      );
    }
  }
}

export type {
  TicketIssuanceInput,
  TicketIssuanceOutput,
  TicketRecord,
  TicketSegment,
  CouponStatus,
  FormOfPayment,
  FormOfPaymentType,
  TaxBreakdownItem,
  CommissionData,
  BspReportingFields,
} from './types.js';
