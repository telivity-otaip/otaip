/**
 * Booking Service — creates bookings via the OTA adapter.
 *
 * Validates the offer exists in the search cache before booking.
 */

import type { MockOtaAdapter } from '../mock-ota-adapter.js';
import type { SearchService } from './search-service.js';
import type { BookingResult, PassengerDetail } from '../types.js';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BookingService {
  private readonly adapter: MockOtaAdapter;
  private readonly searchService: SearchService;

  constructor(adapter: MockOtaAdapter, searchService: SearchService) {
    this.adapter = adapter;
    this.searchService = searchService;
  }

  /**
   * Create a booking for a previously searched offer.
   *
   * @throws Error if the offer is not found in the search cache.
   */
  async createBooking(
    offerId: string,
    passengers: PassengerDetail[],
    contactEmail: string,
    contactPhone: string,
  ): Promise<BookingResult> {
    // Verify offer exists in search cache
    const offer = this.searchService.getOffer(offerId);
    if (!offer) {
      throw new OfferNotFoundError(offerId);
    }

    const result = await this.adapter.book({
      offerId,
      passengers,
      contactEmail,
      contactPhone,
    });

    // Update the booking with actual price from the offer
    this.adapter.updateBookingPrice(
      result.bookingReference,
      offer.price.total.toFixed(2),
      offer.price.currency,
    );

    return {
      ...result,
      totalAmount: offer.price.total.toFixed(2),
      currency: offer.price.currency,
    };
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class OfferNotFoundError extends Error {
  constructor(offerId: string) {
    super(`Offer not found: ${offerId}. Search for flights first.`);
    this.name = 'OfferNotFoundError';
  }
}
