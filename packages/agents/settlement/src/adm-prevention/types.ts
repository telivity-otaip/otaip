/**
 * ADM Prevention — Types
 *
 * Agent 6.2: Pre-ticketing audit to prevent Agency Debit Memos.
 * Nine checks covering fare integrity, segment validity, and compliance.
 */

export type ADMCheckId =
  | 'DUPLICATE_BOOKING'
  | 'FARE_CLASS_MISMATCH'
  | 'PASSIVE_SEGMENT'
  | 'MARRIED_SEGMENT'
  | 'TTL_EXPIRED'
  | 'COMMISSION_RATE'
  | 'ENDORSEMENT_BOX'
  | 'TOUR_CODE_FORMAT'
  | 'NET_REMIT';

export type ADMSeverity = 'blocking' | 'warning';

export interface ADMCheck {
  /** Check identifier */
  check_id: ADMCheckId;
  /** Human-readable check name */
  name: string;
  /** Severity level */
  severity: ADMSeverity;
  /** Whether the check passed */
  passed: boolean;
  /** Reason for failure (or pass confirmation) */
  reason: string;
}

export interface BookingSegment {
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
  /** Segment status (HK, KK, SS, HX, UN, etc.) */
  status: string;
  /** Booked class */
  booking_class: string;
  /** Married segment group (segments in same group must travel together) */
  married_group?: string;
}

export interface DuplicateCheckPnr {
  /** Record locator */
  record_locator: string;
  /** Passenger name */
  passenger_name: string;
  /** Segments */
  segments: Array<{
    carrier: string;
    flight_number: string;
    departure_date: string;
  }>;
}

export interface BookingRecord {
  /** Record locator */
  record_locator: string;
  /** Passenger name (LAST/FIRST) */
  passenger_name: string;
  /** Segments */
  segments: BookingSegment[];
  /** Base fare (decimal string) */
  base_fare: string;
  /** Base fare currency */
  base_fare_currency: string;
}

export interface ADMPreventionInput {
  /** Booking record to audit */
  booking: BookingRecord;
  /** Fare basis code */
  fare_basis: string;
  /** Booked class (single letter) */
  booked_class: string;
  /** Commission rate on this ticket (percentage, e.g. 7.0) */
  commission_rate?: number;
  /** Carrier's contracted commission rate (percentage) */
  carrier_contracted_rate?: number;
  /** Endorsement text on ticket */
  endorsement?: string;
  /** Tour code on ticket */
  tour_code?: string;
  /** Whether this is a net remit ticket */
  is_net_remit?: boolean;
  /** Net contracted fare amount (decimal string) */
  net_contracted_amount?: string;
  /** TTL deadline (ISO timestamp) */
  ttl_deadline?: string;
  /** Other PNRs to check for duplicates */
  duplicate_check_pnrs?: DuplicateCheckPnr[];
  /** Current date/time (ISO — for TTL check) */
  current_datetime?: string;
}

export interface ADMPreventionResult {
  /** All check results */
  checks: ADMCheck[];
  /** Overall pass (true only if all blocking checks pass) */
  overall_pass: boolean;
  /** Number of blocking failures */
  blocking_count: number;
  /** Number of warnings */
  warning_count: number;
}

export interface ADMPreventionOutput {
  /** Audit result */
  result: ADMPreventionResult;
}
