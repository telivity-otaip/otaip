/**
 * Duty of Care — Types
 *
 * Agent 8.5: Traveler location, destination risk, accountability.
 */

export type DutyCareOperation =
  | 'locate_travelers'
  | 'get_traveler_itinerary'
  | 'assess_destination_risk'
  | 'mark_accounted_for';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type TravelerStatus = 'IN_TRANSIT' | 'AT_DESTINATION' | 'DEPARTED' | 'UNKNOWN';

export interface TravelerItinerary {
  traveler_id: string;
  given_name: string;
  surname: string;
  contact_phone: string;
  contact_email: string;
  corporate_id?: string;
  department?: string;
  segments: Array<{
    carrier: string;
    flight_number: string;
    origin: string;
    destination: string;
    departure_date: string;
    departure_time: string;
    arrival_date: string;
    arrival_time: string;
    status: string;
  }>;
}

export interface LocatedTraveler {
  traveler_id: string;
  given_name: string;
  surname: string;
  contact_phone: string;
  contact_email: string;
  current_location: string;
  status: TravelerStatus;
  next_flight?: string;
  accounted_for: boolean;
  corporate_id?: string;
  department?: string;
}

export interface DestinationRisk {
  country_code: string;
  country_name: string;
  risk_level: RiskLevel;
  note: string;
}

export interface DutyCareInput {
  operation: DutyCareOperation;
  /** For locate_travelers */
  airport_code?: string;
  country_code?: string;
  date?: string;
  window_hours?: number;
  corporate_id?: string;
  /** For get_traveler_itinerary */
  traveler_id?: string;
  /** For assess_destination_risk */
  destination_country?: string;
  /** For mark_accounted_for */
  incident_id?: string;
  current_datetime?: string;
}

export interface DutyCareOutput {
  travelers?: LocatedTraveler[];
  itinerary?: TravelerItinerary;
  risk?: DestinationRisk;
  accounted_for?: boolean;
  message?: string;
}
