/**
 * Traveler Profile — Agent 8.1
 *
 * Stores/retrieves traveler preferences, documents, loyalty programs.
 * Applies profiles to PNRs via SSR injection.
 */

import type {
  Agent, AgentInput, AgentOutput, AgentHealthStatus,
} from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  TravelerProfileInput, TravelerProfileOutput,
  TravelerProfile, SsrInjection,
} from './types.js';
import { VALID_MEAL_CODES } from './types.js';
import { ProfileStore } from './profile-store.js';

const VALID_MEAL_SET = new Set<string>(VALID_MEAL_CODES);

export class TravelerProfileAgent
  implements Agent<TravelerProfileInput, TravelerProfileOutput>
{
  readonly id = '8.1';
  readonly name = 'Traveler Profile';
  readonly version = '0.1.0';

  private initialized = false;
  private store = new ProfileStore();

  getStore(): ProfileStore { return this.store; }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<TravelerProfileInput>,
  ): Promise<AgentOutput<TravelerProfileOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const d = input.data;
    const now = d.current_date ?? new Date().toISOString();

    switch (d.operation) {
      case 'get': return this.handleGet(d);
      case 'create': return this.handleCreate(d, now);
      case 'update': return this.handleUpdate(d, now);
      case 'apply_to_pnr': return this.handleApplyToPnr(d, now);
      case 'search': return this.handleSearch(d);
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Must be get, create, update, apply_to_pnr, or search.');
    }
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
    this.store.clear();
  }

  private handleGet(d: TravelerProfileInput): AgentOutput<TravelerProfileOutput> {
    if (!d.traveler_id) throw new AgentInputValidationError(this.id, 'traveler_id', 'Required for get.');
    const profile = this.store.get(d.traveler_id);
    if (!profile) throw new AgentInputValidationError(this.id, 'traveler_id', 'TRAVELER_NOT_FOUND');
    return this.wrapOutput({ profile }, d.current_date);
  }

  private handleCreate(d: TravelerProfileInput, now: string): AgentOutput<TravelerProfileOutput> {
    if (!d.profile_data) throw new AgentInputValidationError(this.id, 'profile_data', 'Required for create.');
    const pd = d.profile_data;

    if (pd.meal_preference && !VALID_MEAL_SET.has(pd.meal_preference)) {
      throw new AgentInputValidationError(this.id, 'meal_preference', 'INVALID_MEAL_CODE');
    }

    // Duplicate detection
    if (pd.contact_email) {
      const existing = this.store.findByEmail(pd.contact_email);
      if (existing) throw new AgentInputValidationError(this.id, 'contact_email', `DUPLICATE_PROFILE:${existing.traveler_id}`);
    }
    if (pd.passport_number) {
      const existing = this.store.findByPassport(pd.passport_number);
      if (existing) throw new AgentInputValidationError(this.id, 'passport_number', `DUPLICATE_PROFILE:${existing.traveler_id}`);
    }

    const profile: TravelerProfile = {
      traveler_id: this.store.generateId(),
      given_name: pd.given_name ?? '',
      surname: pd.surname ?? '',
      date_of_birth: pd.date_of_birth ?? '',
      nationality: pd.nationality ?? '',
      passport_number: pd.passport_number ?? '',
      passport_expiry: pd.passport_expiry ?? '',
      passport_issuing_country: pd.passport_issuing_country ?? '',
      loyalty_numbers: pd.loyalty_numbers ?? {},
      seat_preference: pd.seat_preference ?? 'NONE',
      meal_preference: pd.meal_preference,
      contact_email: pd.contact_email ?? '',
      contact_phone: pd.contact_phone ?? '',
      known_traveler_number: pd.known_traveler_number,
      redress_number: pd.redress_number,
      corporate_id: pd.corporate_id,
      employee_id: pd.employee_id,
      department: pd.department,
      cost_center: pd.cost_center,
      created_at: now,
      updated_at: now,
    };

    this.store.set(profile);
    return this.wrapOutput({ profile, message: 'Profile created.' }, d.current_date);
  }

  private handleUpdate(d: TravelerProfileInput, now: string): AgentOutput<TravelerProfileOutput> {
    if (!d.traveler_id) throw new AgentInputValidationError(this.id, 'traveler_id', 'Required for update.');
    if (!d.profile_data) throw new AgentInputValidationError(this.id, 'profile_data', 'Required for update.');

    const existing = this.store.get(d.traveler_id);
    if (!existing) throw new AgentInputValidationError(this.id, 'traveler_id', 'TRAVELER_NOT_FOUND');

    if (d.profile_data.meal_preference && !VALID_MEAL_SET.has(d.profile_data.meal_preference)) {
      throw new AgentInputValidationError(this.id, 'meal_preference', 'INVALID_MEAL_CODE');
    }

    const updated: TravelerProfile = { ...existing, ...d.profile_data, traveler_id: existing.traveler_id, created_at: existing.created_at, updated_at: now };
    this.store.set(updated);
    return this.wrapOutput({ profile: updated, message: 'Profile updated.' }, d.current_date);
  }

  private handleApplyToPnr(d: TravelerProfileInput, now: string): AgentOutput<TravelerProfileOutput> {
    if (!d.traveler_id) throw new AgentInputValidationError(this.id, 'traveler_id', 'Required for apply_to_pnr.');
    if (!d.pnr_segments || d.pnr_segments.length === 0) {
      throw new AgentInputValidationError(this.id, 'pnr_segments', 'Required for apply_to_pnr.');
    }

    const profile = this.store.get(d.traveler_id);
    if (!profile) throw new AgentInputValidationError(this.id, 'traveler_id', 'TRAVELER_NOT_FOUND');

    const injections: SsrInjection[] = [];
    const pnrAirlines = new Set(d.pnr_segments.map((s) => s.carrier));
    const hasInternational = d.pnr_segments.some((s) => s.is_international);

    // SSR DOCS (passport)
    if (profile.passport_number && hasInternational) {
      injections.push({
        ssr_type: 'DOCS',
        content: `P/${profile.passport_issuing_country}/${profile.passport_number}/${profile.nationality}/${profile.date_of_birth}/${profile.surname}/${profile.given_name}`,
        injected: true,
      });
    } else if (!profile.passport_number && hasInternational) {
      injections.push({ ssr_type: 'DOCS', content: '', injected: false, skipped_reason: 'No passport on profile.' });
    }

    // SSR FQTV (loyalty) — only for airlines in PNR
    for (const [airline, number] of Object.entries(profile.loyalty_numbers)) {
      if (pnrAirlines.has(airline)) {
        injections.push({ ssr_type: 'FQTV', content: `${airline}/${number}`, injected: true });
      } else {
        injections.push({ ssr_type: 'FQTV', content: `${airline}/${number}`, injected: false, skipped_reason: `Airline ${airline} not in PNR segments.` });
      }
    }

    // SSR MEAL
    if (profile.meal_preference) {
      injections.push({ ssr_type: 'MEAL', content: profile.meal_preference, injected: true });
    }

    // SSR SEAT
    if (profile.seat_preference && profile.seat_preference !== 'NONE') {
      injections.push({ ssr_type: 'SEAT', content: profile.seat_preference, injected: true });
    }

    const passportWarning = this.checkPassportExpiry(profile, now);

    return {
      data: { profile, ssr_injections: injections, passport_expiry_warning: passportWarning },
      confidence: 1.0,
      warnings: passportWarning ? ['Passport expires within 6 months.'] : undefined,
      metadata: { agent_id: this.id, agent_version: this.version, injections_count: injections.filter((i) => i.injected).length },
    };
  }

  private handleSearch(d: TravelerProfileInput): AgentOutput<TravelerProfileOutput> {
    if (!d.search_query) throw new AgentInputValidationError(this.id, 'search_query', 'Required for search.');
    const profiles = this.store.search(d.search_query);
    return { data: { profiles }, confidence: 1.0, metadata: { agent_id: this.id, results: profiles.length } };
  }

  private checkPassportExpiry(profile: TravelerProfile, nowStr: string): boolean {
    if (!profile.passport_expiry) return false;
    const now = new Date(nowStr);
    const expiry = new Date(profile.passport_expiry);
    const sixMonths = new Date(now);
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    return expiry <= sixMonths;
  }

  private wrapOutput(data: TravelerProfileOutput, currentDate?: string): AgentOutput<TravelerProfileOutput> {
    const warnings: string[] = [];
    if (data.profile) {
      const warn = this.checkPassportExpiry(data.profile, currentDate ?? new Date().toISOString());
      if (warn) {
        warnings.push('Passport expires within 6 months.');
        data.passport_expiry_warning = true;
      }
    }
    return {
      data,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: { agent_id: this.id, agent_version: this.version },
    };
  }
}

export type {
  TravelerProfileInput, TravelerProfileOutput, TravelerProfile,
  SsrInjection, PnrSegmentRef, MealCode, SeatPreference, ProfileOperation,
} from './types.js';
export { VALID_MEAL_CODES } from './types.js';
