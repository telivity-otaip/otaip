/**
 * Availability Search — Input/Output types
 *
 * Agent 1.1: Queries distribution adapters in parallel, normalizes,
 * deduplicates, filters, and sorts flight offers.
 */

import type { SearchOffer, PassengerCount } from '@otaip/core';

export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';
export type SortField = 'price' | 'duration' | 'departure' | 'arrival' | 'connections';
export type SortOrder = 'asc' | 'desc';

export interface AvailabilitySearchInput {
  /** Origin airport/city IATA code */
  origin: string;
  /** Destination airport/city IATA code */
  destination: string;
  /** Departure date (ISO 8601 YYYY-MM-DD) */
  departure_date: string;
  /** Return date for round-trip (ISO 8601 YYYY-MM-DD) */
  return_date?: string;
  /** Passenger counts */
  passengers: PassengerCount[];
  /** Desired cabin class */
  cabin_class?: CabinClass;
  /** Only return direct flights */
  direct_only?: boolean;
  /** Maximum number of connections allowed */
  max_connections?: number;
  /** ISO 4217 currency code */
  currency?: string;
  /** Maximum number of results to return */
  max_results?: number;
  /** Sort field */
  sort_by?: SortField;
  /** Sort order */
  sort_order?: SortOrder;
  /** Adapter names to query (if omitted, queries all available) */
  sources?: string[];
}

export interface SourceStatus {
  /** Adapter name */
  source: string;
  /** Whether the query succeeded */
  success: boolean;
  /** Number of offers returned */
  offer_count: number;
  /** Error message if failed */
  error?: string;
  /** Response time in milliseconds */
  response_time_ms: number;
}

export interface AvailabilitySearchOutput {
  /** Deduplicated, filtered, sorted offers */
  offers: SearchOffer[];
  /** Total offers found before deduplication/filtering */
  total_raw_offers: number;
  /** Per-source query status */
  source_status: SourceStatus[];
  /** Whether results were truncated to max_results */
  truncated: boolean;
}
