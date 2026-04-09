import Decimal from 'decimal.js';
import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  CommissionManagementInput,
  CommissionManagementOutput,
  CommissionAgreement,
  CommissionRate,
  CommissionValidationResult,
  IncentiveResult,
} from './types.js';

let nextId = 0;
function uuid(): string {
  return `CMA${String(++nextId).padStart(8, '0')}`;
}

function matchesFareBasis(pattern: string, fareBasis: string): boolean {
  if (pattern.endsWith('*')) return fareBasis.startsWith(pattern.slice(0, -1));
  return pattern === fareBasis;
}

export class CommissionManagementAgent implements Agent<
  CommissionManagementInput,
  CommissionManagementOutput
> {
  readonly id = '7.3';
  readonly name = 'Commission Management';
  readonly version = '0.1.0';
  private initialized = false;
  private agreements = new Map<string, CommissionAgreement>();

  getAgreements(): Map<string, CommissionAgreement> {
    return this.agreements;
  }
  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<CommissionManagementInput>,
  ): Promise<AgentOutput<CommissionManagementOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);
    const d = input.data;

    switch (d.operation) {
      case 'registerAgreement':
        return this.register(d);
      case 'getRate':
        return this.getRate(d);
      case 'validateCommission':
        return this.validate(d);
      case 'calculateIncentive':
        return this.incentive(d);
      case 'listAgreements':
        return this.list(d);
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Invalid.');
    }
  }

  private register(d: CommissionManagementInput): AgentOutput<CommissionManagementOutput> {
    if (!d.agreement) throw new AgentInputValidationError(this.id, 'agreement', 'Required.');
    if (!d.agreement.effectiveFrom)
      throw new AgentInputValidationError(this.id, 'effectiveFrom', 'INVALID_DATE_RANGE');

    // Check duplicate
    for (const existing of this.agreements.values()) {
      if (
        existing.agentId === d.agreement.agentId &&
        existing.airline === d.agreement.airline &&
        existing.type === d.agreement.type &&
        existing.effectiveFrom === d.agreement.effectiveFrom
      ) {
        throw new AgentInputValidationError(this.id, 'agreement', 'DUPLICATE_AGREEMENT');
      }
    }

    const agreement: CommissionAgreement = { agreementId: uuid(), ...d.agreement };
    this.agreements.set(agreement.agreementId, agreement);
    return {
      data: { agreement, message: 'Agreement registered.' },
      confidence: 1.0,
      metadata: { agent_id: this.id },
    };
  }

  private getRate(d: CommissionManagementInput): AgentOutput<CommissionManagementOutput> {
    if (!d.airline || !d.agentId)
      throw new AgentInputValidationError(this.id, 'airline/agentId', 'Required.');

    let bestRate: { agreement: CommissionAgreement; rate: Decimal } | undefined;

    for (const ag of this.agreements.values()) {
      if (ag.agentId !== d.agentId || ag.airline !== d.airline) continue;
      if (d.ticketDate && ag.effectiveFrom > d.ticketDate) continue;
      if (d.ticketDate && ag.effectiveTo && ag.effectiveTo < d.ticketDate) continue;

      if (ag.fareBasisPatterns && ag.fareBasisPatterns.length > 0 && d.fareBasis) {
        if (!ag.fareBasisPatterns.some((p) => matchesFareBasis(p, d.fareBasis!))) continue;
      }

      const rate = new Decimal(ag.rate);
      if (!bestRate || rate.greaterThan(bestRate.rate)) {
        bestRate = { agreement: ag, rate };
      }
    }

    if (!bestRate)
      return { data: { rate: undefined }, confidence: 0, metadata: { agent_id: this.id } };

    const commRate: CommissionRate = {
      agreementId: bestRate.agreement.agreementId,
      rate: bestRate.agreement.rate,
      basis: bestRate.agreement.basis,
      type: bestRate.agreement.type,
    };
    return { data: { rate: commRate }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private validate(d: CommissionManagementInput): AgentOutput<CommissionManagementOutput> {
    if (!d.claimedCommission || !d.fareAmount || !d.airline || !d.agentId) {
      throw new AgentInputValidationError(this.id, 'claimedCommission/fareAmount', 'Required.');
    }

    const rateResult = this.getRate(d);
    const rate = rateResult.data.rate;

    if (!rate) {
      const validation: CommissionValidationResult = {
        valid: false,
        expectedRate: '0',
        claimedRate: d.claimedCommission,
        variance: d.claimedCommission,
        variancePercent: '100',
        status: 'NO_AGREEMENT',
      };
      return { data: { validation }, confidence: 1.0, metadata: { agent_id: this.id } };
    }

    const fare = new Decimal(d.fareAmount);
    const claimed = new Decimal(d.claimedCommission);
    const expected = fare.times(new Decimal(rate.rate)).dividedBy(100);
    const variance = claimed.minus(expected);
    const variancePct = expected.isZero()
      ? new Decimal(100)
      : variance.abs().dividedBy(expected).times(100);

    let status: CommissionValidationResult['status'];
    if (variance.abs().lessThanOrEqualTo('0.01')) status = 'MATCH';
    else if (variance.greaterThan(0)) status = 'OVERSTATED';
    else status = 'UNDERSTATED';

    const validation: CommissionValidationResult = {
      valid: status === 'MATCH',
      expectedRate: rate.rate,
      claimedRate: d.claimedCommission,
      variance: variance.toFixed(2),
      variancePercent: variancePct.toFixed(2),
      status,
    };
    return { data: { validation }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private incentive(d: CommissionManagementInput): AgentOutput<CommissionManagementOutput> {
    if (!d.agentId || !d.airline || !d.period)
      throw new AgentInputValidationError(this.id, 'agentId/airline/period', 'Required.');

    const tickets = d.tickets ?? [];
    const totalFare = tickets.reduce((s, t) => s.plus(new Decimal(t.fareAmount)), new Decimal(0));

    // Find incentive agreement
    let incentiveAg: CommissionAgreement | undefined;
    for (const ag of this.agreements.values()) {
      if (ag.agentId === d.agentId && ag.airline === d.airline && ag.type === 'INCENTIVE') {
        incentiveAg = ag;
        break;
      }
    }

    const thresholdMet = incentiveAg?.minimumTickets
      ? tickets.length >= incentiveAg.minimumTickets
      : true;
    const incentiveRate = incentiveAg ? new Decimal(incentiveAg.rate) : new Decimal(0);
    const incentiveEarned = thresholdMet
      ? totalFare.times(incentiveRate).dividedBy(100)
      : new Decimal(0);

    const incentive: IncentiveResult = {
      agentId: d.agentId,
      airline: d.airline,
      period: d.period,
      ticketCount: tickets.length,
      totalFareAmount: totalFare.toFixed(2),
      incentiveEarned: incentiveEarned.toFixed(2),
      currency: incentiveAg?.currencyCode ?? 'USD',
      thresholdMet,
      notes: thresholdMet
        ? 'Incentive threshold met.'
        : `Need ${incentiveAg?.minimumTickets ?? 0} tickets, have ${tickets.length}.`,
    };
    return { data: { incentive }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private list(d: CommissionManagementInput): AgentOutput<CommissionManagementOutput> {
    let agreements = [...this.agreements.values()];
    if (d.filter) {
      if (d.filter.airline) agreements = agreements.filter((a) => a.airline === d.filter!.airline);
      if (d.filter.agentId) agreements = agreements.filter((a) => a.agentId === d.filter!.agentId);
      if (d.filter.type) agreements = agreements.filter((a) => a.type === d.filter!.type);
    }
    return { data: { agreements }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  async health(): Promise<AgentHealthStatus> {
    return this.initialized
      ? { status: 'healthy' }
      : { status: 'unhealthy', details: 'Not initialized.' };
  }
  destroy(): void {
    this.initialized = false;
    this.agreements.clear();
  }
}

export type {
  CommissionManagementInput,
  CommissionManagementOutput,
  CommissionAgreement,
  CommissionRate,
  CommissionValidationResult,
  IncentiveResult,
  AgreementType,
  CommissionBasis,
  ValidationStatus,
  CommissionOperation,
} from './types.js';
