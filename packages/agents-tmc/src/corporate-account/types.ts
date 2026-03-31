/**
 * Corporate Account — Types
 *
 * Agent 8.2: Corporate travel policy and negotiated fares.
 */

export type CabinClass = 'economy' | 'business' | 'first';

export type CorporateOperation =
  | 'get_account' | 'create_account' | 'update_account'
  | 'validate_booking' | 'get_policy' | 'list_accounts'
  | 'get_preferred_suppliers';

export type ViolationSeverity = 'hard' | 'soft';

export interface TravelPolicy {
  max_cabin_domestic: CabinClass;
  max_cabin_international_under_6h: CabinClass;
  max_cabin_international_over_6h: CabinClass;
  advance_booking_requirement_days: number;
  advance_booking_exception_threshold_days: number;
  max_fare_domestic_usd: number;
  max_fare_international_usd: number;
  require_approval_above_usd: number;
  preferred_airlines: string[];
  blacklisted_airlines: string[];
  out_of_policy_booking_allowed: boolean;
  out_of_policy_requires_reason: boolean;
}

export interface NegotiatedFare {
  airline: string;
  fare_basis: string;
  cabin: CabinClass;
  discount_percent: number;
  valid_from: string;
  valid_to: string;
}

export interface CorporateAccount {
  account_id: string;
  company_name: string;
  iata_number?: string;
  policy: TravelPolicy;
  negotiated_fares: NegotiatedFare[];
  contact_email: string;
  contact_name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookingValidationSegment {
  carrier: string;
  origin: string;
  destination: string;
  origin_country: string;
  destination_country: string;
  departure_date: string;
  cabin: CabinClass;
  flight_duration_hours: number;
}

export interface PolicyViolation {
  rule: string;
  severity: ViolationSeverity;
  message: string;
}

export interface BookingValidationResult {
  in_policy: boolean;
  blocked: boolean;
  requires_approval: boolean;
  violations: PolicyViolation[];
  preferred_fare_available?: {
    airline: string;
    fare_basis: string;
    discount_percent: number;
    estimated_saving_usd: string;
  };
}

export interface CorporateAccountInput {
  operation: CorporateOperation;
  account_id?: string;
  account_data?: Partial<Omit<CorporateAccount, 'account_id' | 'created_at' | 'updated_at'>>;
  booking?: {
    segments: BookingValidationSegment[];
    fare_amount_usd: string;
    airline: string;
  };
  current_date?: string;
}

export interface CorporateAccountOutput {
  account?: CorporateAccount;
  accounts?: CorporateAccount[];
  validation?: BookingValidationResult;
  policy?: TravelPolicy;
  preferred_suppliers?: string[];
  message?: string;
}
