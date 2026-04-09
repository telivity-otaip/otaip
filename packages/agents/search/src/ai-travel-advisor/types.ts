/**
 * AI Travel Advisor — Agent 1.8 Types
 *
 * Provider-agnostic LLM integration for natural language travel search.
 */

/** Injectable LLM provider interface. Bring your own LLM. */
export interface LLMProvider {
  complete(prompt: string, options?: LLMOptions): Promise<string>;
}

export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

/** Input to the AI Travel Advisor agent. */
export interface TravelAdvisorInput {
  /** Natural language travel query from the user. */
  query: string;

  /** Optional context about the traveler (preferences, constraints). */
  travelerContext?: TravelerContext;
}

export interface TravelerContext {
  /** Preferred cabin class. */
  cabinPreference?: 'economy' | 'premium_economy' | 'business' | 'first';
  /** Budget constraint in the traveler's currency. */
  maxBudget?: number;
  /** Budget currency (ISO 4217). */
  budgetCurrency?: string;
  /** Preferred airlines (IATA codes). */
  preferredAirlines?: string[];
  /** Number of adult travelers. */
  adults?: number;
  /** Number of child travelers. */
  children?: number;
  /** Number of infant travelers. */
  infants?: number;
}

/** Output from the AI Travel Advisor agent. */
export interface TravelAdvisorOutput {
  /** Structured search parameters extracted from the query. */
  searchParameters: ExtractedSearchParameters;
  /** Natural language summary of the interpreted query. */
  summary: string;
  /** Intent classification. */
  intent: TravelIntent;
}

export interface ExtractedSearchParameters {
  /** Origin airport/city code, if identified. */
  origin?: string;
  /** Destination airport/city code, if identified. */
  destination?: string;
  /** Departure date (ISO 8601), if identified. */
  departureDate?: string;
  /** Return date (ISO 8601), if identified. */
  returnDate?: string;
  /** Trip type inferred from query. */
  tripType?: 'one_way' | 'round_trip' | 'multi_city';
  /** Cabin class preference. */
  cabinClass?: 'economy' | 'premium_economy' | 'business' | 'first';
  /** Number of passengers by type. */
  passengers?: { adults: number; children: number; infants: number };
  /** Whether dates are flexible. */
  flexibleDates?: boolean;
}

export type TravelIntent =
  | 'flight_search'
  | 'hotel_search'
  | 'destination_recommendation'
  | 'price_check'
  | 'trip_planning'
  | 'unknown';

export interface AITravelAdvisorConfig {
  /** LLM provider for natural language understanding. */
  llmProvider: LLMProvider;

  /** Maximum tokens for LLM response. Default: 500. */
  maxTokens?: number;

  /** LLM temperature. Default: 0.1 (low for structured extraction). */
  temperature?: number;
}
