/**
 * Country Regulatory Resolver — Agent 0.7
 *
 * APIS requirements, visa requirements, restriction levels.
 * Static dataset — must NOT be used as legal travel advice.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  CountryRegulatoryInput,
  CountryRegulatoryOutput,
  APISRequirements,
  VisaRequirement,
  RestrictionInfo,
  APISField,
} from './types.js';

export const REGULATORY_DATA_DISCLAIMER =
  'This data is for operational reference only. Verify all requirements with official government sources before travel.';

const COUNTRY_RE = /^[A-Z]{2}$/;

// ---------- APIS Data ----------
const BASIC_FIELDS: APISField[] = ['passport_number', 'nationality', 'dob', 'gender'];
const UK_FIELDS: APISField[] = ['passport_number', 'nationality', 'dob', 'gender', 'expiry_date'];
const AU_FIELDS: APISField[] = [
  'passport_number',
  'nationality',
  'dob',
  'gender',
  'expiry_date',
  'resident_address',
];
const US_FIELDS: APISField[] = [
  'passport_number',
  'nationality',
  'dob',
  'gender',
  'expiry_date',
  'given_name',
  'surname',
  'country_of_birth',
  'place_of_birth',
  'resident_address',
  'visa_number',
];

const SCHENGEN = new Set([
  'AT',
  'BE',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IS',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'SK',
  'SI',
  'ES',
  'SE',
  'CH',
  'LI',
  'HR',
  'BG',
  'RO',
  'CY',
]);

function getAPIS(code: string): APISRequirements {
  const c = code.toUpperCase();
  if (c === 'US')
    return {
      countryCode: c,
      requiresAPIS: true,
      requiredFields: US_FIELDS,
      advanceSubmissionHours: 72,
      notes: 'Full APIS required for all US-bound flights.',
    };
  if (c === 'GB')
    return {
      countryCode: c,
      requiresAPIS: true,
      requiredFields: UK_FIELDS,
      advanceSubmissionHours: 24,
      notes: 'UK APIS required.',
    };
  if (c === 'AU')
    return {
      countryCode: c,
      requiresAPIS: true,
      requiredFields: AU_FIELDS,
      advanceSubmissionHours: 24,
      notes: 'Australia APIS with residential address.',
    };
  if (c === 'CA')
    return {
      countryCode: c,
      requiresAPIS: true,
      requiredFields: UK_FIELDS,
      advanceSubmissionHours: 24,
      notes: 'Canada APIS required.',
    };
  if (SCHENGEN.has(c))
    return {
      countryCode: c,
      requiresAPIS: true,
      requiredFields: BASIC_FIELDS,
      advanceSubmissionHours: 24,
      notes: 'Schengen zone APIS.',
    };
  return {
    countryCode: c,
    requiresAPIS: false,
    requiredFields: [],
    advanceSubmissionHours: 0,
    notes: 'No APIS requirement on file.',
  };
}

// ---------- Visa Data ----------
type VisaKey = string; // "NAT-DEST"
const VISA_DB = new Map<
  VisaKey,
  { requirement: VisaRequirement['requirement']; maxStayDays?: number; notes: string }
>([
  // US passport
  ...[
    'AT',
    'BE',
    'CZ',
    'DK',
    'EE',
    'FI',
    'FR',
    'DE',
    'GR',
    'HU',
    'IS',
    'IT',
    'LV',
    'LT',
    'LU',
    'MT',
    'NL',
    'NO',
    'PL',
    'PT',
    'SK',
    'SI',
    'ES',
    'SE',
    'CH',
    'LI',
    'HR',
    'BG',
    'RO',
    'CY',
    'GB',
    'CA',
    'MX',
    'BR',
    'JP',
  ].map(
    (d) =>
      [
        `US-${d}`,
        { requirement: 'visa_free' as const, maxStayDays: 90, notes: 'Visa-free travel.' },
      ] as [
        string,
        { requirement: VisaRequirement['requirement']; maxStayDays: number; notes: string },
      ],
  ),
  ['US-AU', { requirement: 'eta_required', maxStayDays: 90, notes: 'ETA required for Australia.' }],
  ['US-IN', { requirement: 'visa_required', notes: 'Indian visa required.' }],
  ['US-CN', { requirement: 'visa_required', notes: 'Chinese visa required.' }],
  ['US-RU', { requirement: 'visa_required', notes: 'Russian visa required.' }],
  ['US-KR', { requirement: 'eta_required', maxStayDays: 90, notes: 'K-ETA required.' }],
  ['US-AE', { requirement: 'visa_on_arrival', maxStayDays: 30, notes: 'Visa on arrival for UAE.' }],
  // Serbian passport (RS)
  ...[
    'AT',
    'BE',
    'CZ',
    'DK',
    'EE',
    'FI',
    'FR',
    'DE',
    'GR',
    'HU',
    'IS',
    'IT',
    'LV',
    'LT',
    'LU',
    'MT',
    'NL',
    'NO',
    'PL',
    'PT',
    'SK',
    'SI',
    'ES',
    'SE',
    'CH',
    'LI',
    'HR',
    'BG',
    'RO',
    'CY',
  ].map(
    (d) =>
      [
        `RS-${d}`,
        { requirement: 'visa_free' as const, maxStayDays: 90, notes: 'Visa-free (Schengen).' },
      ] as [
        string,
        { requirement: VisaRequirement['requirement']; maxStayDays: number; notes: string },
      ],
  ),
  ['RS-US', { requirement: 'visa_required', notes: 'US visa required.' }],
  ['RS-AU', { requirement: 'eta_required', maxStayDays: 90, notes: 'ETA required.' }],
  ['RS-CA', { requirement: 'visa_required', notes: 'Canadian visa required.' }],
  ['RS-GB', { requirement: 'visa_required', notes: 'UK visa required.' }],
  ['RS-TR', { requirement: 'visa_free', maxStayDays: 90, notes: 'Visa-free.' }],
  ['RS-AE', { requirement: 'visa_on_arrival', maxStayDays: 30, notes: 'Visa on arrival.' }],
]);

function getVisa(nationality: string, destination: string): VisaRequirement {
  const key = `${nationality.toUpperCase()}-${destination.toUpperCase()}`;
  const entry = VISA_DB.get(key);
  if (entry)
    return {
      nationality: nationality.toUpperCase(),
      destination: destination.toUpperCase(),
      ...entry,
    };
  return {
    nationality: nationality.toUpperCase(),
    destination: destination.toUpperCase(),
    requirement: 'visa_required',
    notes: 'Unknown combination — verify with embassy.',
  };
}

// ---------- Restriction Data ----------
const RESTRICTION_DB = new Map<string, { level: RestrictionInfo['level']; summary: string }>([
  ['US', { level: 1, summary: 'Normal precautions.' }],
  ['GB', { level: 1, summary: 'Normal precautions.' }],
  ['DE', { level: 1, summary: 'Normal precautions.' }],
  ['FR', { level: 1, summary: 'Normal precautions.' }],
  ['JP', { level: 1, summary: 'Normal precautions.' }],
  ['CA', { level: 1, summary: 'Normal precautions.' }],
  ['AU', { level: 1, summary: 'Normal precautions.' }],
  ['SG', { level: 1, summary: 'Normal precautions.' }],
  ['AE', { level: 1, summary: 'Normal precautions.' }],
  ['MX', { level: 2, summary: 'Exercise increased caution.' }],
  ['BR', { level: 2, summary: 'Exercise increased caution.' }],
  ['TR', { level: 2, summary: 'Exercise increased caution.' }],
  ['IN', { level: 2, summary: 'Exercise increased caution.' }],
  ['EG', { level: 2, summary: 'Exercise increased caution.' }],
  ['ZA', { level: 2, summary: 'Exercise increased caution.' }],
  ['NG', { level: 3, summary: 'Reconsider travel.' }],
  ['PK', { level: 3, summary: 'Reconsider travel.' }],
  ['RU', { level: 3, summary: 'Reconsider travel.' }],
  ['AF', { level: 4, summary: 'Do not travel.' }],
  ['SY', { level: 4, summary: 'Do not travel.' }],
]);

function getRestriction(code: string): RestrictionInfo {
  const c = code.toUpperCase();
  const entry = RESTRICTION_DB.get(c);
  if (entry)
    return {
      countryCode: c,
      level: entry.level,
      lastUpdated: '2026-01-01',
      summary: entry.summary,
    };
  return {
    countryCode: c,
    level: 2,
    lastUpdated: '2026-01-01',
    summary: 'No specific data. Exercise caution.',
  };
}

export class CountryRegulatoryResolver implements Agent<
  CountryRegulatoryInput,
  CountryRegulatoryOutput
> {
  readonly id = '0.7';
  readonly name = 'Country Regulatory Resolver';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<CountryRegulatoryInput>,
  ): Promise<AgentOutput<CountryRegulatoryOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const d = input.data;

    switch (d.operation) {
      case 'getAPISRequirements': {
        if (!d.countryCode || !COUNTRY_RE.test(d.countryCode))
          throw new AgentInputValidationError(this.id, 'countryCode', 'Must be ISO 2-letter code.');
        return {
          data: { apis: getAPIS(d.countryCode) },
          confidence: 1.0,
          metadata: { agent_id: this.id },
        };
      }
      case 'getVisaRequirement': {
        if (!d.nationalityCode || !COUNTRY_RE.test(d.nationalityCode))
          throw new AgentInputValidationError(
            this.id,
            'nationalityCode',
            'Must be ISO 2-letter code.',
          );
        if (!d.destinationCode || !COUNTRY_RE.test(d.destinationCode))
          throw new AgentInputValidationError(
            this.id,
            'destinationCode',
            'Must be ISO 2-letter code.',
          );
        const visa = getVisa(d.nationalityCode, d.destinationCode);
        return {
          data: { visa },
          confidence: visa.notes.includes('Unknown') ? 0.3 : 1.0,
          metadata: { agent_id: this.id },
        };
      }
      case 'getRestrictionLevel': {
        if (!d.countryCode || !COUNTRY_RE.test(d.countryCode))
          throw new AgentInputValidationError(this.id, 'countryCode', 'Must be ISO 2-letter code.');
        const restriction = getRestriction(d.countryCode);
        const warnings =
          restriction.level >= 3
            ? [`${restriction.countryCode}: Level ${restriction.level} — ${restriction.summary}`]
            : undefined;
        return {
          data: { restriction },
          confidence: 1.0,
          warnings,
          metadata: { agent_id: this.id },
        };
      }
      default:
        throw new AgentInputValidationError(
          this.id,
          'operation',
          'Must be getAPISRequirements, getVisaRequirement, or getRestrictionLevel.',
        );
    }
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
  }
}

export type {
  CountryRegulatoryInput,
  CountryRegulatoryOutput,
  APISRequirements,
  VisaRequirement,
  RestrictionInfo,
  APISField,
  VisaRequirementType,
  RestrictionLevel,
  RegulatoryOperation,
} from './types.js';
