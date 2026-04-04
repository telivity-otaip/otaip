/**
 * Hotel Modification & Cancellation Agent — Input/Output types
 *
 * Agent 20.6: Handles post-booking changes including modifications (name, bed type),
 * date changes (which are cancel/rebook, NOT modifications), and cancellations
 * with penalty calculation.
 *
 * Domain source: OTAIP Lodging Knowledge Base §4 (Modification vs Cancel/Rebook)
 */

import type { MonetaryAmount, CancellationPolicy } from '../types/hotel-common.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type ModificationOperation = 'modify' | 'cancel' | 'check_penalty' | 'process_no_show';

/** Free modifications (no cancel/rebook required) */
export interface FreeModifications {
  guestFirstName?: string;
  guestLastName?: string;
  bedTypePreference?: string;
  smokingPreference?: boolean;
  specialRequests?: string;
  accessibilityNeeds?: string;
  guestCount?: number;
}

/** Changes that require cancel + rebook */
export interface DateChangeRequest {
  newCheckIn: string;
  newCheckOut: string;
}

export interface ModificationInput {
  operation: ModificationOperation;
  /** Existing booking ID */
  bookingId: string;
  /** Free modifications (for 'modify' operation) */
  modifications?: FreeModifications;
  /** Date change (triggers cancel/rebook flow) */
  dateChange?: DateChangeRequest;
  /** Booking timestamp for California 24hr rule check (ISO string) */
  bookedAt?: string;
  /** Current cancellation policy */
  cancellationPolicy?: CancellationPolicy;
  /** Check-in date for deadline calculations */
  checkInDate?: string;
  /** Nightly rate from the booking record (penalty calculated against booked rate, not current rate) */
  nightlyRate?: MonetaryAmount;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type ChangeClassification = 'free_modification' | 'cancel_rebook_required' | 'not_modifiable';

export interface PenaltyCalculation {
  penaltyAmount: MonetaryAmount;
  penaltyType: string;
  deadline: string;
  isWithinFreeWindow: boolean;
  californiaRuleApplies: boolean;
}

export interface ModificationOutput {
  success: boolean;
  /** How the requested change was classified */
  classification: ChangeClassification;
  /** Whether this is a free modification */
  isFreeMod: boolean;
  /** Penalty details (for cancellations) */
  penalty?: PenaltyCalculation;
  /** Whether a rebook is required (for date changes) */
  rebookRequired: boolean;
  /** Updated confirmation codes (for successful modifications) */
  newBookingId?: string;
  /** Error or status message */
  message: string;
}
