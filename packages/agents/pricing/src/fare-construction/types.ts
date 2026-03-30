/**
 * Fare Construction — Input/Output types
 *
 * Agent 2.2: NUC × ROE fare construction with mileage validation,
 * HIP/BHC/CTM checks, surcharges, and IATA rounding.
 */

export type JourneyType = 'OW' | 'RT' | 'CT';

export interface FareComponent {
  /** Origin airport */
  origin: string;
  /** Destination airport */
  destination: string;
  /** Carrier */
  carrier: string;
  /** Fare basis code */
  fare_basis: string;
  /** NUC amount for this component */
  nuc_amount: string;
}

export interface FareConstructionInput {
  /** Journey type: OW (one-way), RT (round-trip), CT (circle-trip) */
  journey_type: JourneyType;
  /** Fare components (segments with NUC amounts) */
  components: FareComponent[];
  /** Point of sale currency (ISO 4217) */
  selling_currency: string;
  /** Point of sale country (for ROE selection) */
  point_of_sale?: string;
}

export interface MileageCheck {
  /** City pair */
  origin: string;
  destination: string;
  /** Ticketed Point Mileage */
  tpm: number | null;
  /** Maximum Permitted Mileage */
  mph: number | null;
  /** Whether mileage data was found */
  data_available: boolean;
}

export interface HipCheck {
  /** Whether HIP (Higher Intermediate Point) was detected */
  detected: boolean;
  /** The intermediate point that triggered HIP */
  hip_point: string | null;
  /** HIP fare amount in NUC */
  hip_nuc: string | null;
  /** Description */
  description: string;
}

export interface BhcCheck {
  /** Whether BHC (Backhaul Check) was detected */
  detected: boolean;
  /** Description */
  description: string;
}

export interface CtmCheck {
  /** Whether CTM (Circle Trip Minimum) applies */
  applies: boolean;
  /** CTM amount in NUC */
  ctm_nuc: string | null;
  /** Description */
  description: string;
}

export interface MileageSurcharge {
  /** Whether a mileage surcharge applies */
  applies: boolean;
  /** Surcharge percentage (5, 10, 15, 20, 25) */
  percentage: number;
  /** Surcharge amount in NUC */
  surcharge_nuc: string;
  /** Description */
  description: string;
}

export interface AuditStep {
  /** Step number */
  step: number;
  /** Step name */
  name: string;
  /** Description of calculation */
  description: string;
  /** Input value */
  input: string;
  /** Output value */
  output: string;
}

export interface FareConstructionOutput {
  /** Total NUC amount (sum of components + surcharges) */
  total_nuc: string;
  /** ROE used for conversion */
  roe: string;
  /** Local currency amount before rounding */
  local_amount_raw: string;
  /** Local currency amount after IATA rounding */
  local_amount: string;
  /** Selling currency */
  currency: string;
  /** Rounding rule applied */
  rounding_unit: string;
  /** Mileage validation per component */
  mileage_checks: MileageCheck[];
  /** Total ticketed mileage */
  total_tpm: number;
  /** Total maximum permitted mileage */
  total_mph: number;
  /** Whether total mileage exceeds MPM */
  mileage_exceeded: boolean;
  /** Mileage surcharge (if applicable) */
  mileage_surcharge: MileageSurcharge;
  /** HIP check result */
  hip_check: HipCheck;
  /** BHC check result */
  bhc_check: BhcCheck;
  /** CTM check result (CT journeys only) */
  ctm_check: CtmCheck;
  /** Full audit trail */
  audit_trail: AuditStep[];
}
