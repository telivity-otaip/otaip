/**
 * PNR Retrieval — Types
 *
 * Agent 3.8: Retrieves an existing PNR/booking by record locator across
 * distribution adapters (GDS, NDC, direct). Returns the normalized booking
 * record with passenger, segment, ticketing, and contact data.
 *
 * This is a read-only agent — no side effects, no modifications.
 */

export type RetrievalSource = 'AMADEUS' | 'SABRE' | 'TRAVELPORT' | 'NDC' | 'DIRECT';

export type BookingStatus =
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'WAITLISTED'
  | 'TICKETED'
  | 'PENDING'
  | 'UNKNOWN';

export type SegmentStatus =
  | 'HK' // Holding confirmed
  | 'UN' // Unable
  | 'HL' // Waitlisted
  | 'TK' // Ticketed
  | 'UC' // Unable to confirm
  | 'NO' // No action
  | 'SS' // Sold (segment sell)
  | 'GK' // Ghost (passive)
  | 'KK'; // Confirmed (airline)

export interface RetrievedPassenger {
  /** Passenger number (1-based) */
  readonly pax_number: number;
  readonly last_name: string;
  readonly first_name: string;
  readonly title?: string;
  readonly passenger_type: 'ADT' | 'CHD' | 'INF';
  readonly date_of_birth?: string;
  readonly gender?: 'M' | 'F';
  /** Frequent flyer number if present */
  readonly frequent_flyer?: string;
  /** Ticket number(s) if ticketed */
  readonly ticket_numbers?: string[];
}

export interface RetrievedSegment {
  /** Segment number (1-based) */
  readonly segment_number: number;
  readonly carrier: string;
  readonly flight_number: string;
  readonly origin: string;
  readonly destination: string;
  readonly departure_date: string;
  readonly departure_time?: string;
  readonly arrival_date?: string;
  readonly arrival_time?: string;
  readonly booking_class: string;
  readonly status: SegmentStatus;
  readonly fare_basis?: string;
  /** Operating carrier if codeshare */
  readonly operating_carrier?: string;
}

export interface RetrievedContact {
  readonly phone?: string;
  readonly email?: string;
  readonly type: 'AGENCY' | 'PASSENGER' | 'EMERGENCY';
}

export interface RetrievedTicketing {
  /** Ticketing time limit (ISO date) */
  readonly time_limit?: string;
  /** Ticketing status */
  readonly status: 'NOT_TICKETED' | 'TICKETED' | 'PARTIALLY_TICKETED' | 'VOID';
}

export interface PnrRetrievalInput {
  /** The 6-character alphanumeric record locator */
  record_locator: string;
  /** Which source to query. If omitted, queries all available and returns the first match. */
  source?: RetrievalSource;
  /** Whether to include full fare/pricing data (may require additional API call). Default: false */
  include_pricing?: boolean;
}

export interface PnrRetrievalOutput {
  /** The record locator as confirmed by the source */
  record_locator: string;
  /** Which source returned the data */
  source: RetrievalSource;
  /** Overall booking status */
  booking_status: BookingStatus;
  /** Passengers on the PNR */
  passengers: RetrievedPassenger[];
  /** Air segments */
  segments: RetrievedSegment[];
  /** Contact info */
  contacts: RetrievedContact[];
  /** Ticketing status */
  ticketing: RetrievedTicketing;
  /** Creation date of the PNR (ISO) */
  created_at?: string;
  /** Last modified date (ISO) */
  modified_at?: string;
  /** Raw remarks/notes on the PNR */
  remarks?: string[];
}
