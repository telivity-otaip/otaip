/**
 * Self-Service Rebooking — Types
 *
 * Agent 5.5: Self-service rebooking eligibility, fee calculation,
 * and rebooking option generation.
 */

/* ------------------------------------------------------------------ */
/*  Enums / Unions                                                    */
/* ------------------------------------------------------------------ */

export type RebookOperation =
  | 'validateRebookEligibility'
  | 'calculateRebookFee'
  | 'buildRebookOptions';

export type RebookReason =
  | 'VOLUNTARY'
  | 'SCHEDULE_CHANGE'
  | 'MEDICAL'
  | 'BEREAVEMENT';

export type EligibilityResult =
  | 'ELIGIBLE'
  | 'NOT_ELIGIBLE'
  | 'MUST_CALL_AGENT';

/* ------------------------------------------------------------------ */
/*  Core structures                                                   */
/* ------------------------------------------------------------------ */

export interface OriginalBooking {
  /** PNR record locator */
  pnrRef: string;
  /** Passenger name LAST/FIRST */
  passengerName: string;
  /** Fare basis code */
  fareBasis: string;
  /** Current fare amount (decimal string) */
  currentFare: string;
  /** Currency */
  currency: string;
  /** Origin airport */
  origin: string;
  /** Destination airport */
  destination: string;
  /** Departure date-time ISO-8601 */
  departureDateTime: string;
  /** Cabin class */
  cabin: string;
  /** Carrier code */
  carrier: string;
  /** Flight number */
  flightNumber: string;
  /** Whether a waiver code applies */
  hasWaiver?: boolean;
}

export interface RebookRequest {
  /** Desired origin (may differ from original) */
  desiredOrigin: string;
  /** Desired destination (may differ from original) */
  desiredDestination: string;
  /** Desired departure date */
  desiredDate: string;
  /** Desired cabin */
  desiredCabin?: string;
}

export interface AvailableRebookFlight {
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
  /** Cabin */
  cabin: string;
  /** Fare amount (decimal string) */
  fare: string;
  /** Currency */
  currency: string;
  /** Available seats */
  seatsAvailable: number;
}

/* ------------------------------------------------------------------ */
/*  Eligibility                                                       */
/* ------------------------------------------------------------------ */

export interface EligibilityAssessment {
  /** Result */
  result: EligibilityResult;
  /** Reason */
  reason: string;
  /** Whether fee is waived */
  feeWaived: boolean;
  /** Whether this is a schedule change with >60min diff */
  isScheduleChange: boolean;
}

/* ------------------------------------------------------------------ */
/*  Fee Calculation                                                   */
/* ------------------------------------------------------------------ */

export interface RebookFeeCalculation {
  /** Base change fee (decimal string) */
  changeFee: string;
  /** Fare difference new - current (decimal string, can be negative) */
  fareDifference: string;
  /** Total due = max(changeFee + fareDifference, 0) (decimal string) */
  totalDue: string;
  /** Currency */
  currency: string;
  /** Whether fee was waived */
  feeWaived: boolean;
  /** Breakdown summary */
  summary: string;
}

/* ------------------------------------------------------------------ */
/*  Rebook Options                                                    */
/* ------------------------------------------------------------------ */

export interface RebookOption {
  /** Flight key */
  flightKey: string;
  /** Carrier */
  carrier: string;
  /** Flight number */
  flightNumber: string;
  /** Departure */
  departure: string;
  /** Cabin */
  cabin: string;
  /** New fare (decimal string) */
  newFare: string;
  /** Change fee (decimal string) */
  changeFee: string;
  /** Fare difference (decimal string) */
  fareDifference: string;
  /** Total due (decimal string) */
  totalDue: string;
  /** Currency */
  currency: string;
  /** Available seats */
  seatsAvailable: number;
}

export interface RebookOptionsResult {
  /** Available options sorted by total due ascending */
  options: RebookOption[];
  /** Count */
  totalOptions: number;
}

/* ------------------------------------------------------------------ */
/*  Agent I/O                                                         */
/* ------------------------------------------------------------------ */

export interface SelfServiceRebookingInput {
  /** Operation to perform */
  operation: RebookOperation;
  /** Original booking (required for all operations) */
  booking: OriginalBooking;
  /** Rebook reason */
  reason: RebookReason;
  /** Rebook request details (required for eligibility + options) */
  request?: RebookRequest;
  /** Current date-time ISO-8601 (used for departure proximity check) */
  currentDateTime?: string;
  /** Schedule change time difference in minutes (used for SCHEDULE_CHANGE) */
  scheduleChangeMinutes?: number;
  /** New fare for fee calculation (decimal string) */
  newFare?: string;
  /** Available flights for buildRebookOptions */
  availableFlights?: AvailableRebookFlight[];
}

export interface SelfServiceRebookingOutput {
  /** Eligibility assessment (validateRebookEligibility) */
  eligibility?: EligibilityAssessment;
  /** Fee calculation (calculateRebookFee) */
  fee?: RebookFeeCalculation;
  /** Rebook options (buildRebookOptions) */
  rebookOptions?: RebookOptionsResult;
}
