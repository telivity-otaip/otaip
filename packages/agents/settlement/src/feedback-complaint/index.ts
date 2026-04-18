/**
 * Feedback & Complaint — Agent 6.5
 *
 * Complaint submission, EU261/US DOT compensation calculation,
 * case management, and regulatory DOT record generation.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import {
  AgentNotInitializedError,
  AgentInputValidationError,
  applyEU261,
  applyUsDotIdb,
} from '@otaip/core';
import Decimal from 'decimal.js';
import type {
  FeedbackComplaintInput,
  FeedbackComplaintOutput,
  ComplaintCase,
  CompensationResult,
  DOTRecord,
  ComplaintType,
  ComplaintStatus,
  Priority,
  Regulation,
  DOTCategory,
} from './types.js';

const VALID_OPERATIONS = new Set([
  'submitComplaint',
  'updateStatus',
  'getCase',
  'listCases',
  'calculateCompensation',
  'generateDOTRecord',
]);

const VALID_COMPLAINT_TYPES = new Set<ComplaintType>([
  'DELAY',
  'CANCELLATION',
  'DOWNGRADE',
  'DENIED_BOARDING',
  'BAGGAGE',
  'SERVICE_QUALITY',
  'REFUND_DISPUTE',
  'ACCESSIBILITY',
  'OTHER',
]);

const VALID_STATUSES = new Set<ComplaintStatus>([
  'SUBMITTED',
  'UNDER_REVIEW',
  'COMPENSATION_OFFERED',
  'RESOLVED',
  'ESCALATED',
  'CLOSED',
]);

const CARRIER_RE = /^[A-Z0-9]{2}$/;

const DOT_CATEGORY_MAP: Record<ComplaintType, DOTCategory> = {
  DELAY: 'Flight Problems',
  CANCELLATION: 'Flight Problems',
  DOWNGRADE: 'Flight Problems',
  DENIED_BOARDING: 'Oversales',
  BAGGAGE: 'Baggage',
  SERVICE_QUALITY: 'Other',
  REFUND_DISPUTE: 'Other',
  ACCESSIBILITY: 'Disability',
  OTHER: 'Other',
};

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

function determinePriority(complaintType: ComplaintType, regulation: Regulation): Priority {
  if (complaintType === 'DENIED_BOARDING' || complaintType === 'ACCESSIBILITY') {
    return 'HIGH';
  }
  if (complaintType === 'CANCELLATION') {
    return 'HIGH';
  }
  if (complaintType === 'DELAY' && regulation === 'EU261') {
    return 'HIGH';
  }
  return 'NORMAL';
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * EU261 Article 7 base compensation by distance band — mirrors the
 * @otaip/core EU261_BANDS constants and is re-derived here to keep the
 * tests' baseAmount transparent (pre-reduction).
 */
function bandBaseByDistance(distanceKm: number): Decimal {
  if (distanceKm < 1500) return new Decimal('250');
  if (distanceKm <= 3500) return new Decimal('400');
  return new Decimal('600');
}

/**
 * Article 7(2) rerouting reduction — band thresholds 2h/3h/4h.
 * Returns 50 when reduction applies, 0 otherwise.
 */
function computeReroutingReduction(
  distanceKm: number,
  data: FeedbackComplaintInput,
): number {
  if (!data.alternativeOffered) return 0;
  let threshold: number;
  if (distanceKm < 1500) threshold = 2;
  else if (distanceKm <= 3500) threshold = 3;
  else threshold = 4;
  const lateness = data.alternativeArrivalDelayHours;
  if (lateness === undefined) return 0;
  return lateness <= threshold ? 50 : 0;
}

export class FeedbackComplaintAgent implements Agent<
  FeedbackComplaintInput,
  FeedbackComplaintOutput
> {
  readonly id = '6.5';
  readonly name = 'Feedback & Complaint';
  readonly version = '0.1.0';

  private initialized = false;
  private caseStore: Map<string, ComplaintCase> = new Map();

  async initialize(): Promise<void> {
    this.caseStore = new Map();
    this.initialized = true;
  }

  async execute(
    input: AgentInput<FeedbackComplaintInput>,
  ): Promise<AgentOutput<FeedbackComplaintOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    let result: FeedbackComplaintOutput;

    switch (input.data.operation) {
      case 'submitComplaint':
        result = this.handleSubmitComplaint(input.data);
        break;
      case 'updateStatus':
        result = this.handleUpdateStatus(input.data);
        break;
      case 'getCase':
        result = this.handleGetCase(input.data);
        break;
      case 'listCases':
        result = this.handleListCases(input.data);
        break;
      case 'calculateCompensation':
        result = this.handleCalculateCompensation(input.data);
        break;
      case 'generateDOTRecord':
        result = this.handleGenerateDOTRecord(input.data);
        break;
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Unknown operation.');
    }

    return {
      data: result,
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: input.data.operation,
        total_cases: this.caseStore.size,
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
    this.caseStore.clear();
    this.initialized = false;
  }

  // --- Operation handlers ---

  private handleSubmitComplaint(data: FeedbackComplaintInput): FeedbackComplaintOutput {
    const regulation: Regulation = data.regulation ?? 'NONE';
    const priority = determinePriority(data.complaintType!, regulation);
    const caseId = generateUUID();
    const submittedDate = data.currentDate ?? todayISO();

    const complaintCase: ComplaintCase = {
      caseId,
      complaintType: data.complaintType!,
      status: 'SUBMITTED',
      priority,
      passengerName: data.passengerName!,
      bookingReference: data.bookingReference!,
      airline: data.airline!,
      flightNumber: data.flightNumber!,
      flightDate: data.flightDate!,
      description: data.description!,
      regulation,
      submittedDate,
      statusHistory: [],
    };

    this.caseStore.set(caseId, complaintCase);
    return { complaintCase };
  }

  private handleUpdateStatus(data: FeedbackComplaintInput): FeedbackComplaintOutput {
    const cc = this.caseStore.get(data.caseId!);
    if (!cc) {
      return { errorMessage: `Case ${data.caseId} not found.` };
    }

    const timestamp = data.currentDate ?? todayISO();
    cc.statusHistory.push({
      from: cc.status,
      to: data.newStatus!,
      timestamp,
    });
    cc.status = data.newStatus!;

    return { complaintCase: cc };
  }

  private handleGetCase(data: FeedbackComplaintInput): FeedbackComplaintOutput {
    const cc = this.caseStore.get(data.caseId!);
    if (!cc) {
      return { errorMessage: `Case ${data.caseId} not found.` };
    }
    return { complaintCase: cc };
  }

  private handleListCases(data: FeedbackComplaintInput): FeedbackComplaintOutput {
    let cases = Array.from(this.caseStore.values());

    if (data.filterStatus) {
      cases = cases.filter((c) => c.status === data.filterStatus);
    }
    if (data.filterType) {
      cases = cases.filter((c) => c.complaintType === data.filterType);
    }

    return { cases };
  }

  private handleCalculateCompensation(data: FeedbackComplaintInput): FeedbackComplaintOutput {
    const regulation = data.regulation!;

    if (regulation === 'EU261') {
      return { compensation: this.calculateEU261(data) };
    }

    if (regulation === 'US_DOT') {
      return { compensation: this.calculateUSDOT(data) };
    }

    return {
      compensation: {
        eligible: false,
        regulation: 'NONE',
        baseAmount: '0.00',
        finalAmount: '0.00',
        currency: data.currency ?? 'USD',
        reductionPercent: 0,
        notes: 'No applicable regulation.',
      },
    };
  }

  private handleGenerateDOTRecord(data: FeedbackComplaintInput): FeedbackComplaintOutput {
    const cc = this.caseStore.get(data.caseId!);
    if (!cc) {
      return { errorMessage: `Case ${data.caseId} not found.` };
    }

    const dotRecord: DOTRecord = {
      complaintType: cc.complaintType,
      dotCategory: DOT_CATEGORY_MAP[cc.complaintType],
      airline: cc.airline,
      flightNumber: cc.flightNumber,
      flightDate: cc.flightDate,
      passengerName: cc.passengerName,
      description: cc.description,
      compensationAmount: cc.compensation?.finalAmount,
      currency: cc.compensation?.currency,
    };

    return { dotRecord };
  }

  // --- EU261 compensation (delegates to @otaip/core regulations/eu261) ---

  private calculateEU261(data: FeedbackComplaintInput): CompensationResult {
    const distanceKm = data.distanceKm ?? 0;
    const complaintType = data.complaintType ?? 'DELAY';
    const currency = 'EUR';
    const delayMinutes = this.getDelayMinutes(data);

    if (complaintType === 'DELAY') {
      const result = applyEU261({
        distanceKm,
        arrivalDelayHours: delayMinutes / 60,
        extraordinaryCircumstances: false,
        flightCancelled: false,
        ...(data.alternativeOffered !== undefined ? { reroutingOffered: data.alternativeOffered } : {}),
        ...(data.alternativeArrivalDelayHours !== undefined
          ? { reroutingArrivalLatenessHours: data.alternativeArrivalDelayHours }
          : {}),
      });
      const baseAmount = bandBaseByDistance(distanceKm);
      return {
        eligible: result.eligible,
        regulation: 'EU261',
        baseAmount: baseAmount.toFixed(2),
        finalAmount: result.compensationEur,
        currency,
        reductionPercent: result.reductionPercent,
        notes: `EU261 delay (${distanceKm}km, ${delayMinutes}min). ${result.reason}`,
      };
    }

    if (complaintType === 'CANCELLATION') {
      // Cancellation cash compensation under Article 5(1)(c). Notice <14 days
      // assumed when not provided (worst-case for carrier liability).
      const result = applyEU261({
        distanceKm,
        arrivalDelayHours: 0,
        extraordinaryCircumstances: false,
        flightCancelled: true,
        noticeDaysBeforeDeparture: 0,
        ...(data.alternativeOffered !== undefined ? { reroutingOffered: data.alternativeOffered } : {}),
        ...(data.alternativeArrivalDelayHours !== undefined
          ? { reroutingArrivalLatenessHours: data.alternativeArrivalDelayHours }
          : {}),
      });
      const baseAmount = bandBaseByDistance(distanceKm);
      return {
        eligible: result.eligible,
        regulation: 'EU261',
        baseAmount: baseAmount.toFixed(2),
        finalAmount: result.compensationEur,
        currency,
        reductionPercent: result.reductionPercent,
        notes: `EU261 cancellation (${distanceKm}km). ${result.reason}`,
      };
    }

    if (complaintType === 'DOWNGRADE') {
      // Article 10(2): downgrade reimbursement is 30%/50%/75% of the price of
      // the ticket for the affected segment, by distance band. This is
      // published law and is the only fixed scaling allowed.
      const farePaid = data.farePaid
        ? new Decimal(data.farePaid)
        : data.fareAmount
          ? new Decimal(data.fareAmount)
          : new Decimal('0');
      let percent: number;
      if (distanceKm <= 1500) {
        percent = 30;
      } else if (distanceKm <= 3500) {
        percent = 50;
      } else {
        percent = 75;
      }
      const amount = farePaid.mul(percent).div(100).toFixed(2);
      return {
        eligible: true,
        regulation: 'EU261',
        baseAmount: amount,
        finalAmount: amount,
        currency,
        reductionPercent: 0,
        notes: `EU261 Article 10(2) downgrade: ${percent}% of fare (${distanceKm}km band).`,
      };
    }

    if (complaintType === 'DENIED_BOARDING') {
      // Article 4: denied boarding compensation uses Article 7 amounts.
      // No delay trigger applies — compensation is owed on denial itself.
      const baseAmount = bandBaseByDistance(distanceKm);
      const reduction = computeReroutingReduction(distanceKm, data);
      const finalAmount =
        reduction > 0 ? baseAmount.mul(100 - reduction).div(100) : baseAmount;
      return {
        eligible: true,
        regulation: 'EU261',
        baseAmount: baseAmount.toFixed(2),
        finalAmount: finalAmount.toFixed(2),
        currency,
        reductionPercent: reduction,
        notes: `EU261 Article 4 denied boarding (${distanceKm}km).${
          reduction > 0 ? ' 50% reduction under Article 7(2).' : ''
        }`,
      };
    }

    return {
      eligible: false,
      regulation: 'EU261',
      baseAmount: '0.00',
      finalAmount: '0.00',
      currency,
      reductionPercent: 0,
      notes: `Complaint type ${complaintType} not covered by EU261.`,
    };
  }

  private getDelayMinutes(data: FeedbackComplaintInput): number {
    if (data.delayMinutes !== undefined) return data.delayMinutes;
    if (data.delayHours !== undefined) return Math.round(data.delayHours * 60);
    return 0;
  }

  // --- US DOT compensation (delegates to @otaip/core regulations/us-dot-idb) ---

  private calculateUSDOT(data: FeedbackComplaintInput): CompensationResult {
    const complaintType = data.complaintType ?? 'DENIED_BOARDING';
    const currency = 'USD';

    if (complaintType === 'DELAY') {
      return {
        eligible: false,
        regulation: 'US_DOT',
        baseAmount: '0.00',
        finalAmount: '0.00',
        currency,
        reductionPercent: 0,
        notes:
          'US DOT does not mandate delay compensation. Carrier customer service policies apply.',
      };
    }

    if (complaintType === 'CANCELLATION') {
      return {
        eligible: false,
        regulation: 'US_DOT',
        baseAmount: '0.00',
        finalAmount: '0.00',
        currency,
        reductionPercent: 0,
        notes: 'US DOT requires full refund or rebooking — no mandated cash compensation.',
      };
    }

    if (complaintType === 'DOWNGRADE') {
      const fare = data.fareAmount
        ? new Decimal(data.fareAmount)
        : data.farePaid
          ? new Decimal(data.farePaid)
          : new Decimal('0');
      return {
        eligible: true,
        regulation: 'US_DOT',
        baseAmount: fare.toFixed(2),
        finalAmount: fare.toFixed(2),
        currency,
        reductionPercent: 0,
        notes: 'Full refund required for involuntary downgrade.',
      };
    }

    if (complaintType === 'DENIED_BOARDING') {
      const fare = data.fareAmount
        ? new Decimal(data.fareAmount)
        : data.farePaid
          ? new Decimal(data.farePaid)
          : new Decimal('0');
      const delayMinutes = this.getDelayMinutes(data);
      const isDomestic = data.isDomestic ?? true;

      const result = applyUsDotIdb({
        isDomestic,
        substituteArrivalLateMinutes: delayMinutes,
        oneWayFareUsd: fare.toString(),
      });

      // baseAmount reflects pre-cap multiplier × fare for transparency.
      const baseAmount = fare.mul(result.band.multiplier).toFixed(2);

      return {
        eligible: result.eligible,
        regulation: 'US_DOT',
        baseAmount,
        finalAmount: result.compensationUsd,
        currency,
        reductionPercent: 0,
        notes: result.reason,
      };
    }

    return {
      eligible: false,
      regulation: 'US_DOT',
      baseAmount: '0.00',
      finalAmount: '0.00',
      currency,
      reductionPercent: 0,
      notes: `Complaint type ${complaintType} not covered by US DOT mandatory compensation.`,
    };
  }

  // --- Validation ---

  private validateInput(data: FeedbackComplaintInput): void {
    if (!data.operation || !VALID_OPERATIONS.has(data.operation)) {
      throw new AgentInputValidationError(this.id, 'operation', 'Must be a valid operation.');
    }

    switch (data.operation) {
      case 'submitComplaint':
        if (!data.complaintType || !VALID_COMPLAINT_TYPES.has(data.complaintType)) {
          throw new AgentInputValidationError(
            this.id,
            'complaintType',
            'Must be a valid complaint type.',
          );
        }
        if (!data.passengerName || data.passengerName.trim().length === 0) {
          throw new AgentInputValidationError(
            this.id,
            'passengerName',
            'Passenger name is required.',
          );
        }
        if (!data.bookingReference || data.bookingReference.trim().length === 0) {
          throw new AgentInputValidationError(
            this.id,
            'bookingReference',
            'Booking reference is required.',
          );
        }
        if (!data.airline || !CARRIER_RE.test(data.airline)) {
          throw new AgentInputValidationError(
            this.id,
            'airline',
            'Must be a 2-character airline code.',
          );
        }
        if (!data.flightNumber || data.flightNumber.trim().length === 0) {
          throw new AgentInputValidationError(
            this.id,
            'flightNumber',
            'Flight number is required.',
          );
        }
        if (!data.flightDate) {
          throw new AgentInputValidationError(this.id, 'flightDate', 'Flight date is required.');
        }
        if (!data.description || data.description.trim().length === 0) {
          throw new AgentInputValidationError(this.id, 'description', 'Description is required.');
        }
        break;
      case 'updateStatus':
        if (!data.caseId) {
          throw new AgentInputValidationError(this.id, 'caseId', 'Case ID is required.');
        }
        if (!data.newStatus || !VALID_STATUSES.has(data.newStatus)) {
          throw new AgentInputValidationError(this.id, 'newStatus', 'Must be a valid status.');
        }
        break;
      case 'getCase':
      case 'generateDOTRecord':
        if (!data.caseId) {
          throw new AgentInputValidationError(this.id, 'caseId', 'Case ID is required.');
        }
        break;
      case 'calculateCompensation':
        if (!data.regulation) {
          throw new AgentInputValidationError(this.id, 'regulation', 'Regulation is required.');
        }
        if (!data.complaintType || !VALID_COMPLAINT_TYPES.has(data.complaintType)) {
          throw new AgentInputValidationError(
            this.id,
            'complaintType',
            'Must be a valid complaint type.',
          );
        }
        break;
      case 'listCases':
        break;
    }
  }
}

export type {
  FeedbackComplaintInput,
  FeedbackComplaintOutput,
  ComplaintCase,
  CompensationResult,
  DOTRecord,
  ComplaintType,
  ComplaintStatus,
  Priority,
  Regulation,
  CabinClass,
  DOTCategory,
} from './types.js';
