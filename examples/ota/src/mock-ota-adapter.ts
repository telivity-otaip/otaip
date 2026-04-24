/**
 * Mock OTA Adapter — extends MockDuffelAdapter with booking persistence.
 *
 * Constructor accepts an optional `SqliteStore`. When provided, bookings,
 * payments, and tickets are persisted to SQLite and survive server restart.
 * When absent, the adapter uses an in-memory `Map` (legacy behavior for
 * existing tests that don't want to touch disk).
 */

import { MockDuffelAdapter } from '@otaip/adapter-duffel';
import type {
  OtaAdapter,
  BookingRequest,
  BookingResult,
  BookingStatus,
  CancelResult,
} from './types.js';
import type { SqliteStore, BookingRow } from './persistence/sqlite-store.js';

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
  const prefix = '016';
  let digits = '';
  for (let i = 0; i < 10; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return `${prefix}${digits}`;
}

// ---------------------------------------------------------------------------
// MockOtaAdapter
// ---------------------------------------------------------------------------

export interface MockOtaAdapterOptions {
  /** When provided, bookings/payments/tickets are persisted to SQLite. */
  store?: SqliteStore;
}

export class MockOtaAdapter extends MockDuffelAdapter implements OtaAdapter {
  /** In-memory fallback used only when no `store` is injected. */
  private readonly memoryBookings = new Map<string, BookingRow>();
  private readonly store?: SqliteStore;

  constructor(options: MockOtaAdapterOptions = {}) {
    super();
    if (options.store) this.store = options.store;
  }

  private getRow(reference: string): BookingRow | null {
    if (this.store) return this.store.getBooking(reference);
    return this.memoryBookings.get(reference) ?? null;
  }

  private putRow(row: BookingRow): void {
    if (this.store) {
      this.store.putBooking(row);
    } else {
      this.memoryBookings.set(row.bookingReference, row);
    }
  }

  async book(request: BookingRequest): Promise<BookingResult> {
    const reference = generateReference();
    const now = new Date().toISOString();

    const row: BookingRow = {
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

    this.putRow(row);
    return this.toResult(row);
  }

  /**
   * Update the booking with price info from the offer.
   * Called by BookingService after verifying the offer exists.
   */
  updateBookingPrice(reference: string, totalAmount: string, currency: string): void {
    const row = this.getRow(reference);
    if (!row) return;
    row.totalAmount = totalAmount;
    row.currency = currency;
    this.putRow(row);
  }

  /**
   * Record a payment against a booking. Optionally records the payment
   * intent ID (Stripe) for cross-reference.
   */
  recordPayment(reference: string, paymentId: string, paymentIntentId?: string): void {
    const row = this.getRow(reference);
    if (!row) return;
    row.paymentId = paymentId;
    if (paymentIntentId !== undefined) row.paymentIntentId = paymentIntentId;
    this.putRow(row);
  }

  /**
   * Issue mock tickets for a booking. Returns the generated ticket numbers,
   * or null when the booking does not exist.
   */
  issueTickets(reference: string): string[] | null {
    const row = this.getRow(reference);
    if (!row) return null;

    if (row.status === 'ticketed' && row.ticketNumbers) {
      return row.ticketNumbers;
    }

    const ticketNumbers = row.passengers.map(() => generateTicketNumber());
    row.ticketNumbers = ticketNumbers;
    row.status = 'ticketed';
    row.ticketedAt = new Date().toISOString();
    this.putRow(row);

    return ticketNumbers;
  }

  async getBooking(reference: string): Promise<BookingResult | null> {
    const row = this.getRow(reference);
    if (!row) return null;
    return this.toResult(row);
  }

  async cancelBooking(reference: string): Promise<CancelResult> {
    const row = this.getRow(reference);

    if (!row) {
      return {
        success: false,
        message: `Booking not found: ${reference}`,
        bookingReference: reference,
      };
    }

    if (row.status === 'ticketed') {
      return {
        success: false,
        message: 'Cannot cancel a ticketed booking. Contact support for refunds.',
        bookingReference: reference,
      };
    }

    if (row.status === 'cancelled') {
      return {
        success: false,
        message: 'Booking is already cancelled.',
        bookingReference: reference,
      };
    }

    row.status = 'cancelled';
    this.putRow(row);

    return {
      success: true,
      message: 'Booking cancelled successfully.',
      bookingReference: reference,
    };
  }

  private toResult(row: BookingRow): BookingResult {
    return {
      bookingReference: row.bookingReference,
      status: row.status,
      offerId: row.offerId,
      passengers: row.passengers,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      ...(row.ticketNumbers ? { ticketNumbers: row.ticketNumbers } : {}),
      totalAmount: row.totalAmount,
      currency: row.currency,
      createdAt: row.createdAt,
    };
  }
}

// Re-export BookingStatus so downstream consumers keep a single import surface.
export type { BookingStatus };
