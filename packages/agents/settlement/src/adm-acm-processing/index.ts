/**
 * ADM/ACM Processing — Agent 6.3
 *
 * Agency Debit Memo receipt, assessment, dispute, and
 * Agency Credit Memo application workflows.
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
import Decimal from 'decimal.js';
import type {
  ADMACMProcessingInput,
  ADMACMProcessingOutput,
  ADMRecord,
  ACMRecord,
  ADMAssessment,
  ADMDisputeResult,
  PendingDeadlineItem,
  StatusChange,
  ADMStatus,
  DisputeGround,
} from './types.js';

const VALID_OPERATIONS = new Set([
  'receiveADM', 'receiveACM', 'assessADM', 'disputeADM',
  'acceptADM', 'escalateADM', 'applyACM', 'getADM', 'getPendingWithDeadlines',
]);

const VALID_DISPUTE_GROUNDS = new Set<DisputeGround>([
  'FARE_ALREADY_CORRECT', 'WITHIN_WAIVER_WINDOW', 'DUPLICATE_ADM',
  'AMOUNT_INCORRECT', 'OUTSIDE_AIRLINE_POLICY', 'TICKET_REISSUED',
]);

const CARRIER_RE = /^[A-Z0-9]{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const DISPUTE_WINDOW_DAYS = 15;
const URGENCY_THRESHOLD_DAYS = 5;

function generateUUID(): string {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4';
    } else if (i === 19) {
      uuid += hex[8 + Math.floor(Math.random() * 4)];
    } else {
      uuid += hex[Math.floor(Math.random() * 16)];
    }
  }
  return uuid;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA + 'T00:00:00Z').getTime();
  const b = new Date(isoB + 'T00:00:00Z').getTime();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export class ADMACMProcessingAgent
  implements Agent<ADMACMProcessingInput, ADMACMProcessingOutput>
{
  readonly id = '6.3';
  readonly name = 'ADM/ACM Processing';
  readonly version = '0.1.0';

  private initialized = false;
  private admStore: Map<string, ADMRecord> = new Map();
  private acmStore: Map<string, ACMRecord> = new Map();

  async initialize(): Promise<void> {
    this.admStore = new Map();
    this.acmStore = new Map();
    this.initialized = true;
  }

  async execute(
    input: AgentInput<ADMACMProcessingInput>,
  ): Promise<AgentOutput<ADMACMProcessingOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const currentDate = input.data.currentDate ?? todayISO();
    let result: ADMACMProcessingOutput;

    switch (input.data.operation) {
      case 'receiveADM':
        result = this.handleReceiveADM(input.data, currentDate);
        break;
      case 'receiveACM':
        result = this.handleReceiveACM(input.data);
        break;
      case 'assessADM':
        result = this.handleAssessADM(input.data, currentDate);
        break;
      case 'disputeADM':
        result = this.handleDisputeADM(input.data, currentDate);
        break;
      case 'acceptADM':
        result = this.handleAcceptADM(input.data, currentDate);
        break;
      case 'escalateADM':
        result = this.handleEscalateADM(input.data, currentDate);
        break;
      case 'applyACM':
        result = this.handleApplyACM(input.data);
        break;
      case 'getADM':
        result = this.handleGetADM(input.data);
        break;
      case 'getPendingWithDeadlines':
        result = this.handleGetPendingWithDeadlines(currentDate);
        break;
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Unknown operation.');
    }

    const warnings: string[] = [];
    if (result.assessment?.windowExpired) {
      warnings.push('Dispute window has expired. ADM auto-accepted.');
    }
    if (result.assessment?.urgencyWarning) {
      warnings.push(result.assessment.urgencyWarning);
    }
    if (result.errorCode) {
      warnings.push(`Error: ${result.errorCode} — ${result.errorMessage ?? ''}`);
    }

    return {
      data: result,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: input.data.operation,
        adm_count: this.admStore.size,
        acm_count: this.acmStore.size,
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
    this.admStore.clear();
    this.acmStore.clear();
    this.initialized = false;
  }

  // --- Operation handlers ---

  private handleReceiveADM(data: ADMACMProcessingInput, currentDate: string): ADMACMProcessingOutput {
    const issuedDate = currentDate;
    const disputeDeadline = addDays(issuedDate, DISPUTE_WINDOW_DAYS);
    const admId = generateUUID();

    const adm: ADMRecord = {
      admId,
      ticketNumber: data.ticketNumber!,
      airline: data.airline!,
      amount: new Decimal(data.amount!).toFixed(2),
      currency: data.currency!,
      reason: data.reason!,
      reasonCode: data.reasonCode!,
      issuedDate,
      disputeDeadline,
      status: 'RECEIVED',
      history: [],
    };

    this.admStore.set(admId, adm);
    return { adm };
  }

  private handleReceiveACM(data: ADMACMProcessingInput): ADMACMProcessingOutput {
    const acmId = generateUUID();

    const acm: ACMRecord = {
      acmId,
      ticketNumber: data.ticketNumber!,
      airline: data.airline!,
      amount: new Decimal(data.amount!).toFixed(2),
      currency: data.currency!,
      reason: data.reason!,
      issuedDate: data.currentDate ?? todayISO(),
      status: 'RECEIVED',
    };

    this.acmStore.set(acmId, acm);
    return { acm };
  }

  private handleAssessADM(data: ADMACMProcessingInput, currentDate: string): ADMACMProcessingOutput {
    const adm = this.admStore.get(data.admId!);
    if (!adm) {
      return { errorCode: 'ADM_NOT_FOUND', errorMessage: `ADM ${data.admId} not found.` };
    }

    const daysRemaining = daysBetween(currentDate, adm.disputeDeadline);
    const windowExpired = daysRemaining < 0;

    let recommendedAction: 'DISPUTE' | 'ACCEPT';
    let urgencyWarning: string | undefined;
    let notes: string;

    if (windowExpired) {
      recommendedAction = 'ACCEPT';
      notes = 'Dispute window has expired. ADM must be accepted.';
      // Auto-accept
      this.transitionStatus(adm, 'ACCEPTED', currentDate, 'Auto-accepted: dispute window expired.');
    } else {
      recommendedAction = 'DISPUTE';
      notes = `${daysRemaining} day(s) remaining to dispute.`;

      if (daysRemaining <= URGENCY_THRESHOLD_DAYS) {
        urgencyWarning = `URGENT: Only ${daysRemaining} day(s) remaining to dispute ADM ${adm.admId}.`;
      }

      if (adm.status === 'RECEIVED') {
        this.transitionStatus(adm, 'ASSESSED', currentDate, notes);
      }
    }

    const assessment: ADMAssessment = {
      admId: adm.admId,
      daysRemaining: Math.max(0, daysRemaining),
      windowExpired,
      recommendedAction,
      urgencyWarning,
      notes,
    };

    return { adm, assessment };
  }

  private handleDisputeADM(data: ADMACMProcessingInput, currentDate: string): ADMACMProcessingOutput {
    const adm = this.admStore.get(data.admId!);
    if (!adm) {
      return { errorCode: 'ADM_NOT_FOUND', errorMessage: `ADM ${data.admId} not found.` };
    }

    if (adm.status === 'DISPUTED') {
      return { errorCode: 'ALREADY_DISPUTED', errorMessage: `ADM ${adm.admId} has already been disputed.` };
    }

    if (adm.status === 'ACCEPTED') {
      return { errorCode: 'ALREADY_ACCEPTED', errorMessage: `ADM ${adm.admId} has already been accepted.` };
    }

    const daysRemaining = daysBetween(currentDate, adm.disputeDeadline);
    if (daysRemaining < 0) {
      return { errorCode: 'DISPUTE_WINDOW_CLOSED', errorMessage: `Dispute window for ADM ${adm.admId} has expired.` };
    }

    if (adm.status !== 'RECEIVED' && adm.status !== 'ASSESSED') {
      return { errorCode: 'INVALID_STATUS_TRANSITION', errorMessage: `Cannot dispute ADM in status ${adm.status}.` };
    }

    this.transitionStatus(adm, 'DISPUTED', currentDate, `Disputed on ground: ${data.disputeGround}. Evidence: ${data.evidence ?? 'none'}`);

    const disputeResult: ADMDisputeResult = {
      admId: adm.admId,
      ground: data.disputeGround!,
      evidence: data.evidence ?? '',
      success: true,
      updatedRecord: adm,
    };

    return { adm, disputeResult };
  }

  private handleAcceptADM(data: ADMACMProcessingInput, currentDate: string): ADMACMProcessingOutput {
    const adm = this.admStore.get(data.admId!);
    if (!adm) {
      return { errorCode: 'ADM_NOT_FOUND', errorMessage: `ADM ${data.admId} not found.` };
    }

    if (adm.status === 'ACCEPTED') {
      return { errorCode: 'ALREADY_ACCEPTED', errorMessage: `ADM ${adm.admId} has already been accepted.` };
    }

    if (adm.status === 'DISPUTED') {
      return { errorCode: 'INVALID_STATUS_TRANSITION', errorMessage: `Cannot accept ADM that is already disputed.` };
    }

    this.transitionStatus(adm, 'ACCEPTED', currentDate, 'Accepted by agent.');
    return { adm };
  }

  private handleEscalateADM(data: ADMACMProcessingInput, currentDate: string): ADMACMProcessingOutput {
    const adm = this.admStore.get(data.admId!);
    if (!adm) {
      return { errorCode: 'ADM_NOT_FOUND', errorMessage: `ADM ${data.admId} not found.` };
    }

    if (adm.status === 'ACCEPTED') {
      return { errorCode: 'INVALID_STATUS_TRANSITION', errorMessage: `Cannot escalate ADM that has been accepted.` };
    }

    this.transitionStatus(adm, 'ESCALATED', currentDate, 'Escalated for manual review.');
    return { adm };
  }

  private handleApplyACM(data: ADMACMProcessingInput): ADMACMProcessingOutput {
    const acm = this.acmStore.get(data.acmId!);
    if (!acm) {
      return { errorCode: 'ACM_NOT_FOUND', errorMessage: `ACM ${data.acmId} not found.` };
    }

    if (acm.status === 'APPLIED') {
      return { errorCode: 'INVALID_STATUS_TRANSITION', errorMessage: `ACM ${acm.acmId} has already been applied.` };
    }

    acm.status = 'APPLIED';
    return { acm };
  }

  private handleGetADM(data: ADMACMProcessingInput): ADMACMProcessingOutput {
    const adm = this.admStore.get(data.admId!);
    if (!adm) {
      return { errorCode: 'ADM_NOT_FOUND', errorMessage: `ADM ${data.admId} not found.` };
    }
    return { adm };
  }

  private handleGetPendingWithDeadlines(currentDate: string): ADMACMProcessingOutput {
    const pendingDeadlines: PendingDeadlineItem[] = [];

    for (const adm of this.admStore.values()) {
      if (adm.status === 'RECEIVED' || adm.status === 'ASSESSED') {
        const daysRemaining = daysBetween(currentDate, adm.disputeDeadline);
        pendingDeadlines.push({
          adm,
          daysRemaining: Math.max(0, daysRemaining),
          urgent: daysRemaining <= URGENCY_THRESHOLD_DAYS,
        });
      }
    }

    pendingDeadlines.sort((a, b) => a.daysRemaining - b.daysRemaining);
    return { pendingDeadlines };
  }

  // --- Helpers ---

  private transitionStatus(adm: ADMRecord, to: ADMStatus, timestamp: string, notes?: string): void {
    const change: StatusChange = {
      from: adm.status,
      to,
      timestamp,
      notes,
    };
    adm.history.push(change);
    adm.status = to;
  }

  private validateInput(data: ADMACMProcessingInput): void {
    if (!data.operation || !VALID_OPERATIONS.has(data.operation)) {
      throw new AgentInputValidationError(this.id, 'operation', 'Must be a valid ADM/ACM operation.');
    }

    switch (data.operation) {
      case 'receiveADM':
        this.validateReceiveADM(data);
        break;
      case 'receiveACM':
        this.validateReceiveACM(data);
        break;
      case 'assessADM':
      case 'acceptADM':
      case 'escalateADM':
      case 'getADM':
        if (!data.admId) {
          throw new AgentInputValidationError(this.id, 'admId', 'ADM ID is required.');
        }
        break;
      case 'disputeADM':
        if (!data.admId) {
          throw new AgentInputValidationError(this.id, 'admId', 'ADM ID is required.');
        }
        if (!data.disputeGround || !VALID_DISPUTE_GROUNDS.has(data.disputeGround)) {
          throw new AgentInputValidationError(this.id, 'disputeGround', 'Must be a valid dispute ground.');
        }
        break;
      case 'applyACM':
        if (!data.acmId) {
          throw new AgentInputValidationError(this.id, 'acmId', 'ACM ID is required.');
        }
        break;
      case 'getPendingWithDeadlines':
        break;
    }
  }

  private validateReceiveADM(data: ADMACMProcessingInput): void {
    if (!data.ticketNumber || data.ticketNumber.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'ticketNumber', 'Ticket number is required.');
    }
    if (!data.airline || !CARRIER_RE.test(data.airline)) {
      throw new AgentInputValidationError(this.id, 'airline', 'Must be a 2-character IATA airline code.');
    }
    if (!data.amount || isNaN(Number(data.amount)) || new Decimal(data.amount).isNegative()) {
      throw new AgentInputValidationError(this.id, 'amount', 'Must be a valid non-negative decimal string.');
    }
    if (!data.currency || !CURRENCY_RE.test(data.currency)) {
      throw new AgentInputValidationError(this.id, 'currency', 'Must be a 3-letter currency code.');
    }
    if (!data.reason || data.reason.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'reason', 'Reason is required.');
    }
    if (!data.reasonCode || data.reasonCode.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'reasonCode', 'Reason code is required.');
    }
  }

  private validateReceiveACM(data: ADMACMProcessingInput): void {
    if (!data.ticketNumber || data.ticketNumber.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'ticketNumber', 'Ticket number is required.');
    }
    if (!data.airline || !CARRIER_RE.test(data.airline)) {
      throw new AgentInputValidationError(this.id, 'airline', 'Must be a 2-character IATA airline code.');
    }
    if (!data.amount || isNaN(Number(data.amount)) || new Decimal(data.amount).isNegative()) {
      throw new AgentInputValidationError(this.id, 'amount', 'Must be a valid non-negative decimal string.');
    }
    if (!data.currency || !CURRENCY_RE.test(data.currency)) {
      throw new AgentInputValidationError(this.id, 'currency', 'Must be a 3-letter currency code.');
    }
    if (!data.reason || data.reason.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'reason', 'Reason is required.');
    }
  }
}

export type {
  ADMACMProcessingInput,
  ADMACMProcessingOutput,
  ADMRecord,
  ACMRecord,
  ADMAssessment,
  ADMDisputeResult,
  PendingDeadlineItem,
  StatusChange,
  ADMStatus,
  ACMStatus,
  DisputeGround,
  ADMACMErrorCode,
} from './types.js';
