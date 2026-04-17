/**
 * AI Travel Advisor — Agent 1.8 Types
 *
 * Rule-based recommendation engine (NOT an LLM agent). Takes structured
 * traveler preferences, orchestrates AvailabilitySearch, applies
 * preference-weighted scoring, returns ranked recommendations with
 * explanations.
 */

import type { SearchOffer } from '@otaip/core';

export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';
export type TripPurpose = 'business' | 'leisure';

export interface PassengerCounts {
  adults: number;
  children?: number;
  infants?: number;
}

export interface ScoringWeights {
  price: number;
  schedule: number;
  airline: number;
  connections: number;
}

export interface TravelerPreferences {
  /** Minimum budget in preferred currency (corporate floor, etc.). */
  budgetMin?: number;
  /** Maximum budget in preferred currency. */
  budgetMax?: number;
  /** Currency for budget comparisons. Default 'USD'. */
  currency?: string;
  /** Desired cabin class. Non-matching offers are excluded. */
  cabinClass?: CabinClass;
  /** Preferred marketing carriers (IATA codes). Boosts matching offers. */
  preferredAirlines?: string[];
  /** Business trips prioritize schedule; leisure prioritizes price. */
  tripPurpose?: TripPurpose;
  /** Passenger counts. Default 1 ADT. */
  passengers?: PassengerCounts;
  /** Max connections per itinerary. Default 1. */
  maxConnections?: number;
  /** Override the default scoring weights. */
  scoringWeights?: ScoringWeights;
}

export interface ResolvedPreferences {
  currency: string;
  passengers: { adults: number; children: number; infants: number };
  maxConnections: number;
  weights: ScoringWeights;
  tripPurpose?: TripPurpose;
  cabinClass?: CabinClass;
  preferredAirlines: string[];
  budgetMin?: number;
  budgetMax?: number;
}

export interface AdvisorInput {
  /** Origin airport IATA code (3 letters). */
  origin: string;
  /** Destination airport IATA code (3 letters). */
  destination: string;
  /** Departure date (ISO 8601 YYYY-MM-DD). */
  departureDate: string;
  /** Return date for round-trip. Omit for one-way. */
  returnDate?: string;
  /** Search ±3 days around departureDate when true. */
  flexibleDates?: boolean;
  /** Traveler preferences. All fields optional — defaults applied. */
  preferences?: TravelerPreferences;
  /** Max recommendations to return. Default 5. */
  maxRecommendations?: number;
}

export interface ScoreBreakdown {
  price: number;
  schedule: number;
  airline: number;
  connections: number;
}

export interface Recommendation {
  rank: number;
  offer: SearchOffer;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  /** Human-readable reason for this rank, deterministic from breakdown. */
  explanation: string;
}

export interface SearchSummary {
  /** Total offers returned by AvailabilitySearch across all dates. */
  totalOffersFound: number;
  /** Offers that passed budget + cabin + connections filters. */
  totalOffersEligible: number;
  /** Dates searched (one entry unless flexibleDates). */
  dateRangeSearched: string[];
  /** Adapters that contributed to the results. */
  adaptersUsed: string[];
}

export interface AdvisorOutput {
  recommendations: Recommendation[];
  searchSummary: SearchSummary;
  appliedPreferences: ResolvedPreferences;
}
