/**
 * Local re-statement of the lodging search-aggregator's adapter contract.
 *
 * The canonical definition lives at
 * `packages/agents/lodging/src/hotel-search/adapters/base-adapter.ts` but is
 * not currently re-exported from `@otaip/agents-lodging`. Re-stating it
 * here (structurally identical) keeps this package free of an unexported
 * deep-import while still letting the `HotelbedsAdapter` plug into the
 * search aggregator — any class implementing this interface will also
 * satisfy the lodging package's HotelSourceAdapter via structural typing.
 *
 * If the lodging package later promotes its interface to a public export,
 * this file should be deleted and the import switched over.
 */

import type { RawHotelResult } from '@otaip/agents-lodging';

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
  readonly adapterId: string;
  readonly adapterName: string;
  searchHotels(params: HotelSearchParams): Promise<RawHotelResult[]>;
  isAvailable(): Promise<boolean>;
}
