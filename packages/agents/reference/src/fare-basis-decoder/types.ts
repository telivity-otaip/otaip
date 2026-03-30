/**
 * Fare Basis Code Decoder — Input/Output types
 *
 * Agent 0.3: Decodes ATPCO-standard fare basis codes into human-readable components.
 * All types derived from the approved spec (agents/specs/0-3-fare-basis-code-decoder.yaml).
 */

/** Cabin class derived from the primary booking code */
export type CabinClass = 'first' | 'business' | 'premium_economy' | 'economy' | 'unknown';

/** Fare type classification */
export type FareType = 'normal' | 'special' | 'excursion' | 'promotional' | 'corporate' | 'unknown';

/** Season indicator decoded from fare basis modifiers */
export type Season = 'high' | 'low' | 'shoulder';

/** Day-of-week indicator */
export type DayOfWeek = 'weekday' | 'weekend';

/** Time unit for stay requirements */
export type StayUnit = 'days' | 'months';

/**
 * Advance purchase requirement decoded from the fare basis code.
 */
export interface AdvancePurchase {
  /** Number of days required for advance purchase, null if not determinable */
  days: number | null;
  /** Human-readable description, e.g. "7-day advance purchase" */
  description: string;
}

/**
 * Minimum or maximum stay requirement.
 */
export interface StayRequirement {
  /** Numeric value of the stay requirement, null if not determinable */
  value: number | null;
  /** Unit of the stay requirement */
  unit: StayUnit | null;
  /** Human-readable description, e.g. "Saturday night stay required" */
  description: string;
}

/**
 * Penalty/restriction information decoded from the fare basis code.
 */
export interface FarePenalties {
  /** Whether the fare is refundable */
  refundable: boolean;
  /** Whether the fare is changeable */
  changeable: boolean;
  /** Whether a change fee applies */
  change_fee_applies: boolean;
  /** Human-readable description of penalties, null if none detected */
  description: string | null;
}

/**
 * Fully decoded fare basis code components.
 */
export interface DecodedFareBasis {
  /** Original fare basis code as provided */
  fare_basis: string;
  /** First letter — the booking class code */
  primary_code: string;
  /** Cabin class mapped from the primary code */
  cabin_class: CabinClass;
  /** Fare type classification */
  fare_type: FareType;
  /** Season indicator, null if not detected */
  season: Season | null;
  /** Day-of-week indicator, null if not detected */
  day_of_week: DayOfWeek | null;
  /** Advance purchase requirement, null if not detected */
  advance_purchase: AdvancePurchase | null;
  /** Minimum stay requirement, null if not detected */
  min_stay: StayRequirement | null;
  /** Maximum stay requirement, null if not detected */
  max_stay: StayRequirement | null;
  /** Penalty/restriction information */
  penalties: FarePenalties;
  /** Ticket designator, null if not detected */
  ticket_designator: string | null;
}

/**
 * Input to the Fare Basis Code Decoder agent.
 */
export interface FareBasisDecoderInput {
  /**
   * ATPCO fare basis code (e.g., "YOW3M1", "TLXP14NR", "B1AKUS").
   * Max 15 characters per ATPCO standard.
   */
  fare_basis: string;
  /**
   * IATA airline code for carrier-specific decoding.
   * Some fare basis patterns are carrier-specific.
   * TODO: [NEEDS DOMAIN INPUT] Carrier-specific pattern maps.
   */
  carrier?: string;
}

/**
 * Output from the Fare Basis Code Decoder agent.
 */
export interface FareBasisDecoderOutput {
  /** Decoded components, null if code cannot be parsed */
  decoded: DecodedFareBasis | null;
  /** 1.0 = fully decoded, 0.5-0.9 = partial, 0 = unknown format */
  match_confidence: number;
  /** Parts of the code that could not be decoded */
  unparsed_segments: string[];
}
