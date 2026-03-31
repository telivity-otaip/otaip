/**
 * Disruption Response — Types
 *
 * Agent 5.4: IRROPS disruption impact assessment, response planning,
 * and automated response execution.
 */

/* ------------------------------------------------------------------ */
/*  Enums / Unions                                                    */
/* ------------------------------------------------------------------ */

export type DisruptionType = 'CANCELLED' | 'DELAYED' | 'DIVERTED';

export type PassengerTier = 'ELITE' | 'PREMIUM' | 'STANDARD';

export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'STANDARD';

export type ResponseActionType =
  | 'NOTIFY_ONLY'
  | 'REBOOK'
  | 'WAITLIST'
  | 'REFUND_OFFER';

export type ActionStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type DisruptionOperation =
  | 'assessImpact'
  | 'buildResponsePlan'
  | 'executeResponse';

/* ------------------------------------------------------------------ */
/*  Core structures                                                   */
/* ------------------------------------------------------------------ */

export interface AffectedFlight {
  /** Carrier code (2-char IATA) */
  carrier: string;
  /** Flight number */
  flightNumber: string;
  /** Origin airport code */
  origin: string;
  /** Destination airport code */
  destination: string;
  /** Scheduled departure ISO-8601 */
  scheduledDeparture: string;
  /** Delay in minutes (0 for cancellations) */
  delayMinutes: number;
}

export interface AffectedPNR {
  /** PNR record locator */
  pnrRef: string;
  /** Number of passengers on this PNR */
  passengerCount: number;
  /** Cabin class */
  cabin: string;
  /** Whether this PNR includes a connecting segment */
  isConnecting: boolean;
  /** Connection window in minutes (only relevant when isConnecting) */
  connectionWindowMinutes?: number;
  /** Passenger tier */
  passengerTier?: PassengerTier;
  /** Percentage of journey already elapsed */
  elapsedJourneyPercent?: number;
}

export interface DisruptionEvent {
  /** Unique event identifier */
  eventId: string;
  /** Disruption type */
  type: DisruptionType;
  /** Flights affected by this event */
  affectedFlights: AffectedFlight[];
  /** PNRs affected */
  affectedPNRs: AffectedPNR[];
  /** When the disruption was detected (ISO-8601) */
  detectedAt: string;
}

export interface AvailableFlight {
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

/* ------------------------------------------------------------------ */
/*  Impact Assessment                                                 */
/* ------------------------------------------------------------------ */

export interface PriorityBreakdown {
  critical: number;
  high: number;
  standard: number;
}

export interface ImpactAssessment {
  /** Event ID */
  eventId: string;
  /** Total affected passengers */
  totalAffectedPassengers: number;
  /** PNRs with connecting flights at risk */
  connectingAtRisk: number;
  /** Breakdown by priority */
  priorityBreakdown: PriorityBreakdown;
  /** Summary text */
  summary: string;
}

/* ------------------------------------------------------------------ */
/*  Response Plan                                                     */
/* ------------------------------------------------------------------ */

export interface ResponseAction {
  /** PNR reference */
  pnrRef: string;
  /** Computed priority */
  priority: PriorityLevel;
  /** Action type */
  actionType: ResponseActionType;
  /** Reason for action */
  reason: string;
  /** Rebook target flight (if applicable) */
  rebookFlight?: string;
  /** Current status */
  status: ActionStatus;
}

export interface ResponsePlan {
  /** UUID plan identifier */
  planId: string;
  /** Event this plan responds to */
  eventId: string;
  /** Ordered actions (CRITICAL first, then HIGH, then STANDARD) */
  actions: ResponseAction[];
  /** When the plan was created (ISO-8601) */
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Execution Result                                                  */
/* ------------------------------------------------------------------ */

export interface ExecutionResult {
  /** Plan that was executed */
  planId: string;
  /** Actions with updated statuses */
  executedActions: ResponseAction[];
  /** Count of successful actions */
  successCount: number;
  /** Count of failed actions */
  failedCount: number;
  /** When execution completed */
  completedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Agent I/O                                                         */
/* ------------------------------------------------------------------ */

export interface DisruptionResponseInput {
  /** Operation to perform */
  operation: DisruptionOperation;
  /** The disruption event (required for assessImpact & buildResponsePlan) */
  event?: DisruptionEvent;
  /** Available alternative flights (used by buildResponsePlan) */
  availableFlights?: AvailableFlight[];
  /** Plan ID to execute (required for executeResponse) */
  planId?: string;
}

export interface DisruptionResponseOutput {
  /** Impact assessment result (assessImpact) */
  impact?: ImpactAssessment;
  /** Response plan (buildResponsePlan) */
  plan?: ResponsePlan;
  /** Execution result (executeResponse) */
  execution?: ExecutionResult;
}
