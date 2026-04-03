/**
 * Base Hotel Source Adapter interface.
 *
 * Every hotel distribution source (Amadeus, Hotelbeds, Duffel, GDS) implements
 * this interface. For v0.1.0, all adapters use mock/sandbox data.
 *
 * Domain source: OTAIP Lodging Knowledge Base §1 (Distribution Channels)
 */

import type { RawHotelResult } from '../../types/hotel-common.js';

export interface HotelSearchParams {
  destination: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children?: number;
  currency?: string;
}

export interface HotelSourceAdapter {
  /** Unique adapter identifier */
  readonly adapterId: string;
  /** Human-readable adapter name */
  readonly adapterName: string;

  /** Search for available hotels */
  searchHotels(params: HotelSearchParams): Promise<RawHotelResult[]>;

  /** Check if the adapter is available and responding */
  isAvailable(): Promise<boolean>;
}
