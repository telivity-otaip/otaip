/**
 * Change Management — Types
 *
 * Agent 5.1: ATPCO Category 31 voluntary change assessment.
 */

export type ChangeAction = 'REISSUE' | 'REBOOK' | 'REJECT';

export interface OriginalTicketSummary {
  /** 13-digit ticket number */
  ticket_number: string;
  /** Conjunction ticket numbers (if applicable) */
  conjunction_tickets?: string[];
  /** Issuing carrier */
  issuing_carrier: string;
  /** Passenger name (LAST/FIRST) */
  passenger_name: string;
  /** Record locator */
  record_locator: string;
  /** Issue date (ISO) */
  issue_date: string;
  /** Base fare paid (decimal string) */
  base_fare: string;
  /** Base fare currency */
  base_fare_currency: string;
  /** Total tax paid (decimal string) */
  total_tax: string;
  /** Total amount paid (decimal string) */
  total_amount: string;
  /** Fare basis code */
  fare_basis: string;
  /** Whether the fare is refundable */
  is_refundable: boolean;
  /** Booking date (ISO — for 24h free change check) */
  booking_date?: string;
}

export interface RequestedItinerary {
  /** Segments in the new itinerary */
  segments: Array<{
    carrier: string;
    flight_number: string;
    origin: string;
    destination: string;
    departure_date: string;
    booking_class: string;
    fare_basis: string;
  }>;
  /** New fare amount (decimal string) */
  new_fare: string;
  /** New fare currency */
  new_fare_currency: string;
  /** New taxes (decimal string) */
  new_tax: string;
}

export interface ChangeFeeRule {
  /** Fare basis pattern (regex string or exact match) */
  fare_basis_pattern: string;
  /** Change fee amount (decimal string) */
  change_fee: string;
  /** Currency */
  currency: string;
  /** Free change within N hours of booking (0 = no free change) */
  free_change_hours: number;
  /** Whether fare difference is forfeited on non-refundable downgrade */
  forfeit_difference_on_downgrade: boolean;
  /** Notes */
  notes: string;
}

export interface ChangeAssessment {
  /** Original ticket number */
  original_ticket_number: string;
  /** Recommended next action */
  action: ChangeAction;
  /** Change fee amount (decimal string, "0.00" if waived) */
  change_fee: string;
  /** Change fee currency */
  change_fee_currency: string;
  /** Whether change fee was waived */
  fee_waived: boolean;
  /** Waiver code (if provided) */
  waiver_code?: string;
  /** Fare difference: new fare minus original (decimal string, negative = downgrade) */
  fare_difference: string;
  /** Additional collection required (decimal string, "0.00" if none) */
  additional_collection: string;
  /** Residual value: original fare minus penalty, available for reissue (decimal string) */
  residual_value: string;
  /** Forfeited amount on non-refundable downgrade (decimal string, "0.00" if none) */
  forfeited_amount: string;
  /** Tax difference (decimal string) */
  tax_difference: string;
  /** Total due from passenger: change_fee + additional_collection + tax_difference (decimal string) */
  total_due: string;
  /** Currency for all amounts */
  currency: string;
  /** Human-readable summary */
  summary: string;
  /** Whether this is within the free change window */
  is_free_change: boolean;
}

export interface ChangeManagementInput {
  /** Original ticket summary */
  original_ticket: OriginalTicketSummary;
  /** Requested new itinerary */
  requested_itinerary: RequestedItinerary;
  /** Waiver code (if airline provided one) */
  waiver_code?: string;
  /** Current date/time (ISO — defaults to now) */
  current_datetime?: string;
}

export interface ChangeManagementOutput {
  /** Change assessment */
  assessment: ChangeAssessment;
}
