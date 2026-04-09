/**
 * PNR Builder — Types
 *
 * Agent 3.2: Constructs GDS-ready PNR commands from normalized booking data.
 * Supports Amadeus, Sabre, and Travelport command syntax.
 */

export type GdsSystem = 'AMADEUS' | 'SABRE' | 'TRAVELPORT';

export type SsrCode = 'WCHR' | 'VGML' | 'DOCS' | 'FOID' | 'CTCE' | 'CTCM' | 'INFT';

export interface PnrPassenger {
  /** Last name (surname) */
  last_name: string;
  /** First name */
  first_name: string;
  /** Title (MR, MRS, MS, etc.) — optional */
  title?: string;
  /** Passenger type: ADT, CHD, INF */
  passenger_type: 'ADT' | 'CHD' | 'INF';
  /** Date of birth (YYYY-MM-DD) — required for APIS */
  date_of_birth?: string;
  /** Gender: M or F — required for APIS */
  gender?: 'M' | 'F';
  /** Nationality (ISO 2-letter) — required for APIS */
  nationality?: string;
  /** Passport number — required for international APIS */
  passport_number?: string;
  /** Passport expiry (YYYY-MM-DD) */
  passport_expiry?: string;
  /** Passport issuing country (ISO 2-letter) */
  passport_country?: string;
  /** For infants: index of accompanying adult (0-based) */
  infant_accompanying_adult?: number;
  /** FOID (Form of ID) — e.g., "PP123456789" */
  foid?: string;
}

export interface PnrSegment {
  /** Carrier IATA code */
  carrier: string;
  /** Flight number */
  flight_number: string;
  /** Booking class */
  booking_class: string;
  /** Departure date (YYYY-MM-DD) */
  departure_date: string;
  /** Origin airport */
  origin: string;
  /** Destination airport */
  destination: string;
  /** Number of seats */
  quantity: number;
  /** Segment status (SS=sell, NN=need, GK=ghost) */
  status: 'SS' | 'NN' | 'GK';
}

export interface PnrContact {
  /** Phone number */
  phone: string;
  /** Email address */
  email?: string;
  /** Contact type */
  type: 'AGENCY' | 'PASSENGER' | 'EMERGENCY';
}

export interface PnrTicketing {
  /** Ticketing time limit (YYYY-MM-DD) */
  time_limit: string;
  /** Ticketing type */
  type: 'TL' | 'OK' | 'XL';
}

export interface SsrElement {
  /** SSR code */
  code: SsrCode;
  /** Carrier (YY for all carriers) */
  carrier: string;
  /** Free text */
  text: string;
  /** Passenger index (1-based in output) */
  passenger_index: number;
  /** Segment index (1-based in output) — optional */
  segment_index?: number;
}

export interface OsiElement {
  /** Carrier */
  carrier: string;
  /** Free text */
  text: string;
}

export interface PnrBuilderInput {
  /** Target GDS */
  gds: GdsSystem;
  /** Passengers */
  passengers: PnrPassenger[];
  /** Air segments */
  segments: PnrSegment[];
  /** Contact information */
  contacts: PnrContact[];
  /** Ticketing arrangement */
  ticketing: PnrTicketing;
  /** Received from */
  received_from: string;
  /** SSR elements */
  ssrs?: SsrElement[];
  /** OSI elements */
  osis?: OsiElement[];
  /** Whether this is a group PNR (10+ pax) */
  is_group?: boolean;
  /** Group name (required if is_group) */
  group_name?: string;
}

export interface PnrCommand {
  /** GDS command string */
  command: string;
  /** Human-readable description */
  description: string;
  /** Element type */
  element_type:
    | 'NAME'
    | 'SEGMENT'
    | 'CONTACT'
    | 'TICKETING'
    | 'RECEIVED_FROM'
    | 'SSR'
    | 'OSI'
    | 'GROUP'
    | 'END_TRANSACT';
}

export interface PnrBuilderOutput {
  /** GDS system */
  gds: GdsSystem;
  /** Ordered list of PNR commands to execute */
  commands: PnrCommand[];
  /** Total passengers */
  passenger_count: number;
  /** Total segments */
  segment_count: number;
  /** Whether this is a group PNR */
  is_group: boolean;
  /** Infants detected */
  infant_count: number;
}
