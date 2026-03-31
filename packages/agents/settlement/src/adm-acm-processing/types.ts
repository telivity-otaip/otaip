/**
 * ADM/ACM Processing — Types
 *
 * Agent 6.3: Agency Debit Memo receipt, assessment, dispute, and
 * Agency Credit Memo application workflows.
 */

export type ADMStatus = 'RECEIVED' | 'ASSESSED' | 'DISPUTED' | 'ACCEPTED' | 'ESCALATED';

export type ACMStatus = 'RECEIVED' | 'APPLIED';

export type DisputeGround =
  | 'FARE_ALREADY_CORRECT'
  | 'WITHIN_WAIVER_WINDOW'
  | 'DUPLICATE_ADM'
  | 'AMOUNT_INCORRECT'
  | 'OUTSIDE_AIRLINE_POLICY'
  | 'TICKET_REISSUED';

export type ADMACMErrorCode =
  | 'ADM_NOT_FOUND'
  | 'ACM_NOT_FOUND'
  | 'INVALID_STATUS_TRANSITION'
  | 'DISPUTE_WINDOW_CLOSED'
  | 'ALREADY_DISPUTED'
  | 'ALREADY_ACCEPTED';

export interface StatusChange {
  /** Previous status */
  from: ADMStatus;
  /** New status */
  to: ADMStatus;
  /** ISO timestamp */
  timestamp: string;
  /** Optional notes */
  notes?: string;
}

export interface ADMRecord {
  /** Unique ADM identifier (UUID) */
  admId: string;
  /** Ticket number related to the ADM */
  ticketNumber: string;
  /** Airline code that issued the ADM */
  airline: string;
  /** ADM amount (decimal string) */
  amount: string;
  /** Currency code */
  currency: string;
  /** Reason description */
  reason: string;
  /** IATA reason code */
  reasonCode: string;
  /** Date the ADM was issued (ISO date) */
  issuedDate: string;
  /** Dispute deadline (issuedDate + 15 days, ISO date) */
  disputeDeadline: string;
  /** Current status */
  status: ADMStatus;
  /** Status change history */
  history: StatusChange[];
}

export interface ACMRecord {
  /** Unique ACM identifier (UUID) */
  acmId: string;
  /** Ticket number related to the ACM */
  ticketNumber: string;
  /** Airline code that issued the ACM */
  airline: string;
  /** ACM amount (decimal string) */
  amount: string;
  /** Currency code */
  currency: string;
  /** Reason description */
  reason: string;
  /** Date the ACM was issued (ISO date) */
  issuedDate: string;
  /** Current status */
  status: ACMStatus;
}

export interface ADMAssessment {
  /** The assessed ADM ID */
  admId: string;
  /** Days remaining until dispute deadline */
  daysRemaining: number;
  /** Whether the dispute window has expired */
  windowExpired: boolean;
  /** Recommended action */
  recommendedAction: 'DISPUTE' | 'ACCEPT';
  /** Urgency warning (if deadline is close) */
  urgencyWarning?: string;
  /** Notes about the assessment */
  notes: string;
}

export interface ADMDisputeResult {
  /** The disputed ADM ID */
  admId: string;
  /** Dispute ground used */
  ground: DisputeGround;
  /** Supporting evidence description */
  evidence: string;
  /** Whether the dispute was filed successfully */
  success: boolean;
  /** Updated ADM record */
  updatedRecord: ADMRecord;
}

export interface PendingDeadlineItem {
  /** ADM record */
  adm: ADMRecord;
  /** Days remaining until deadline */
  daysRemaining: number;
  /** Whether urgent (5 days or less) */
  urgent: boolean;
}

export interface ADMACMProcessingInput {
  /** Operation to perform */
  operation:
    | 'receiveADM'
    | 'receiveACM'
    | 'assessADM'
    | 'disputeADM'
    | 'acceptADM'
    | 'escalateADM'
    | 'applyACM'
    | 'getADM'
    | 'getPendingWithDeadlines';

  /** Ticket number (for receiveADM, receiveACM) */
  ticketNumber?: string;
  /** Airline code (for receiveADM, receiveACM) */
  airline?: string;
  /** Amount (decimal string, for receiveADM, receiveACM) */
  amount?: string;
  /** Currency code (for receiveADM, receiveACM) */
  currency?: string;
  /** Reason description (for receiveADM, receiveACM) */
  reason?: string;
  /** IATA reason code (for receiveADM) */
  reasonCode?: string;
  /** ADM ID (for assessADM, disputeADM, acceptADM, escalateADM, getADM) */
  admId?: string;
  /** ACM ID (for applyACM) */
  acmId?: string;
  /** Dispute ground (for disputeADM) */
  disputeGround?: DisputeGround;
  /** Supporting evidence (for disputeADM) */
  evidence?: string;
  /** Current date (ISO date, for assessment calculations) */
  currentDate?: string;
}

export interface ADMACMProcessingOutput {
  /** Created or updated ADM record */
  adm?: ADMRecord;
  /** Created or updated ACM record */
  acm?: ACMRecord;
  /** Assessment result */
  assessment?: ADMAssessment;
  /** Dispute result */
  disputeResult?: ADMDisputeResult;
  /** Pending ADMs with deadlines */
  pendingDeadlines?: PendingDeadlineItem[];
  /** Error code (if operation failed) */
  errorCode?: ADMACMErrorCode;
  /** Error message */
  errorMessage?: string;
}
