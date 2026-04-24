/**
 * OTAIP Reference OTA — Sprint F types.
 *
 * Extends the core DistributionAdapter with booking, payment, and
 * ticketing methods needed by the OTA application layer.
 */

import type { DistributionAdapter } from '@otaip/core';

// ---------------------------------------------------------------------------
// Passenger detail (for booking)
// ---------------------------------------------------------------------------

export interface PassengerDetail {
  title: 'mr' | 'ms' | 'mrs' | 'miss' | 'dr';
  firstName: string;
  lastName: string;
  /** Date of birth in YYYY-MM-DD format */
  dateOfBirth: string;
  gender: 'male' | 'female';
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export interface BookingRequest {
  offerId: string;
  passengers: PassengerDetail[];
  contactEmail: string;
  contactPhone: string;
}

export type BookingStatus = 'confirmed' | 'pending' | 'ticketed' | 'cancelled';

export interface BookingResult {
  bookingReference: string;
  status: BookingStatus;
  offerId: string;
  passengers: PassengerDetail[];
  contactEmail: string;
  contactPhone: string;
  ticketNumbers?: string[];
  totalAmount: string;
  currency: string;
  createdAt: string;
  /** Stripe PaymentIntent ID, when a Stripe flow is active. */
  paymentIntentId?: string;
  /** Stripe PaymentIntent client_secret — returned from book so the frontend can collect card details. */
  clientSecret?: string;
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

export interface PaymentRequest {
  bookingReference: string;
  /** Mock: ignored. Real: Stripe payment method ID */
  paymentMethodId?: string;
}

export interface PaymentResult {
  paymentId: string;
  bookingReference: string;
  status: 'succeeded' | 'failed';
  amount: string;
  currency: string;
  paidAt: string;
}

// ---------------------------------------------------------------------------
// Ticketing
// ---------------------------------------------------------------------------

export interface TicketResult {
  bookingReference: string;
  status: BookingStatus;
  ticketNumbers: string[];
  ticketedAt: string;
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

export interface CancelResult {
  success: boolean;
  message: string;
  bookingReference: string;
}

// ---------------------------------------------------------------------------
// OTA Adapter — extends DistributionAdapter with booking methods
// ---------------------------------------------------------------------------

export interface OtaAdapter extends DistributionAdapter {
  book(request: BookingRequest): Promise<BookingResult>;
  getBooking(reference: string): Promise<BookingResult | null>;
  cancelBooking(reference: string): Promise<CancelResult>;
}
