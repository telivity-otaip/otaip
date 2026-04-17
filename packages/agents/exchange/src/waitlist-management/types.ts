/**
 * Waitlist Management — Agent 5.6 Types
 *
 * Stateful queue: holds waitlist entries in-memory, computes priority
 * scores, processes clearances when seats open, expires entries past
 * their cutoff window.
 *
 * State is in-memory only (same pattern as MockOtaAdapter and
 * NavitaireOrderOperations). Not durable across restarts.
 */

export type StatusTier = 'general' | 'silver' | 'gold' | 'platinum';
export type FareClassType = 'full_fare' | 'discount';

export type WaitlistOperation = 'addEntry' | 'clear' | 'queryStatus' | 'expire';

/** A segment uniquely identifies "which flight is the passenger waitlisted on." */
export interface WaitlistSegment {
  carrier: string;            // IATA 2-letter
  flightNumber: string;
  departureDate: string;      // YYYY-MM-DD
  bookingClass: string;       // Y, B, M, H, K, etc.
}

/** Canonical form of a segment, used as the queue key. */
export type SegmentKey = string;

export interface WaitlistEntry {
  entryId: string;
  bookingReference: string;
  segment: WaitlistSegment;
  statusTier: StatusTier;
  fareClass: string;
  fareClassType: FareClassType;
  requestedAt: string;        // ISO 8601
  cutoffBeforeDepartureHours: number;
  /** Computed at add time, frozen from then on (so position is stable). */
  priorityScore: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-operation input/output
// ─────────────────────────────────────────────────────────────────────────────

export interface AddEntryInput {
  entryId: string;
  bookingReference: string;
  segment: WaitlistSegment;
  statusTier: StatusTier;
  fareClass: string;
  fareClassType: FareClassType;
  requestedAt?: string;                   // default: now
  cutoffBeforeDepartureHours?: number;    // default: 24
}

export interface ClearInput {
  segment: WaitlistSegment;
  seatsAvailable: number;
  clearTime?: string;                     // default: now
}

export interface ClearResult {
  cleared: WaitlistEntry[];
  remaining: WaitlistEntry[];
}

/**
 * Per-booking-class clearance probability override.
 * Default map: business (C/D/I/J) 0.6, economy Y 0.5, discount 0.4.
 */
export type ClearanceRateMap = Record<string, number>;

export interface QueryStatusInput {
  entryId: string;
  historicalClearanceRates?: ClearanceRateMap;
}

export interface QueryStatusResult {
  entry: WaitlistEntry | null;
  /** 1-based position in the queue for that segment. `null` if entry unknown. */
  position: number | null;
  /** Estimated probability the passenger will clear before departure. 0..1. */
  estimatedClearanceProbability: number | null;
  /** ISO 8601 timestamp when this entry expires. */
  willExpireAt: string | null;
}

export interface ExpireInput {
  currentTime?: string;                   // default: now
}

export interface ExpireResult {
  expired: WaitlistEntry[];
  remaining: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent input / output (operation-keyed union)
// ─────────────────────────────────────────────────────────────────────────────

export interface WaitlistInput {
  operation: WaitlistOperation;
  addEntry?: AddEntryInput;
  clear?: ClearInput;
  queryStatus?: QueryStatusInput;
  expire?: ExpireInput;
}

export interface WaitlistOutput {
  operation: WaitlistOperation;
  entryId?: string;
  entry?: WaitlistEntry;
  clearResult?: ClearResult;
  statusResult?: QueryStatusResult;
  expireResult?: ExpireResult;
}
