/**
 * Schedule Lookup — Input/Output types
 *
 * Agent 1.2: Looks up flight schedules with SSIM operating days,
 * codeshare detection, and connection discovery.
 */

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface ScheduleLookupInput {
  /** Origin airport IATA code */
  origin: string;
  /** Destination airport IATA code */
  destination: string;
  /** Carrier IATA code (optional — all carriers if omitted) */
  carrier?: string;
  /** Flight number (optional — requires carrier) */
  flight_number?: string;
  /** Date to look up schedule for (ISO 8601 YYYY-MM-DD) */
  date: string;
  /** Whether to include codeshare flights. Default: true */
  include_codeshares?: boolean;
  /** Whether to discover connecting options. Default: false */
  include_connections?: boolean;
}

export interface OperatingSchedule {
  /** SSIM 7-digit binary string (1=operates, 0=does not) for MTWTFSS */
  operating_days_ssim: string;
  /** Human-readable day names */
  operating_days: DayOfWeek[];
  /** Effective from date (ISO 8601) */
  effective_from: string;
  /** Effective to date (ISO 8601) */
  effective_to: string;
}

export interface ScheduledFlight {
  /** Marketing carrier IATA code */
  carrier: string;
  /** Flight number */
  flight_number: string;
  /** Operating carrier (if codeshare) */
  operating_carrier?: string;
  /** Operating flight number (if codeshare) */
  operating_flight_number?: string;
  /** Origin airport IATA code */
  origin: string;
  /** Destination airport IATA code */
  destination: string;
  /** Scheduled departure time (HH:MM local) */
  departure_time: string;
  /** Scheduled arrival time (HH:MM local) */
  arrival_time: string;
  /** Duration in minutes */
  duration_minutes: number;
  /** Aircraft type */
  aircraft?: string;
  /** Operating schedule */
  schedule: OperatingSchedule;
  /** Whether this is a codeshare flight */
  is_codeshare: boolean;
}

export interface ConnectionOption {
  /** First leg flight */
  first_leg: ScheduledFlight;
  /** Second leg flight */
  second_leg: ScheduledFlight;
  /** Connection time in minutes */
  connection_minutes: number;
  /** Connecting airport IATA code */
  connection_airport: string;
  /** Total journey duration in minutes */
  total_duration_minutes: number;
}

export interface ScheduleLookupOutput {
  /** Direct flights found */
  flights: ScheduledFlight[];
  /** Connection options (if include_connections=true) */
  connections: ConnectionOption[] | null;
  /** Whether flights operate on the requested date */
  operates_on_date: boolean;
}
