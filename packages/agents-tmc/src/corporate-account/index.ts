/**
 * Corporate Account — Agent 8.2
 *
 * Corporate travel policy enforcement, negotiated fares, booking validation.
 */

import Decimal from 'decimal.js';
import type {
  Agent, AgentInput, AgentOutput, AgentHealthStatus,
} from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  CorporateAccountInput, CorporateAccountOutput,
  CorporateAccount, BookingValidationResult, PolicyViolation,
  CabinClass,
} from './types.js';

const CABIN_RANK: Record<CabinClass, number> = { economy: 0, business: 1, first: 2 };

export class CorporateAccountAgent
  implements Agent<CorporateAccountInput, CorporateAccountOutput>
{
  readonly id = '8.2';
  readonly name = 'Corporate Account';
  readonly version = '0.1.0';

  private initialized = false;
  private accounts = new Map<string, CorporateAccount>();
  private nextId = 1;

  getAccounts(): Map<string, CorporateAccount> { return this.accounts; }

  async initialize(): Promise<void> { this.initialized = true; }

  async execute(
    input: AgentInput<CorporateAccountInput>,
  ): Promise<AgentOutput<CorporateAccountOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const d = input.data;
    const now = d.current_date ?? new Date().toISOString();

    switch (d.operation) {
      case 'get_account': return this.handleGet(d);
      case 'create_account': return this.handleCreate(d, now);
      case 'update_account': return this.handleUpdate(d, now);
      case 'validate_booking': return this.handleValidate(d, now);
      case 'get_policy': return this.handleGetPolicy(d);
      case 'list_accounts': return this.handleList();
      case 'get_preferred_suppliers': return this.handlePreferred(d);
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Invalid operation.');
    }
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }

  destroy(): void { this.initialized = false; this.accounts.clear(); this.nextId = 1; }

  private handleGet(d: CorporateAccountInput): AgentOutput<CorporateAccountOutput> {
    if (!d.account_id) throw new AgentInputValidationError(this.id, 'account_id', 'Required.');
    const account = this.accounts.get(d.account_id);
    if (!account) throw new AgentInputValidationError(this.id, 'account_id', 'ACCOUNT_NOT_FOUND');
    return { data: { account }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private handleCreate(d: CorporateAccountInput, now: string): AgentOutput<CorporateAccountOutput> {
    if (!d.account_data) throw new AgentInputValidationError(this.id, 'account_data', 'Required.');

    // Duplicate check
    for (const existing of this.accounts.values()) {
      if (existing.company_name === d.account_data.company_name) {
        throw new AgentInputValidationError(this.id, 'company_name', `DUPLICATE_ACCOUNT:${existing.account_id}`);
      }
    }

    const account: CorporateAccount = {
      account_id: `CORP${String(this.nextId++).padStart(6, '0')}`,
      company_name: d.account_data.company_name ?? '',
      iata_number: d.account_data.iata_number,
      policy: d.account_data.policy ?? {
        max_cabin_domestic: 'economy',
        max_cabin_international_under_6h: 'economy',
        max_cabin_international_over_6h: 'business',
        advance_booking_requirement_days: 14,
        advance_booking_exception_threshold_days: 3,
        max_fare_domestic_usd: 1000,
        max_fare_international_usd: 5000,
        require_approval_above_usd: 3000,
        preferred_airlines: [],
        blacklisted_airlines: [],
        out_of_policy_booking_allowed: true,
        out_of_policy_requires_reason: true,
      },
      negotiated_fares: d.account_data.negotiated_fares ?? [],
      contact_email: d.account_data.contact_email ?? '',
      contact_name: d.account_data.contact_name ?? '',
      active: d.account_data.active ?? true,
      created_at: now,
      updated_at: now,
    };

    this.accounts.set(account.account_id, account);
    return { data: { account, message: 'Account created.' }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private handleUpdate(d: CorporateAccountInput, now: string): AgentOutput<CorporateAccountOutput> {
    if (!d.account_id) throw new AgentInputValidationError(this.id, 'account_id', 'Required.');
    if (!d.account_data) throw new AgentInputValidationError(this.id, 'account_data', 'Required.');
    const existing = this.accounts.get(d.account_id);
    if (!existing) throw new AgentInputValidationError(this.id, 'account_id', 'ACCOUNT_NOT_FOUND');

    const updated: CorporateAccount = {
      ...existing,
      ...d.account_data,
      account_id: existing.account_id,
      created_at: existing.created_at,
      updated_at: now,
      policy: d.account_data.policy ?? existing.policy,
      negotiated_fares: d.account_data.negotiated_fares ?? existing.negotiated_fares,
    };
    this.accounts.set(updated.account_id, updated);
    return { data: { account: updated, message: 'Account updated.' }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private handleValidate(d: CorporateAccountInput, now: string): AgentOutput<CorporateAccountOutput> {
    if (!d.account_id) throw new AgentInputValidationError(this.id, 'account_id', 'Required.');
    if (!d.booking) throw new AgentInputValidationError(this.id, 'booking', 'Required.');

    const account = this.accounts.get(d.account_id);
    if (!account) throw new AgentInputValidationError(this.id, 'account_id', 'ACCOUNT_NOT_FOUND');

    const policy = account.policy;
    const violations: PolicyViolation[] = [];
    const fareAmount = new Decimal(d.booking.fare_amount_usd);

    // Blacklist check
    if (policy.blacklisted_airlines.includes(d.booking.airline)) {
      throw new AgentInputValidationError(this.id, 'airline', 'AIRLINE_BLACKLISTED');
    }

    for (const seg of d.booking.segments) {
      const isDomestic = seg.origin_country === seg.destination_country;

      // Cabin policy
      let maxCabin: CabinClass;
      if (isDomestic) {
        maxCabin = policy.max_cabin_domestic;
      } else if (seg.flight_duration_hours < 6) {
        maxCabin = policy.max_cabin_international_under_6h;
      } else {
        maxCabin = policy.max_cabin_international_over_6h;
      }

      if (CABIN_RANK[seg.cabin] > CABIN_RANK[maxCabin]) {
        violations.push({
          rule: 'cabin_class',
          severity: 'hard',
          message: `Cabin ${seg.cabin} exceeds policy max ${maxCabin} for ${isDomestic ? 'domestic' : `international ${seg.flight_duration_hours < 6 ? '<6h' : '>=6h'}`} flight.`,
        });
      }

      // Fare limit
      const maxFare = isDomestic ? policy.max_fare_domestic_usd : policy.max_fare_international_usd;
      if (fareAmount.greaterThan(maxFare)) {
        violations.push({
          rule: 'fare_limit',
          severity: 'soft',
          message: `Fare ${fareAmount.toFixed(2)} USD exceeds ${isDomestic ? 'domestic' : 'international'} limit ${maxFare} USD.`,
        });
      }
    }

    // Advance booking
    if (d.booking.segments.length > 0) {
      const firstDep = d.booking.segments[0]!.departure_date;
      const today = new Date(now);
      const dep = new Date(firstDep);
      const daysAdvance = Math.floor((dep.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (daysAdvance < policy.advance_booking_exception_threshold_days) {
        violations.push({ rule: 'advance_booking', severity: 'hard', message: `Booked ${daysAdvance} days before departure (exception threshold: ${policy.advance_booking_exception_threshold_days} days).` });
      } else if (daysAdvance < policy.advance_booking_requirement_days) {
        violations.push({ rule: 'advance_booking', severity: 'soft', message: `Booked ${daysAdvance} days before departure (requirement: ${policy.advance_booking_requirement_days} days).` });
      }
    }

    const hasHardViolation = violations.some((v) => v.severity === 'hard');
    const blocked = !policy.out_of_policy_booking_allowed && hasHardViolation;
    const requiresApproval = fareAmount.greaterThan(policy.require_approval_above_usd);

    // Negotiated fare check
    const todayStr = now.slice(0, 10);
    const negotiatedFare = account.negotiated_fares.find(
      (nf) => nf.airline === d.booking!.airline && nf.valid_from <= todayStr && (!nf.valid_to || nf.valid_to >= todayStr),
    );

    const validation: BookingValidationResult = {
      in_policy: violations.length === 0,
      blocked,
      requires_approval: requiresApproval,
      violations,
      preferred_fare_available: negotiatedFare ? {
        airline: negotiatedFare.airline,
        fare_basis: negotiatedFare.fare_basis,
        discount_percent: negotiatedFare.discount_percent,
        estimated_saving_usd: fareAmount.times(negotiatedFare.discount_percent).dividedBy(100).toFixed(2),
      } : undefined,
    };

    return {
      data: { validation },
      confidence: 1.0,
      warnings: blocked ? ['Booking blocked by corporate policy.'] : undefined,
      metadata: { agent_id: this.id, violations: violations.length, blocked },
    };
  }

  private handleGetPolicy(d: CorporateAccountInput): AgentOutput<CorporateAccountOutput> {
    if (!d.account_id) throw new AgentInputValidationError(this.id, 'account_id', 'Required.');
    const account = this.accounts.get(d.account_id);
    if (!account) throw new AgentInputValidationError(this.id, 'account_id', 'ACCOUNT_NOT_FOUND');
    return { data: { policy: account.policy }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private handleList(): AgentOutput<CorporateAccountOutput> {
    return { data: { accounts: [...this.accounts.values()] }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private handlePreferred(d: CorporateAccountInput): AgentOutput<CorporateAccountOutput> {
    if (!d.account_id) throw new AgentInputValidationError(this.id, 'account_id', 'Required.');
    const account = this.accounts.get(d.account_id);
    if (!account) throw new AgentInputValidationError(this.id, 'account_id', 'ACCOUNT_NOT_FOUND');
    return { data: { preferred_suppliers: account.policy.preferred_airlines }, confidence: 1.0, metadata: { agent_id: this.id } };
  }
}

export type {
  CorporateAccountInput, CorporateAccountOutput, CorporateAccount,
  TravelPolicy, NegotiatedFare, BookingValidationResult, PolicyViolation,
  BookingValidationSegment, CabinClass, ViolationSeverity, CorporateOperation,
} from './types.js';
