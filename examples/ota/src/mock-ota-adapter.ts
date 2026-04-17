/**
 * Mock OTA Adapter — extends MockDuffelAdapter with in-memory booking.
 *
 * Stores bookings in a Map. All data is lost on server restart.
 * This is a reference implementation for the OTA example app.
 */

import { MockDuffelAdapter } from '@otaip/adapter-duffel';
import type {
  OtaAdapter,
  BookingRequest,
  BookingResult,
  BookingStatus,
  CancelResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Internal booking record
// ---------------------------------------------------------------------------

interface BookingRecord {
  bookingReference: string;
  offerId: string;
  passengers: BookingRequest['passengers'];
  contactEmail: string;
  contactPhone: string;
  status: BookingStatus;
  ticketNumbers?: string[];
  totalAmount: string;
  currency: string;
  createdAt: string;
  paymentId?: string;
  ticketedAt?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateReference(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `OTA-${code}`;
}

function generateTicketNumber(): string {
  // Mock 13-digit ticket number (airline code prefix + 10 digits)
  const prefix = '016'; // United-style 3-digit airline code
  let digits = '';
  for (let i = 0; i < 10; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return `${prefix}${digits}`;
}

// ---------------------------------------------------------------------------
// MockOtaAdapter
// ---------------------------------------------------------------------------

export class MockOtaAdapter extends MockDuffelAdapter implements OtaAdapter {
  private readonly bookings = new Map<string, BookingRecord>();

  async book(request: BookingRequest): Promise<BookingResult> {
    const reference = generateReference();
    const now = new Date().toISOString();

    const record: BookingRecord = {
      bookingReference: reference,
      offerId: request.offerId,
      passengers: request.passengers,
      contactEmail: request.contactEmail,
      contactPhone: request.contactPhone,
      status: 'confirmed',
      totalAmount: '0.00',
      currency: 'USD',
      createdAt: now,
    };

    this.bookings.set(reference, record);

    return this.toResult(record);
  }

  /**
   * Update the booking with price info from the offer.
   * Called by BookingService after verifying the offer exists.
   */
  updateBookingPrice(reference: string, totalAmount: string, currency: string): void {
    const record = this.bookings.get(reference);
    if (record) {
      record.totalAmount = totalAmount;
      record.currency = currency;
    }
  }

  /**
   * Record a payment against a booking.
   */
  recordPayment(reference: string, paymentId: string): void {
    const record = this.bookings.get(reference);
    if (record) {
      record.paymentId = paymentId;
    }
  }

  /**
   * Issue mock tickets for a booking.
   * Returns the generated ticket numbers.
   */
  issueTickets(reference: string): string[] | null {
    const record = this.bookings.get(reference);
    if (!record) return null;

    if (record.status === 'ticketed' && record.ticketNumbers) {
      return record.ticketNumbers;
    }

    const ticketNumbers = record.passengers.map(() => generateTicketNumber());
    record.ticketNumbers = ticketNumbers;
    record.status = 'ticketed';
    record.ticketedAt = new Date().toISOString();

    return ticketNumbers;
  }

  async getBooking(reference: string): Promise<BookingResult | null> {
    const record = this.bookings.get(reference);
    if (!record) return null;
    return this.toResult(record);
  }

  async cancelBooking(reference: string): Promise<CancelResult> {
    const record = this.bookings.get(reference);

    if (!record) {
      return {
        success: false,
        message: `Booking not found: ${reference}`,
        bookingReference: reference,
      };
    }

    if (record.status === 'ticketed') {
      return {
        success: false,
        message: 'Cannot cancel a ticketed booking. Contact support for refunds.',
        bookingReference: reference,
      };
    }

    if (record.status === 'cancelled') {
      return {
        success: false,
        message: 'Booking is already cancelled.',
        bookingReference: reference,
      };
    }

    record.status = 'cancelled';

    return {
      success: true,
      message: 'Booking cancelled successfully.',
      bookingReference: reference,
    };
  }

  private toResult(record: BookingRecord): BookingResult {
    return {
      bookingReference: record.bookingReference,
      status: record.status,
      offerId: record.offerId,
      passengers: record.passengers,
      contactEmail: record.contactEmail,
      contactPhone: record.contactPhone,
      ticketNumbers: record.ticketNumbers,
      totalAmount: record.totalAmount,
      currency: record.currency,
      createdAt: record.createdAt,
    };
  }
}
