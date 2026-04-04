/**
 * Hotel Booking Agent — Input/Output types
 *
 * Agent 4.5: Executes hotel bookings through the optimal source, manages the
 * full booking flow from rate verification through confirmation.
 *
 * Domain source: OTAIP Lodging Knowledge Base §4 (Hotel Booking Lifecycle)
 */

import type {
  HotelSource,
  GuestInfo,
  HotelConfirmation,
  PaymentModel,
  CancellationPolicy,
  MonetaryAmount,
  HotelBookingStatus,
} from '../types/hotel-common.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type BookingOperation = 'book' | 'verify_rate' | 'get_booking';

export interface BookingRequest {
  /** Canonical property ID (from Agent 4.2) */
  canonicalPropertyId: string;
  /** Rate ID to book (from Agent 4.4) */
  rateId: string;
  /** Source to book through */
  source: HotelSource;
  /** Check-in date (ISO string) */
  checkIn: string;
  /** Check-out date (ISO string) */
  checkOut: string;
  /** Number of rooms */
  rooms: number;
  /** Guest details */
  guest: GuestInfo;
  /** Payment method */
  paymentModel: PaymentModel;
  /** Special requests (free text) */
  specialRequests?: string;
}

export interface BookingInput {
  operation: BookingOperation;
  /** Required for 'book' and 'verify_rate' operations */
  bookingRequest?: BookingRequest;
  /** Required for 'get_booking' operation */
  bookingId?: string;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface VirtualCardInfo {
  /** Last 4 digits of VCN */
  lastFour: string;
  /** VCN expiry date */
  expiryDate: string;
  /** Authorized amount: room + tax + resort fees ONLY (per domain rules) */
  authorizedAmount: MonetaryAmount;
  /** Dual folio required for VCN bookings */
  dualFolioRequired: true;
}

export interface BookingRecord {
  bookingId: string;
  /** All three confirmation code layers */
  confirmation: HotelConfirmation;
  status: HotelBookingStatus;
  /** Booking creation timestamp (ISO string) */
  bookedAt: string;
  /** Total charged or authorized */
  totalCharged: MonetaryAmount;
  /** Payment model used */
  paymentModel: PaymentModel;
  /** Virtual card details (only for VCN bookings) */
  virtualCard?: VirtualCardInfo;
  /** Cancellation policy attached to THIS booking */
  cancellationPolicy: CancellationPolicy;
  /** Cancellation deadline (ISO datetime) */
  cancellationDeadline?: string;
  /** Guest details */
  guest: GuestInfo;
  /** Original request */
  request: BookingRequest;
}

export interface BookingOutput {
  success: boolean;
  /** Booking record (if successful) */
  booking?: BookingRecord;
  /** Error message (if failed) */
  error?: string;
  /** Whether rate changed between search and booking */
  rateChanged?: boolean;
  /** New rate if changed */
  newRate?: MonetaryAmount;
}
