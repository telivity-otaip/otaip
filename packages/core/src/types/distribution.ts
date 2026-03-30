/**
 * Distribution Adapter interfaces and canonical search/price types.
 *
 * These types define the contract between OTAIP agents and external
 * distribution systems (GDS, NDC aggregators, airline direct channels).
 * All adapters normalize their responses to these canonical schemas.
 */

// ---------------------------------------------------------------------------
// Passenger types
// ---------------------------------------------------------------------------

/** Standard IATA passenger type codes */
export type PassengerType = 'ADT' | 'CHD' | 'INF' | 'UNN' | 'STU' | 'YTH';

export interface PassengerCount {
  type: PassengerType;
  count: number;
}

// ---------------------------------------------------------------------------
// Search Request / Response
// ---------------------------------------------------------------------------

export interface SearchSegment {
  origin: string;
  destination: string;
  departure_date: string;  // ISO 8601 date (YYYY-MM-DD)
}

export interface SearchRequest {
  segments: SearchSegment[];
  passengers: PassengerCount[];
  cabin_class?: 'economy' | 'premium_economy' | 'business' | 'first';
  max_connections?: number;
  direct_only?: boolean;
  /** ISO 4217 currency code for pricing */
  currency?: string;
}

export interface FlightSegment {
  /** Marketing carrier IATA code */
  carrier: string;
  /** Flight number */
  flight_number: string;
  /** Operating carrier IATA code (if different from marketing carrier) */
  operating_carrier?: string;
  /** Origin airport IATA code */
  origin: string;
  /** Destination airport IATA code */
  destination: string;
  /** ISO 8601 departure datetime */
  departure_time: string;
  /** ISO 8601 arrival datetime */
  arrival_time: string;
  /** Duration in minutes */
  duration_minutes: number;
  /** Aircraft type (e.g., "787-9", "A320") */
  aircraft?: string;
  /** Booking class letter */
  booking_class?: string;
  /** Cabin class */
  cabin_class?: 'economy' | 'premium_economy' | 'business' | 'first';
  /** Number of stops in this segment (0 = direct) */
  stops?: number;
}

export interface Itinerary {
  /** Unique ID from the source system */
  source_id: string;
  /** Which adapter provided this result */
  source: string;
  /** Ordered flight segments */
  segments: FlightSegment[];
  /** Total duration in minutes (including connections) */
  total_duration_minutes: number;
  /** Number of connections (segments.length - 1) */
  connection_count: number;
}

export interface PriceBreakdown {
  /** Base fare in requested currency */
  base_fare: number;
  /** Total taxes and fees */
  taxes: number;
  /** Total price (base_fare + taxes) */
  total: number;
  /** ISO 4217 currency code */
  currency: string;
  /** Per-passenger breakdown */
  per_passenger?: PerPassengerPrice[];
}

export interface PerPassengerPrice {
  type: PassengerType;
  base_fare: number;
  taxes: number;
  total: number;
}

export interface SearchOffer {
  /** Unique offer ID */
  offer_id: string;
  /** Source adapter name */
  source: string;
  /** The itinerary */
  itinerary: Itinerary;
  /** Pricing information */
  price: PriceBreakdown;
  /** Fare basis code(s) */
  fare_basis?: string[];
  /** Booking classes per segment */
  booking_classes?: string[];
  /** Whether this offer is instantly bookable */
  instant_ticketing?: boolean;
  /** Offer expiry time (ISO 8601) */
  expires_at?: string;
}

export interface SearchResponse {
  /** List of offers found */
  offers: SearchOffer[];
  /** Whether results were truncated */
  truncated?: boolean;
  /** Source-specific metadata */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Price Request / Response
// ---------------------------------------------------------------------------

export interface PriceRequest {
  /** Offer ID to re-price */
  offer_id: string;
  /** Source adapter that provided the offer */
  source: string;
  /** Passengers for pricing */
  passengers: PassengerCount[];
  /** Desired currency */
  currency?: string;
}

export interface PriceResponse {
  /** Updated price (may differ from search-time price) */
  price: PriceBreakdown;
  /** Whether the offer is still available */
  available: boolean;
  /** Updated expiry */
  expires_at?: string;
  /** Source-specific metadata */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Distribution Adapter interface
// ---------------------------------------------------------------------------

/**
 * Distribution Adapter — the contract for all GDS/NDC/aggregator integrations.
 *
 * Adapters normalize external system responses to OTAIP canonical schemas.
 * Each adapter implementation handles authentication, rate limiting, and
 * error mapping for its specific distribution system.
 */
export interface DistributionAdapter {
  /** Human-readable adapter name (e.g., "duffel", "amadeus", "travelport") */
  readonly name: string;

  /** Search for flight offers */
  search(request: SearchRequest): Promise<SearchResponse>;

  /** Re-price a specific offer (optional — not all sources support it) */
  price?(request: PriceRequest): Promise<PriceResponse>;

  /** Check if the adapter is available and properly configured */
  isAvailable(): Promise<boolean>;
}
