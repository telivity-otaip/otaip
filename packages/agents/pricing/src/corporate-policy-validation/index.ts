import Decimal from 'decimal.js';
import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type { PolicyValidationInput, PolicyValidationOutput, PolicyViolation, CabinRank, PolicyResult } from './types.js';

const CABIN_ORDER: Record<CabinRank, number> = { Y: 0, W: 1, C: 2, F: 3 };

export class CorporatePolicyValidationAgent implements Agent<PolicyValidationInput, PolicyValidationOutput> {
  readonly id = '2.5'; readonly name = 'Corporate Policy Validation'; readonly version = '0.1.0';
  private initialized = false;

  async initialize(): Promise<void> { this.initialized = true; }

  async execute(input: AgentInput<PolicyValidationInput>): Promise<AgentOutput<PolicyValidationOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);
    const d = input.data;
    if (!d.offer) throw new AgentInputValidationError(this.id, 'offer', 'Required.');
    if (!d.policy) throw new AgentInputValidationError(this.id, 'policy', 'Required.');

    const violations: PolicyViolation[] = [];
    const policy = d.policy;
    const offer = d.offer;

    // Cabin check
    const isLongHaul = offer.segments.some((s) => s.durationMinutes >= policy.cabinRules.longHaulThresholdMinutes);
    // Simple domestic check: single-country assumption — spec doesn't define domestic detection,
    // so we use longHaul vs shortHaul international
    const maxCabin = isLongHaul ? policy.cabinRules.longHaul : policy.cabinRules.international;
    if (CABIN_ORDER[offer.cabin] > CABIN_ORDER[maxCabin]) {
      violations.push({ rule: 'CABIN_CLASS', severity: 'HARD', detail: `Cabin ${offer.cabin} exceeds max ${maxCabin}.`, policyValue: maxCabin, actualValue: offer.cabin });
    }

    // Fare ceiling
    if (policy.fareRules.maxFareAmount) {
      const max = new Decimal(policy.fareRules.maxFareAmount);
      const fare = new Decimal(offer.fareAmount);
      if (fare.greaterThan(max)) {
        violations.push({ rule: 'FARE_CEILING', severity: 'HARD', detail: `Fare ${offer.fareAmount} exceeds max ${policy.fareRules.maxFareAmount}.`, policyValue: policy.fareRules.maxFareAmount, actualValue: offer.fareAmount });
      }
    }

    // Blocked carrier
    if (policy.fareRules.blockedCarriers?.includes(offer.carrier)) {
      violations.push({ rule: 'BLOCKED_CARRIER', severity: 'HARD', detail: `Carrier ${offer.carrier} is blocked.`, policyValue: 'blocked', actualValue: offer.carrier });
    }

    // Advance booking
    if (policy.bookingRules.minAdvanceDaysHard !== undefined && offer.advanceBookingDays < policy.bookingRules.minAdvanceDaysHard) {
      violations.push({ rule: 'ADVANCE_BOOKING', severity: 'HARD', detail: `${offer.advanceBookingDays} days advance (hard min: ${policy.bookingRules.minAdvanceDaysHard}).`, policyValue: String(policy.bookingRules.minAdvanceDaysHard), actualValue: String(offer.advanceBookingDays) });
    } else if (policy.bookingRules.minAdvanceDays !== undefined && offer.advanceBookingDays < policy.bookingRules.minAdvanceDays) {
      violations.push({ rule: 'ADVANCE_BOOKING', severity: 'SOFT', detail: `${offer.advanceBookingDays} days advance (soft min: ${policy.bookingRules.minAdvanceDays}).`, policyValue: String(policy.bookingRules.minAdvanceDays), actualValue: String(offer.advanceBookingDays) });
    }

    // Bypass
    const bypassApplied = !!d.bypassCode && (policy.bypassCodes ?? []).includes(d.bypassCode);
    const hasHard = violations.some((v) => v.severity === 'HARD');
    const hasSoft = violations.some((v) => v.severity === 'SOFT');

    let result: PolicyResult;
    if (hasHard) result = 'HARD_VIOLATION';
    else if (hasSoft && !bypassApplied) result = 'SOFT_VIOLATION';
    else result = 'APPROVED';

    return {
      data: { result, violations, bypassApplied },
      confidence: 1.0,
      warnings: hasHard ? ['Hard policy violation detected.'] : undefined,
      metadata: { agent_id: this.id, result, violations: violations.length },
    };
  }

  async health(): Promise<AgentHealthStatus> { return this.initialized ? { status: 'healthy' } : { status: 'unhealthy', details: 'Not initialized.' }; }
  destroy(): void { this.initialized = false; }
}

export type { PolicyValidationInput, PolicyValidationOutput, PolicyViolation, CorporatePolicy, PolicySegment, CabinRank, PolicyResult, PolicyRule, PolicySeverity } from './types.js';
