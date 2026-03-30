/**
 * Class of Service Mapper — Input/Output types
 *
 * Agent 0.4: Maps single-letter booking class codes to cabin class, fare family,
 * upgrade eligibility, and loyalty program earning rates.
 * All types derived from the approved spec (agents/specs/0-4-class-of-service-mapper.yaml).
 */

/** Cabin class classification */
export type CabinClass = 'first' | 'business' | 'premium_economy' | 'economy';

/** Upgrade type for a booking class */
export type UpgradeType = 'instrument' | 'mileage' | 'complimentary' | 'gpu' | 'not_eligible';

/** Seat selection availability */
export type SeatSelection = 'included' | 'paid' | 'none' | 'at_check_in';

/** Priority level for boarding, check-in, etc. */
export type PriorityLevel = 'standard' | 'preferred' | 'premium';

/** PQP earning method */
export type PqpEarning = 'fare_based' | 'distance_based';

/**
 * Loyalty program earning rates for a booking class.
 */
export interface LoyaltyEarning {
  /** Program name, e.g. "MileagePlus", "AAdvantage" */
  program_name: string;
  /** Redeemable miles earning rate as a percentage of distance flown */
  rdm_percent: number;
  /** Premier/elite qualifying miles percentage, if applicable */
  pqm_percent: number | null;
  /** How PQP/PQD are earned */
  pqp_earning: PqpEarning | null;
  /** Whether this class earns toward elite status */
  status_earning: boolean;
}

/**
 * Resolved booking class mapping for a carrier + class combination.
 */
export interface ClassMapping {
  /** The input booking class letter */
  booking_class: string;
  /** IATA carrier code */
  carrier: string;
  /** Cabin class category */
  cabin_class: CabinClass;
  /** Carrier's marketing name for the cabin, e.g. "Polaris" for UA Business */
  cabin_brand_name: string | null;
  /** Fare family name, e.g. "Basic Economy", "Main Cabin", "Business Saver" */
  fare_family: string | null;
  /** Whether the booking class is eligible for upgrades */
  upgrade_eligible: boolean;
  /** Type of upgrade available */
  upgrade_type: UpgradeType | null;
  /** Eligible for same-day confirmed/standby changes */
  same_day_change: boolean;
  /** Seat selection availability */
  seat_selection: SeatSelection;
  /** Whether changes are permitted */
  changes_allowed: boolean;
  /** Whether the fare is refundable */
  refundable: boolean;
  /** Priority level for boarding, check-in, etc. */
  priority: PriorityLevel;
  /** Loyalty earning rates, populated when include_loyalty is true */
  loyalty_earning: LoyaltyEarning | null;
}

/**
 * Input for the Class of Service Mapper agent.
 */
export interface ClassOfServiceMapperInput {
  /** Single-letter booking class code (A-Z) */
  booking_class: string;
  /** IATA 2-letter airline code. Required because booking class meanings are carrier-specific. */
  carrier: string;
  /** If true, include loyalty earning rates in the output. Default: false */
  include_loyalty?: boolean;
}

/**
 * Output from the Class of Service Mapper agent.
 */
export interface ClassOfServiceMapperOutput {
  /** Resolved class mapping, null if unknown carrier/class combination */
  mapping: ClassMapping | null;
  /** 1.0 = carrier-specific mapping, 0.7 = IATA default, 0 = unknown */
  match_confidence: number;
}
