/**
 * Traveler Profile — Types
 *
 * Agent 8.1: Traveler preferences, documents, loyalty programs.
 */

export const VALID_MEAL_CODES = [
  'VGML', 'KSML', 'HNML', 'DBML', 'AVML', 'MOML', 'SFML',
  'GFML', 'NLML', 'FPML', 'LCML', 'LSML', 'BLML', 'PRML', 'VJML',
] as const;

export type MealCode = typeof VALID_MEAL_CODES[number];

export type SeatPreference = 'WINDOW' | 'AISLE' | 'MIDDLE' | 'NONE';

export type ProfileOperation = 'get' | 'create' | 'update' | 'apply_to_pnr' | 'search';

export interface TravelerProfile {
  traveler_id: string;
  given_name: string;
  surname: string;
  date_of_birth: string;
  nationality: string;
  passport_number: string;
  passport_expiry: string;
  passport_issuing_country: string;
  loyalty_numbers: Record<string, string>;
  seat_preference: SeatPreference;
  meal_preference?: MealCode;
  contact_email: string;
  contact_phone: string;
  known_traveler_number?: string;
  redress_number?: string;
  corporate_id?: string;
  employee_id?: string;
  department?: string;
  cost_center?: string;
  created_at: string;
  updated_at: string;
}

export interface PnrSegmentRef {
  carrier: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_date: string;
  is_international: boolean;
}

export interface SsrInjection {
  ssr_type: string;
  content: string;
  injected: boolean;
  skipped_reason?: string;
}

export interface TravelerProfileInput {
  operation: ProfileOperation;
  traveler_id?: string;
  profile_data?: Partial<Omit<TravelerProfile, 'traveler_id' | 'created_at' | 'updated_at'>>;
  pnr_segments?: PnrSegmentRef[];
  search_query?: string;
  current_date?: string;
}

export interface TravelerProfileOutput {
  profile?: TravelerProfile;
  profiles?: TravelerProfile[];
  ssr_injections?: SsrInjection[];
  passport_expiry_warning?: boolean;
  message?: string;
}
