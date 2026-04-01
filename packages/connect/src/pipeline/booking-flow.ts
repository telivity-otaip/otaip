/**
 * STUB — Booking pipeline: search → evaluate → price → book → confirm.
 * Full implementation wired with Agent 1.9 in a separate build.
 */

import type { ConnectAdapter, SearchFlightsInput, BookingResult, CreateBookingInput } from '../types.js';

export interface BookingPipelineConfig {
  adapter: ConnectAdapter;
  autoTicket: boolean;
  paymentTimeoutMs: number;
}

export type BookingPipelineStep =
  | 'search'
  | 'evaluate'
  | 'price'
  | 'book'
  | 'confirm';

export class BookingPipeline {
  constructor(private _config: BookingPipelineConfig) {}

  async execute(
    _searchInput: SearchFlightsInput,
    _bookingInput: Omit<CreateBookingInput, 'offerId'>,
  ): Promise<BookingResult> {
    throw new Error('Not implemented — booking pipeline is a stub');
  }
}
