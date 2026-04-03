/**
 * Confirmation Verification Agent — Input/Output types
 *
 * Agent 4.7: Cross-checks CRS↔PMS confirmation data to detect discrepancies
 * before guest arrival. Escalates missing PMS codes, waitlist/tentative status,
 * and rate/date mismatches.
 *
 * Domain source: OTAIP Lodging Knowledge Base §4 (Three-Layer Confirmation),
 *   §11 (Edge Cases — PMS sync delays)
 */

import type {
  HotelConfirmation,
  HotelBookingStatus,
  MonetaryAmount,
  GuestInfo,
} from '../types/hotel-common.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type VerificationOperation = 'verify' | 'check_pms_sync' | 'batch_verify';

/** Booking data as known by the CRS (booking channel) */
export interface CrsBookingData {
  confirmationCode: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  nightlyRate: MonetaryAmount;
  totalRate: MonetaryAmount;
  status: HotelBookingStatus;
}

/** Booking data as known by the PMS (property system) */
export interface PmsBookingData {
  confirmationCode: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  nightlyRate: MonetaryAmount;
  totalRate: MonetaryAmount;
  status: HotelBookingStatus;
}

export interface VerificationInput {
  operation: VerificationOperation;
  /** Booking ID to verify */
  bookingId: string;
  /** Three-layer confirmation codes from booking */
  confirmation: HotelConfirmation;
  /** CRS-side booking data */
  crsData: CrsBookingData;
  /** PMS-side booking data (may be missing if PMS hasn't synced yet) */
  pmsData?: PmsBookingData;
  /** Guest details for name verification */
  guest: GuestInfo;
  /** How many hours until check-in (for escalation urgency) */
  hoursUntilCheckin?: number;
  /** For batch_verify: additional booking IDs */
  batchBookingIds?: string[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type DiscrepancySeverity = 'critical' | 'warning' | 'info';

export type DiscrepancyField =
  | 'guest_name'
  | 'check_in'
  | 'check_out'
  | 'room_type'
  | 'nightly_rate'
  | 'total_rate'
  | 'status'
  | 'pms_missing'
  | 'pms_sync_delay';

export interface Discrepancy {
  /** Which field has a mismatch */
  field: DiscrepancyField;
  /** Value from CRS */
  crsValue: string;
  /** Value from PMS (or 'MISSING' if PMS data unavailable) */
  pmsValue: string;
  /** How serious this discrepancy is */
  severity: DiscrepancySeverity;
  /** Human-readable explanation */
  message: string;
}

export type EscalationReason =
  | 'pms_code_missing'
  | 'rate_mismatch'
  | 'date_mismatch'
  | 'guest_name_mismatch'
  | 'waitlist_status'
  | 'tentative_status'
  | 'room_type_mismatch'
  | 'multiple_discrepancies';

export interface VerificationOutput {
  /** Whether verification passed with no critical issues */
  verified: boolean;
  /** All detected discrepancies */
  discrepancies: Discrepancy[];
  /** Whether this needs human/agent escalation */
  escalationRequired: boolean;
  /** Why escalation is needed (if applicable) */
  escalationReasons: EscalationReason[];
  /** Verification timestamp */
  verifiedAt: string;
  /** Summary message */
  message: string;
}
