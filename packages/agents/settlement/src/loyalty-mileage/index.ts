import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  LoyaltyMileageInput,
  LoyaltyMileageOutput,
  AccrualResult,
  RedemptionEligibility,
  StatusBenefitsResult,
  StatusBenefit,
  StatusMatchResult,
  LoyaltyStatus,
  Alliance,
  RedemptionCabin,
} from './types.js';

const EARN_RATES: Record<string, number> = {
  F: 150,
  J: 150,
  C: 125,
  D: 125,
  I: 0,
  W: 100,
  R: 100,
  Y: 100,
  B: 100,
  M: 100,
  H: 100,
  K: 50,
  L: 50,
  Q: 50,
  T: 50,
  V: 50,
  X: 50,
  O: 0,
  G: 0,
  E: 0,
  N: 0,
};
const STATUS_BONUS: Record<LoyaltyStatus, number> = {
  MEMBER: 0,
  SILVER: 25,
  GOLD: 50,
  PLATINUM: 100,
  LIFETIME_GOLD: 100,
};

const ONEWORLD = new Set([
  'AA',
  'BA',
  'IB',
  'QF',
  'CX',
  'JL',
  'MH',
  'QR',
  'RJ',
  'S7',
  'UL',
  'AT',
  'LA',
  'FJ',
  'AY',
]);
const SKYTEAM = new Set([
  'AF',
  'KL',
  'DL',
  'KE',
  'SU',
  'CZ',
  'MU',
  'VN',
  'GA',
  'AZ',
  'AM',
  'AR',
  'CI',
  'OK',
  'MF',
  'RO',
  'SV',
  'UX',
]);
const STAR = new Set([
  'LH',
  'UA',
  'AC',
  'SQ',
  'TK',
  'OS',
  'NH',
  'OZ',
  'LX',
  'A3',
  'OU',
  'BR',
  'CA',
  'ET',
  'LO',
  'MS',
  'NZ',
  'SA',
  'SK',
  'TP',
]);

function getAlliance(carrier: string): Alliance {
  if (ONEWORLD.has(carrier)) return 'ONEWORLD';
  if (SKYTEAM.has(carrier)) return 'SKYTEAM';
  if (STAR.has(carrier)) return 'STAR_ALLIANCE';
  return 'NONE';
}

function sameAlliance(a: string, b: string): boolean {
  const aa = getAlliance(a);
  const ab = getAlliance(b);
  return aa !== 'NONE' && aa === ab;
}

const REDEMPTION: Record<
  RedemptionCabin,
  Array<{ maxKm: number; label: string; miles: number }>
> = {
  Y: [
    { maxKm: 1000, label: '<1000km', miles: 7500 },
    { maxKm: 3000, label: '1000-3000km', miles: 12500 },
    { maxKm: Infinity, label: '>3000km', miles: 25000 },
  ],
  C: [
    { maxKm: 1000, label: '<1000km', miles: 15000 },
    { maxKm: 3000, label: '1000-3000km', miles: 30000 },
    { maxKm: Infinity, label: '>3000km', miles: 55000 },
  ],
  F: [
    { maxKm: 1000, label: '<1000km', miles: 30000 },
    { maxKm: 3000, label: '1000-3000km', miles: 55000 },
    { maxKm: Infinity, label: '>3000km', miles: 80000 },
  ],
};

interface BenefitEntry {
  benefit: string;
  tiers: Set<LoyaltyStatus>;
}
const CARRIER_BENEFITS: Record<string, BenefitEntry[]> = {
  BA: [
    {
      benefit: 'Priority boarding',
      tiers: new Set<LoyaltyStatus>(['SILVER', 'GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
    {
      benefit: 'Lounge access',
      tiers: new Set<LoyaltyStatus>(['GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
    {
      benefit: 'Extra baggage',
      tiers: new Set<LoyaltyStatus>(['SILVER', 'GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
    {
      benefit: 'Upgrade eligibility',
      tiers: new Set<LoyaltyStatus>(['GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
    {
      benefit: 'Free seat selection',
      tiers: new Set<LoyaltyStatus>(['GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
  ],
  LH: [
    {
      benefit: 'Priority boarding',
      tiers: new Set<LoyaltyStatus>(['SILVER', 'GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
    {
      benefit: 'Lounge access',
      tiers: new Set<LoyaltyStatus>(['GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
    {
      benefit: 'Extra baggage',
      tiers: new Set<LoyaltyStatus>(['SILVER', 'GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
    {
      benefit: 'Upgrade eligibility',
      tiers: new Set<LoyaltyStatus>(['GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
  ],
  AF: [
    {
      benefit: 'Priority boarding',
      tiers: new Set<LoyaltyStatus>(['SILVER', 'GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
    {
      benefit: 'Lounge access',
      tiers: new Set<LoyaltyStatus>(['GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
    {
      benefit: 'Extra baggage',
      tiers: new Set<LoyaltyStatus>(['SILVER', 'GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
  ],
  QR: [
    {
      benefit: 'Priority boarding',
      tiers: new Set<LoyaltyStatus>(['SILVER', 'GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
    {
      benefit: 'Lounge access',
      tiers: new Set<LoyaltyStatus>(['GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
    {
      benefit: 'Extra baggage',
      tiers: new Set<LoyaltyStatus>(['SILVER', 'GOLD', 'PLATINUM', 'LIFETIME_GOLD']),
    },
  ],
};

export class LoyaltyMileageAgent implements Agent<LoyaltyMileageInput, LoyaltyMileageOutput> {
  readonly id = '6.6';
  readonly name = 'Loyalty Mileage';
  readonly version = '0.1.0';
  private initialized = false;
  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<LoyaltyMileageInput>,
  ): Promise<AgentOutput<LoyaltyMileageOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);
    const d = input.data;
    let result: AgentOutput<LoyaltyMileageOutput>;
    switch (d.operation) {
      case 'calculateAccrual':
        result = this.accrual(d);
        break;
      case 'checkRedemptionEligibility':
        result = this.redemption(d);
        break;
      case 'getStatusBenefits':
        result = this.benefits(d);
        break;
      case 'matchStatus':
        result = this.match(d);
        break;
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Invalid.');
    }
    if (result.metadata) {
      result.metadata['operation'] = d.operation;
    }
    return result;
  }

  private accrual(d: LoyaltyMileageInput): AgentOutput<LoyaltyMileageOutput> {
    if (!d.operatingCarrier || !d.bookingClass || d.distanceMiles === undefined)
      throw new AgentInputValidationError(
        this.id,
        'operatingCarrier/bookingClass/distanceMiles',
        'Required.',
      );
    if (!/^[A-Z]$/i.test(d.bookingClass))
      throw new AgentInputValidationError(this.id, 'bookingClass', 'Must be a single letter A-Z.');
    const earnPct = EARN_RATES[d.bookingClass.toUpperCase()] ?? 100;
    const baseMiles = Math.round((d.distanceMiles * earnPct) / 100);
    const statusLvl = d.loyaltyStatus ?? 'MEMBER';
    const bonusPct = STATUS_BONUS[statusLvl];
    const bonusMiles = Math.round((baseMiles * bonusPct) / 100);
    const creditCarrier = d.creditingCarrier ?? d.operatingCarrier;
    const isPartner =
      creditCarrier !== d.operatingCarrier && sameAlliance(creditCarrier, d.operatingCarrier);

    const accrual: AccrualResult = {
      distanceMiles: d.distanceMiles,
      bookingClass: d.bookingClass,
      earnRatePercent: earnPct,
      baseMiles,
      statusBonusPercent: bonusPct,
      bonusMiles,
      totalMiles: baseMiles + bonusMiles,
      operatingCarrier: d.operatingCarrier,
      isPartnerEarning: isPartner,
      alliance: getAlliance(d.operatingCarrier),
    };
    return { data: { accrual }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private redemption(d: LoyaltyMileageInput): AgentOutput<LoyaltyMileageOutput> {
    if (!d.redemptionCabin || d.distanceKm === undefined || d.currentBalance === undefined)
      throw new AgentInputValidationError(
        this.id,
        'redemptionCabin/distanceKm/currentBalance',
        'Required.',
      );
    if (!['Y', 'C', 'F'].includes(d.redemptionCabin))
      throw new AgentInputValidationError(this.id, 'redemptionCabin', 'Must be Y, C, or F.');
    const table = REDEMPTION[d.redemptionCabin];
    let required = table[table.length - 1]!.miles;
    let label = table[table.length - 1]!.label;
    for (const tier of table) {
      if (d.distanceKm <= tier.maxKm) {
        required = tier.miles;
        label = tier.label;
        break;
      }
    }
    if (d.isPartnerRedemption) required = Math.round(required * 1.25);
    const remaining = d.currentBalance - required;

    const redemption: RedemptionEligibility = {
      eligible: remaining >= 0,
      milesRequired: required,
      cabin: d.redemptionCabin,
      distanceBracket: label,
      isPartnerRedemption: d.isPartnerRedemption ?? false,
      currentBalance: d.currentBalance,
      remainingBalance: remaining,
    };
    return { data: { redemption }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private benefits(d: LoyaltyMileageInput): AgentOutput<LoyaltyMileageOutput> {
    if (!d.airline || !d.status)
      throw new AgentInputValidationError(this.id, 'airline/status', 'Required.');
    const entries = CARRIER_BENEFITS[d.airline];
    if (!entries)
      return {
        data: { errorMessage: `No benefits data available for airline ${d.airline}.` },
        confidence: 0,
        metadata: { agent_id: this.id },
      };
    const benefits: StatusBenefit[] = entries.map((e) => ({
      benefit: e.benefit,
      included: e.tiers.has(d.status!),
    }));
    const result: StatusBenefitsResult = { airline: d.airline, status: d.status, benefits };
    return { data: { statusBenefits: result }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private match(d: LoyaltyMileageInput): AgentOutput<LoyaltyMileageOutput> {
    if (!d.sourceAirline || !d.sourceStatus || !d.targetAirline)
      throw new AgentInputValidationError(
        this.id,
        'sourceAirline/sourceStatus/targetAirline',
        'Required.',
      );
    let matchedStatus: LoyaltyStatus = 'MEMBER';
    let matchGranted = false;
    if (d.sourceStatus === 'PLATINUM') {
      matchedStatus = 'GOLD';
      matchGranted = true;
    } else if (d.sourceStatus === 'GOLD') {
      matchedStatus = 'GOLD';
      matchGranted = true;
    } else if (d.sourceStatus === 'SILVER') {
      matchedStatus = 'SILVER';
      matchGranted = true;
    } else if (d.sourceStatus === 'LIFETIME_GOLD') {
      matchedStatus = 'GOLD';
      matchGranted = true;
    }

    const result: StatusMatchResult = {
      sourceAirline: d.sourceAirline,
      sourceStatus: d.sourceStatus,
      targetAirline: d.targetAirline,
      matchedStatus,
      matchGranted,
      notes: matchGranted
        ? '12-month trial period. Must qualify within period.'
        : 'Base tier does not qualify for status match.',
    };
    return { data: { statusMatch: result }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  async health(): Promise<AgentHealthStatus> {
    return this.initialized
      ? { status: 'healthy' }
      : { status: 'unhealthy', details: 'Not initialized.' };
  }
  destroy(): void {
    this.initialized = false;
  }
}

export type {
  LoyaltyMileageInput,
  LoyaltyMileageOutput,
  AccrualResult,
  RedemptionEligibility,
  StatusBenefitsResult,
  StatusBenefit,
  StatusMatchResult,
  LoyaltyStatus,
  Alliance,
  RedemptionCabin,
} from './types.js';
