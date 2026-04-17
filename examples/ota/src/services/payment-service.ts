/**
 * Payment Service — processes payments for bookings.
 *
 * Sprint F uses mock payments (always succeeds).
 * The service is structured so Stripe can be plugged in later
 * by implementing the real payment path in processPayment().
 */

import type { MockOtaAdapter } from '../mock-ota-adapter.js';
import type { PaymentResult } from '../types.js';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PaymentService {
  private readonly adapter: MockOtaAdapter;

  constructor(adapter: MockOtaAdapter) {
    this.adapter = adapter;
  }

  /**
   * Process a payment for a booking.
   *
   * In mock mode this always succeeds.
   * In production, this would create a Stripe PaymentIntent and confirm it.
   */
  async processPayment(
    bookingReference: string,
    _paymentMethodId?: string,
  ): Promise<PaymentResult> {
    const booking = await this.adapter.getBooking(bookingReference);

    if (!booking) {
      throw new BookingNotFoundError(bookingReference);
    }

    if (booking.status === 'cancelled') {
      throw new PaymentError('Cannot process payment for a cancelled booking.');
    }

    // Mock payment — always succeeds
    const paymentId = `pay_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    // Record payment in the adapter
    this.adapter.recordPayment(bookingReference, paymentId);

    return {
      paymentId,
      bookingReference,
      status: 'succeeded',
      amount: booking.totalAmount,
      currency: booking.currency,
      paidAt: now,
    };
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BookingNotFoundError extends Error {
  constructor(reference: string) {
    super(`Booking not found: ${reference}`);
    this.name = 'BookingNotFoundError';
  }
}

export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentError';
  }
}
