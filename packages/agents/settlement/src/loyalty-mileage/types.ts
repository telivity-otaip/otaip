/**
 * Loyalty & Mileage — Types
 *
 * Agent 6.6: Mileage accrual calculation, redemption eligibility,
 * status benefits lookup, and cross-airline status matching.
 */

export type LoyaltyStatus = 'MEMBER' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'LIFETIME_GOLD';

export type Alliance = 'ONEWORLD' | 'SKYTEAM' | 'STAR_ALLIANCE' | 'NONE';

export type RedemptionCabin = 'Y' | 'C' | 'F';

export interface AccrualResult {
  /** Flight distance in miles */
  distanceMiles: number;
  /** Booking class */
  bookingClass: string;
  /** Earn rate percentage */
  earnRatePercent: number;
  /** Base miles earned (distance * earnRate) */
  baseMiles: number;
  /** Status bonus percentage */
  statusBonusPercent: number;
  /** Bonus miles from status */
  bonusMiles: number;
  /** Total miles earned */
  totalMiles: number;
  /** Operating carrier */
  operatingCarrier: string;
  /** Whether earning on a partner airline */
  isPartnerEarning: boolean;
  /** Alliance */
  alliance: Alliance;
}

export interface RedemptionEligibility {
  /** Whether eligible to redeem */
  eligible: boolean;
  /** Miles required */
  milesRequired: number;
  /** Cabin class for redemption */
  cabin: RedemptionCabin;
  /** Distance bracket label */
  distanceBracket: string;
  /** Whether this is a partner redemption (1.25x) */
  isPartnerRedemption: boolean;
  /** Passenger current miles balance */
  currentBalance: number;
  /** Miles remaining after redemption (negative = not enough) */
  remainingBalance: number;
}

export interface StatusBenefit {
  /** Benefit description */
  benefit: string;
  /** Whether this benefit is included at this tier */
  included: boolean;
}

export interface StatusBenefitsResult {
  /** Airline code */
  airline: string;
  /** Loyalty status tier */
  status: LoyaltyStatus;
  /** List of benefits */
  benefits: StatusBenefit[];
}

export interface StatusMatchResult {
  /** Source airline */
  sourceAirline: string;
  /** Source status */
  sourceStatus: LoyaltyStatus;
  /** Target airline */
  targetAirline: string;
  /** Matched status at target */
  matchedStatus: LoyaltyStatus;
  /** Whether the match was granted */
  matchGranted: boolean;
  /** Notes about the match */
  notes: string;
}

export interface LoyaltyMileageInput {
  /** Operation to perform */
  operation:
    | 'calculateAccrual'
    | 'checkRedemptionEligibility'
    | 'getStatusBenefits'
    | 'matchStatus';

  /** Operating carrier code */
  operatingCarrier?: string;
  /** Crediting carrier code (the program to credit to) */
  creditingCarrier?: string;
  /** Booking class (single letter) */
  bookingClass?: string;
  /** Flight distance in miles */
  distanceMiles?: number;
  /** Passenger loyalty status */
  loyaltyStatus?: LoyaltyStatus;

  /** Distance in km for redemption */
  distanceKm?: number;
  /** Desired cabin for redemption */
  redemptionCabin?: RedemptionCabin;
  /** Whether partner redemption */
  isPartnerRedemption?: boolean;
  /** Current miles balance */
  currentBalance?: number;

  /** Airline code for benefits lookup */
  airline?: string;
  /** Status tier to look up */
  status?: LoyaltyStatus;

  /** Source airline for status match */
  sourceAirline?: string;
  /** Source status */
  sourceStatus?: LoyaltyStatus;
  /** Target airline */
  targetAirline?: string;
}

export interface LoyaltyMileageOutput {
  /** Accrual calculation result */
  accrual?: AccrualResult;
  /** Redemption eligibility result */
  redemption?: RedemptionEligibility;
  /** Status benefits */
  statusBenefits?: StatusBenefitsResult;
  /** Status match result */
  statusMatch?: StatusMatchResult;
  /** Error message */
  errorMessage?: string;
}
