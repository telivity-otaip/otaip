/**
 * Hotel Search Aggregator — Input/Output types
 *
 * Agent 4.1: Multi-source hotel availability search across GDS hotel segments,
 * direct APIs (Amadeus Hotel, Hotelbeds, Duffel Stays), and channel manager feeds.
 * Returns raw, unmerged results from all connected sources.
 *
 * Domain source: OTAIP Lodging Knowledge Base §1, §4
 */

import type { RawHotelResult, RateType } from '../types/hotel-common.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface HotelSearchInput {
  /** Destination — city name, airport code, or coordinates */
  destination: string;
  /** ISO date string (YYYY-MM-DD) */
  checkIn: string;
  /** ISO date string (YYYY-MM-DD) */
  checkOut: string;
  /** Number of rooms needed */
  rooms: number;
  /** Number of adult guests per room */
  adults: number;
  /** Number of child guests per room */
  children?: number;
  /** Minimum star rating filter */
  starRating?: number;
  /** Maximum nightly rate filter (string for decimal precision) */
  maxRatePerNight?: string;
  /** ISO 4217 currency for rate filtering and display */
  currency?: string;
  /** Rate type filter */
  rateType?: RateType;
  /** Chain preference (chain code, e.g., "MC" for Marriott) */
  chainPreference?: string;
  /** Per-adapter timeout in milliseconds (default: 5000) */
  timeoutMs?: number;
  /** Specific adapter IDs to query (if omitted, queries all registered adapters) */
  adapterIds?: string[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Per-adapter result summary */
export interface AdapterResult {
  adapterId: string;
  adapterName: string;
  resultCount: number;
  responseTimeMs: number;
  timedOut: boolean;
  error?: string;
}

export interface HotelSearchOutput {
  /** Raw hotel results from all sources (NOT deduplicated) */
  properties: RawHotelResult[];
  /** Total result count across all adapters */
  totalResults: number;
  /** Per-adapter result summary */
  adapterResults: AdapterResult[];
  /** True if some adapters timed out or errored — results are partial */
  partialResults: boolean;
  /** Unique search ID for tracing */
  searchId: string;
}
