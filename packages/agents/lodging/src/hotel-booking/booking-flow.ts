/**
 * Hotel booking flow — rate verification → reserve → confirm.
 *
 * Domain rules:
 * - Rate re-verification needed before booking (price can change between search and book)
 * - Hotels use soft holds during checkout (Redis TTL), converting to permanent on payment
 * - Booking on any channel instantly reduces inventory across all channels
 *
 * Domain source: OTAIP Lodging Knowledge Base §4 (Booking Flow)
 */

import type { BookingRequest, BookingRecord, BookingOutput } from './types.js';
import { generateConfirmationCodes } from './confirmation-handler.js';
import { routePayment } from './payment-router.js';

/** In-memory booking store (mock for v0.1.0) */
const bookingStore = new Map<string, BookingRecord>();

let bookingCounter = 0;

function generateBookingId(): string {
  bookingCounter++;
  return `BK-${Date.now()}-${bookingCounter}`;
}

/**
 * Execute a full booking flow.
 *
 * Steps (from knowledge base):
 * 1. Rate re-verification (price may have changed since search)
 * 2. Reserve (soft hold)
 * 3. Payment processing
 * 4. Confirmation code generation (3 layers: CRS, PMS, channel)
 * 5. Store booking record
 */
export async function executeBooking(request: BookingRequest): Promise<BookingOutput> {
  // Step 1: Rate re-verification (mock — always succeeds in v0.1.0)
  // In production, would call adapter.checkRate() to verify price hasn't changed
  const rateVerified = true;
  const rateChanged = false;

  if (!rateVerified) {
    return {
      success: false,
      error: 'Rate verification failed — rate no longer available',
      rateChanged: true,
    };
  }

  // Step 2: Generate booking ID
  const bookingId = generateBookingId();

  // Step 3: Process payment
  const paymentResult = routePayment(request.paymentModel, {
    amount: '0.00', // Mock — real implementation would use the actual rate
    currency: 'USD',
  });

  // Step 4: Generate 3-layer confirmation codes
  const confirmation = generateConfirmationCodes(request.source);

  // Step 5: Calculate cancellation deadline
  const cancellationDeadline = calculateCancellationDeadline(
    request.checkIn,
    24, // Default 24hr before check-in
  );

  // Step 6: Create booking record
  const booking: BookingRecord = {
    bookingId,
    confirmation,
    status: 'confirmed',
    bookedAt: new Date().toISOString(),
    totalCharged: paymentResult.chargedAmount,
    paymentModel: request.paymentModel,
    virtualCard: paymentResult.virtualCard,
    cancellationPolicy: {
      refundable: true,
      deadlines: [{ hoursBeforeCheckin: 24, penaltyType: 'nights', penaltyValue: 1 }],
      freeCancel24hrBooking: true,
    },
    cancellationDeadline,
    guest: request.guest,
    request,
  };

  // Store booking
  bookingStore.set(bookingId, booking);

  return {
    success: true,
    booking,
    rateChanged,
  };
}

/**
 * Retrieve a booking by ID.
 */
export function getBooking(bookingId: string): BookingRecord | undefined {
  return bookingStore.get(bookingId);
}

/**
 * Update a booking record in the store.
 */
export function updateBooking(
  bookingId: string,
  updates: Partial<BookingRecord>,
): BookingRecord | undefined {
  const existing = bookingStore.get(bookingId);
  if (!existing) return undefined;

  const updated = { ...existing, ...updates };
  bookingStore.set(bookingId, updated);
  return updated;
}

function calculateCancellationDeadline(checkIn: string, hoursBefore: number): string {
  const checkInDate = new Date(checkIn);
  checkInDate.setHours(checkInDate.getHours() - hoursBefore);
  return checkInDate.toISOString();
}

/** Clear all bookings (for testing). */
export function clearBookingStore(): void {
  bookingStore.clear();
  bookingCounter = 0;
}
