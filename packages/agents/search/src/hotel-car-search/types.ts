/**
 * Hotel & Car Search — Input / Output types.
 *
 * Agent 1.7: Multi-adapter search aggregator for hotel and car
 * inventory. Adapters are injected at construction time (not in
 * every call). Fan-out via Promise.allSettled with per-adapter
 * timeout. Results tagged with source adapter, filtered, sorted,
 * and optionally capped.
 */

export type CarCategory = 'ECONOMY' | 'COMPACT' | 'MIDSIZE' | 'FULLSIZE' | 'SUV' | 'LUXURY' | 'VAN';

export type HotelSortBy = 'price' | 'rating' | 'name';
export type CarSortBy = 'price' | 'category';

// ─────────────────────────────────────────────────────────────────────────────
// Hotels
// ─────────────────────────────────────────────────────────────────────────────

export interface HotelSearchInput {
  destination: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children?: number;
  /** Minimum star rating filter (1-5). */
  starRating?: number;
  /** Maximum rate per night (decimal string). */
  maxRatePerNight?: string;
  currency?: string;
  /** Sort key for results (default: 'price'). */
  sortBy?: HotelSortBy;
  /** Maximum results to return after sort. */
  maxResults?: number;
}
export interface HotelOffer {
  hotelId: string;
  name: string;
  starRating: number;
  ratePerNight: string;
  currency: string;
  roomType: string;
  cancellationPolicy: string;
  /** Source adapter name that returned this offer. */
  source: string;
}
export interface HotelSearchOutput {
  hotels: HotelOffer[];
  currency: string;
  noAdaptersConfigured: boolean;
  /** Per-adapter result summary (timing + errors). */
  adapterSummary?: AdapterSummary[];
}
export interface HotelAdapter {
  name: string;
  searchHotels(input: HotelSearchInput): Promise<HotelOffer[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cars
// ─────────────────────────────────────────────────────────────────────────────

export interface CarSearchInput {
  pickupLocation: string;
  dropoffLocation?: string;
  pickupDateTime: string;
  dropoffDateTime: string;
  driverAge?: number;
  carCategory?: CarCategory;
  /** Sort key for results (default: 'price'). */
  sortBy?: CarSortBy;
  /** Maximum results to return after sort. */
  maxResults?: number;
}
export interface CarOffer {
  carId: string;
  category: CarCategory;
  supplier: string;
  dailyRate: string;
  totalRate: string;
  currency: string;
  features: string[];
  /** Source adapter name that returned this offer. */
  source: string;
}
export interface CarSearchOutput {
  cars: CarOffer[];
  currency: string;
  noAdaptersConfigured: boolean;
  /** Per-adapter result summary (timing + errors). */
  adapterSummary?: AdapterSummary[];
}
export interface CarAdapter {
  name: string;
  searchCars(input: CarSearchInput): Promise<CarOffer[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────────────────────

export interface AdapterSummary {
  adapter: string;
  offerCount: number;
  durationMs: number;
  error?: string;
}

export type HotelCarOperation = 'searchHotels' | 'searchCars';
export interface HotelCarSearchInput {
  operation: HotelCarOperation;
  hotel?: HotelSearchInput;
  car?: CarSearchInput;
}
export interface HotelCarSearchOutput {
  hotelResults?: HotelSearchOutput;
  carResults?: CarSearchOutput;
}

export interface HotelCarSearchAgentOptions {
  hotelAdapters?: HotelAdapter[];
  carAdapters?: CarAdapter[];
  /** Per-adapter timeout in milliseconds. Default 10000. */
  timeoutMs?: number;
}
