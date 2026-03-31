/**
 * Waitlist Management — Types
 *
 * Agent 5.6: Waitlist position tracking, priority scoring,
 * clearance management, and suggested alternatives.
 */

/* ------------------------------------------------------------------ */
/*  Enums / Unions                                                    */
/* ------------------------------------------------------------------ */

export type WaitlistOperation =
  | 'addToWaitlist'
  | 'getPosition'
  | 'checkStatus'
  | 'confirmCleared'
  | 'removeFromWaitlist'
  | 'getSuggestedAlternatives'
  | 'getPriorityQueue';

export type WaitlistStatus =
  | 'WAITLISTED'
  | 'CLEARED'
  | 'EXPIRED'
  | 'REMOVED';

export type ClearanceLikelihood = 'HIGH' | 'MEDIUM' | 'LOW';

export type CorporateTier = 'ELITE' | 'PREMIUM' | 'STANDARD';

export type CabinClass = 'F' | 'C' | 'W' | 'Y';

export type WaitlistErrorCode =
  | 'ENTRY_NOT_FOUND'
  | 'SEGMENT_NOT_ON_WAITLIST'
  | 'ALREADY_CONFIRMED';

/* ------------------------------------------------------------------ */
/*  Core structures                                                   */
/* ------------------------------------------------------------------ */

export interface WaitlistEntry {
  /** Unique entry identifier (UUID-like) */
  entryId: string;
  /** PNR record locator */
  pnrRef: string;
  /** Segment reference */
  segmentRef: string;
  /** Flight key (carrier + flight number + date) */
  flightKey: string;
  /** Requested cabin */
  requestedCabin: CabinClass;
  /** When the entry was added (ISO-8601) */
  addedAt: string;
  /** Computed priority score */
  priority: number;
  /** Number of passengers */
  passengerCount: number;
  /** Corporate tier */
  corporateTier: CorporateTier;
  /** Booking class */
  bookingClass: string;
  /** Current status */
  status: WaitlistStatus;
}

export interface WaitlistPosition {
  /** Entry ID */
  entryId: string;
  /** Position in queue (1-based) */
  position: number;
  /** Queue size */
  queueSize: number;
  /** Clearance likelihood */
  clearanceLikelihood: ClearanceLikelihood;
}

export interface AlternativeFlight {
  /** Carrier code */
  carrier: string;
  /** Flight number */
  flightNumber: string;
  /** Origin */
  origin: string;
  /** Destination */
  destination: string;
  /** Departure ISO-8601 */
  departure: string;
  /** Available seats */
  seatsAvailable: number;
  /** Cabin */
  cabin: string;
}

export interface WaitlistError {
  /** Error code */
  code: WaitlistErrorCode;
  /** Human-readable message */
  message: string;
}

/* ------------------------------------------------------------------ */
/*  Agent I/O                                                         */
/* ------------------------------------------------------------------ */

export interface WaitlistManagementInput {
  /** Operation to perform */
  operation: WaitlistOperation;
  /** Entry ID (for getPosition, checkStatus, confirmCleared, removeFromWaitlist) */
  entryId?: string;
  /** PNR reference */
  pnrRef?: string;
  /** Segment reference */
  segmentRef?: string;
  /** Flight key (for addToWaitlist, getPriorityQueue) */
  flightKey?: string;
  /** Requested cabin */
  requestedCabin?: CabinClass;
  /** Passenger count */
  passengerCount?: number;
  /** Corporate tier */
  corporateTier?: CorporateTier;
  /** Booking class */
  bookingClass?: string;
  /** Alternative flights (for getSuggestedAlternatives) */
  alternatives?: AlternativeFlight[];
}

export interface WaitlistManagementOutput {
  /** Created or found entry */
  entry?: WaitlistEntry;
  /** Position info */
  position?: WaitlistPosition;
  /** Queue of entries for a flight */
  queue?: WaitlistEntry[];
  /** Suggested alternatives */
  suggestedAlternatives?: AlternativeFlight[];
  /** Error (if applicable) */
  error?: WaitlistError;
}
