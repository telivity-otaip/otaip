/**
 * Involuntary Rebook — Types
 *
 * Agent 5.3: Carrier-initiated schedule change handling, protection logic,
 * regulatory entitlements.
 */

export type InvoluntaryTrigger =
  | 'TIME_CHANGE'
  | 'ROUTING_CHANGE'
  | 'EQUIPMENT_DOWNGRADE'
  | 'FLIGHT_CANCELLATION'
  | 'NO_SHOW';

export type ProtectionPath =
  | 'SAME_CARRIER'
  | 'ALLIANCE_PARTNER'
  | 'INTERLINE'
  | 'NONE_AVAILABLE';

export type RegulatoryFramework = 'EU261' | 'US_DOT';

export interface ScheduleChangeNotification {
  /** Type of change */
  change_type: 'TIME_CHANGE' | 'ROUTING_CHANGE' | 'EQUIPMENT_DOWNGRADE' | 'FLIGHT_CANCELLATION';
  /** Original departure time (HH:MM) */
  original_departure_time?: string;
  /** New departure time (HH:MM) */
  new_departure_time?: string;
  /** Time change in minutes (absolute value) */
  time_change_minutes?: number;
  /** Original routing (airport codes) */
  original_routing?: string[];
  /** New routing (airport codes) */
  new_routing?: string[];
  /** Original equipment type */
  original_equipment?: string;
  /** New equipment type */
  new_equipment?: string;
  /** Whether original was widebody */
  original_is_widebody?: boolean;
  /** Whether new is widebody */
  new_is_widebody?: boolean;
  /** Carrier-provided reason */
  carrier_reason?: string;
}

export interface OriginalPnrSummary {
  /** Record locator */
  record_locator: string;
  /** Passenger name (LAST/FIRST) */
  passenger_name: string;
  /** Affected segment */
  affected_segment: {
    carrier: string;
    flight_number: string;
    origin: string;
    destination: string;
    departure_date: string;
    departure_time: string;
    booking_class: string;
    fare_basis: string;
  };
  /** Issuing carrier (for the ticket) */
  issuing_carrier: string;
  /** Departure country (ISO 2-letter) */
  departure_country: string;
  /** Arrival country (ISO 2-letter) */
  arrival_country: string;
  /** Whether passenger checked in */
  is_checked_in: boolean;
  /** Whether carrier is an EU carrier */
  is_eu_carrier: boolean;
}

export interface ProtectionOption {
  /** Protection path taken */
  path: ProtectionPath;
  /** Carrier code */
  carrier: string;
  /** Flight number */
  flight_number: string;
  /** Departure date */
  departure_date: string;
  /** Departure time */
  departure_time: string;
  /** Booking class */
  booking_class: string;
  /** Notes */
  notes: string;
}

export interface RegulatoryFlag {
  /** Regulatory framework */
  framework: RegulatoryFramework;
  /** Whether it applies */
  applies: boolean;
  /** Reason */
  reason: string;
}

export interface InvoluntaryRebookResult {
  /** Whether this qualifies as involuntary */
  is_involuntary: boolean;
  /** Trigger type */
  trigger: InvoluntaryTrigger;
  /** Whether the passenger was a no-show */
  is_no_show: boolean;
  /** Protection options (ordered by priority) */
  protection_options: ProtectionOption[];
  /** Protection path taken (first option) */
  protection_path: ProtectionPath;
  /** Regulatory entitlement flags */
  regulatory_flags: RegulatoryFlag[];
  /** Original routing credit: passenger retains original fare basis */
  original_routing_credit: boolean;
  /** Human-readable summary */
  summary: string;
}

export interface InvoluntaryRebookInput {
  /** Original PNR summary */
  original_pnr: OriginalPnrSummary;
  /** Schedule change notification */
  schedule_change: ScheduleChangeNotification;
  /** Available protection flights (from search) */
  available_flights?: Array<{
    carrier: string;
    flight_number: string;
    departure_date: string;
    departure_time: string;
    booking_class: string;
    is_same_carrier: boolean;
    is_alliance_partner: boolean;
    is_interline: boolean;
  }>;
  /** Involuntary thresholds (overrides) */
  thresholds?: {
    /** Minutes of departure time change that triggers involuntary (default: 60) */
    time_change_minutes?: number;
    /** Hours within which same carrier must be available (default: 6) */
    same_carrier_window_hours?: number;
  };
  /** Whether passenger missed original flight (no-show) */
  is_passenger_no_show?: boolean;
}

export interface InvoluntaryRebookOutput {
  /** Rebook result */
  result: InvoluntaryRebookResult;
}
