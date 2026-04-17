/**
 * Manage Service — retrieve and cancel bookings.
 */

import type { MockOtaAdapter } from '../mock-ota-adapter.js';
import type { BookingResult, CancelResult } from '../types.js';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ManageService {
  private readonly adapter: MockOtaAdapter;

  constructor(adapter: MockOtaAdapter) {
    this.adapter = adapter;
  }

  /** Retrieve booking details by reference. */
  async getBooking(reference: string): Promise<BookingResult | null> {
    return this.adapter.getBooking(reference);
  }

  /** Cancel a booking if eligible. */
  async cancelBooking(reference: string): Promise<CancelResult> {
    return this.adapter.cancelBooking(reference);
  }
}
