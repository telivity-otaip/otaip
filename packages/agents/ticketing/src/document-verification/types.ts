/**
 * Document Verification — Types
 *
 * Agent 4.5: APIS validation, passport validity, visa check stub.
 */

export type VerificationSeverity = 'blocking' | 'advisory';

export interface VisaRequirement {
  /** Whether a visa is required */
  required: boolean;
  /** Visa type (e.g. "Tourist", "Transit") */
  visa_type?: string;
  /** Notes */
  notes?: string;
}

/**
 * Stub interface for Agent 0.7 (Country & Regulatory Resolver).
 * TODO: [NEEDS DOMAIN INPUT] Replace with actual Agent 0.7 when built.
 */
export interface CountryRegulatoryResolver {
  getVisaRequirements(passport: string, destination: string): Promise<VisaRequirement>;
}

export interface PassengerDocument {
  /** Passenger name on ticket (LAST/FIRST) */
  ticket_name: string;
  /** Passenger name on passport (LAST/FIRST) */
  passport_name: string;
  /** Passport number */
  passport_number: string;
  /** Nationality (ISO 2-letter) */
  nationality: string;
  /** Date of birth (ISO) */
  date_of_birth?: string;
  /** Passport expiry date (ISO) */
  passport_expiry: string;
  /** Gender */
  gender?: 'M' | 'F';
}

export interface TravelSegment {
  /** Destination country code (ISO 2-letter) */
  destination_country: string;
  /** Travel date (ISO) */
  travel_date: string;
}

export interface PassengerVerificationResult {
  /** Passenger name */
  passenger_name: string;
  /** Overall pass/fail */
  passed: boolean;
  /** Individual checks */
  checks: DocumentCheck[];
}

export interface DocumentCheck {
  /** Check name */
  name: string;
  /** Whether the check passed */
  passed: boolean;
  /** Severity if failed */
  severity: VerificationSeverity;
  /** Details */
  message: string;
}

export interface DocumentVerificationInput {
  /** Passengers to verify */
  passengers: PassengerDocument[];
  /** Travel segments for destination/date checks */
  segments: TravelSegment[];
  /** Minimum passport validity months beyond travel date (default: 6) */
  passport_validity_months?: number;
  /** Current date for validation (ISO — defaults to now) */
  validation_date?: string;
}

export interface DocumentVerificationOutput {
  /** Per-passenger results */
  results: PassengerVerificationResult[];
  /** Overall pass/fail (all passengers must pass all blocking checks) */
  all_passed: boolean;
  /** Count of blocking failures */
  blocking_failures: number;
  /** Count of advisory warnings */
  advisory_warnings: number;
}
