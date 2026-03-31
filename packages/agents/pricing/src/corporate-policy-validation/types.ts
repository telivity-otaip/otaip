export type CabinRank = 'Y' | 'W' | 'C' | 'F';
export type PolicyResult = 'APPROVED' | 'SOFT_VIOLATION' | 'HARD_VIOLATION';
export type PolicyRule = 'CABIN_CLASS' | 'FARE_CEILING' | 'BLOCKED_CARRIER' | 'ADVANCE_BOOKING';
export type PolicySeverity = 'SOFT' | 'HARD';

export interface CorporatePolicy {
  corporateId: string;
  cabinRules: { domestic: CabinRank; international: CabinRank; longHaulThresholdMinutes: number; longHaul: CabinRank };
  fareRules: { maxFareAmount?: string; preferredCarriers?: string[]; blockedCarriers?: string[] };
  bookingRules: { minAdvanceDays?: number; minAdvanceDaysHard?: number };
  bypassCodes?: string[];
}

export interface PolicyViolation { rule: PolicyRule; severity: PolicySeverity; detail: string; policyValue: string; actualValue: string; }

export interface PolicySegment { origin: string; destination: string; durationMinutes: number; }

export interface PolicyValidationInput {
  offer: { offerId: string; cabin: CabinRank; fareAmount: string; currency: string; carrier: string; fareBasis: string; advanceBookingDays: number; segments: PolicySegment[] };
  policy: CorporatePolicy;
  bypassCode?: string;
}

export interface PolicyValidationOutput { result: PolicyResult; violations: PolicyViolation[]; bypassApplied: boolean; }
