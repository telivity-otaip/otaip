/**
 * PNR Validation — Types
 *
 * Agent 3.3: Pre-ticketing validation — 13 checks to catch errors before ADMs.
 */

export type SegmentStatus = 'HK' | 'UN' | 'HL' | 'TK' | 'UC' | 'NO' | 'SS' | 'GK' | 'KK';

export type ValidationSeverity = 'error' | 'warning';

export interface PnrPassengerData {
  /** Passenger number (1-based) */
  pax_number: number;
  /** Last name */
  last_name: string;
  /** First name */
  first_name: string;
  /** Passenger type */
  passenger_type: 'ADT' | 'CHD' | 'INF';
  /** Date of birth (ISO) */
  date_of_birth?: string;
  /** Nationality (ISO 2-letter) */
  nationality?: string;
  /** Passport number */
  passport_number?: string;
  /** Passport expiry (ISO) */
  passport_expiry?: string;
  /** Gender */
  gender?: 'M' | 'F';
  /** For infants: accompanying adult pax number */
  infant_linked_to?: number;
}

export interface PnrSegmentData {
  /** Segment number (1-based) */
  segment_number: number;
  /** Carrier */
  carrier: string;
  /** Flight number */
  flight_number: string;
  /** Origin */
  origin: string;
  /** Destination */
  destination: string;
  /** Departure date (ISO) */
  departure_date: string;
  /** Departure time (HH:MM) */
  departure_time?: string;
  /** Booking class */
  booking_class: string;
  /** Segment status */
  status: SegmentStatus;
  /** Whether this is an international segment */
  is_international: boolean;
  /** Married segment group (null if standalone) */
  married_group?: string;
  /** Fare basis code for this segment */
  fare_basis?: string;
}

export interface PnrContactData {
  /** Phone number */
  phone?: string;
  /** Email */
  email?: string;
}

export interface PnrTicketingData {
  /** Ticketing time limit (ISO) */
  time_limit: string;
  /** Whether ticketing has been arranged */
  arranged: boolean;
}

export interface PnrFareData {
  /** Total fare amount */
  total_fare?: string;
  /** Fare segments — which segment indices the fare covers (0-based) */
  segment_indices: number[];
  /** Advance purchase deadline (ISO) */
  advance_purchase_deadline?: string;
}

export interface PnrValidationInput {
  /** Record locator */
  record_locator: string;
  /** Passengers */
  passengers: PnrPassengerData[];
  /** Segments */
  segments: PnrSegmentData[];
  /** Contact info */
  contact?: PnrContactData;
  /** Ticketing info */
  ticketing?: PnrTicketingData;
  /** Fare data */
  fare?: PnrFareData;
  /** Current date for validation (ISO — defaults to now) */
  validation_date?: string;
}

export interface ValidationCheck {
  /** Check ID (1-13) */
  check_id: number;
  /** Check name */
  name: string;
  /** Whether the check passed */
  passed: boolean;
  /** Severity if failed */
  severity: ValidationSeverity;
  /** Details */
  message: string;
}

export interface PnrValidationOutput {
  /** Record locator */
  record_locator: string;
  /** All validation checks */
  checks: ValidationCheck[];
  /** Overall pass/fail */
  valid: boolean;
  /** Count of errors */
  error_count: number;
  /** Count of warnings */
  warning_count: number;
}
