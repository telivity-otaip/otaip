/**
 * Feedback & Complaint — Types
 *
 * Agent 6.5: Complaint submission, EU261/US DOT compensation
 * calculation, case management, and regulatory record generation.
 */

export type ComplaintType =
  | 'DELAY'
  | 'CANCELLATION'
  | 'DOWNGRADE'
  | 'DENIED_BOARDING'
  | 'BAGGAGE'
  | 'SERVICE_QUALITY'
  | 'REFUND_DISPUTE'
  | 'ACCESSIBILITY'
  | 'OTHER';

export type ComplaintStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'COMPENSATION_OFFERED'
  | 'RESOLVED'
  | 'ESCALATED'
  | 'CLOSED';

export type Priority = 'HIGH' | 'NORMAL';

export type Regulation = 'EU261' | 'US_DOT' | 'NONE';

export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';

export type DOTCategory =
  | 'Flight Problems'
  | 'Oversales'
  | 'Baggage'
  | 'Disability'
  | 'Discrimination'
  | 'Other';

export interface CompensationResult {
  /** Whether compensation is eligible */
  eligible: boolean;
  /** Regulation applied */
  regulation: Regulation;
  /** Base compensation amount (decimal string) */
  baseAmount: string;
  /** Final compensation amount after reductions (decimal string) */
  finalAmount: string;
  /** Currency */
  currency: string;
  /** Reduction applied (e.g., 50% for alternative offered) */
  reductionPercent: number;
  /** Notes explaining the calculation */
  notes: string;
}

export interface DOTRecord {
  /** Complaint type */
  complaintType: ComplaintType;
  /** DOT category */
  dotCategory: DOTCategory;
  /** Airline code */
  airline: string;
  /** Flight number */
  flightNumber: string;
  /** Flight date */
  flightDate: string;
  /** Passenger name */
  passengerName: string;
  /** Complaint description */
  description: string;
  /** Compensation amount if applicable (decimal string) */
  compensationAmount?: string;
  /** Currency */
  currency?: string;
}

export interface ComplaintCase {
  /** Unique case ID (UUID) */
  caseId: string;
  /** Complaint type */
  complaintType: ComplaintType;
  /** Current status */
  status: ComplaintStatus;
  /** Priority */
  priority: Priority;
  /** Passenger name */
  passengerName: string;
  /** Booking reference */
  bookingReference: string;
  /** Airline code */
  airline: string;
  /** Flight number */
  flightNumber: string;
  /** Flight date (ISO date) */
  flightDate: string;
  /** Description of the complaint */
  description: string;
  /** Applicable regulation */
  regulation: Regulation;
  /** Compensation result (if calculated) */
  compensation?: CompensationResult;
  /** Submitted date (ISO date) */
  submittedDate: string;
  /** Status history */
  statusHistory: Array<{
    from: ComplaintStatus;
    to: ComplaintStatus;
    timestamp: string;
  }>;
}

export interface FeedbackComplaintInput {
  /** Operation to perform */
  operation:
    | 'submitComplaint'
    | 'updateStatus'
    | 'getCase'
    | 'listCases'
    | 'calculateCompensation'
    | 'generateDOTRecord';

  // --- submitComplaint fields ---
  /** Complaint type */
  complaintType?: ComplaintType;
  /** Passenger name */
  passengerName?: string;
  /** Booking reference */
  bookingReference?: string;
  /** Airline code */
  airline?: string;
  /** Flight number */
  flightNumber?: string;
  /** Flight date (ISO date) */
  flightDate?: string;
  /** Description */
  description?: string;

  // --- updateStatus fields ---
  /** Case ID */
  caseId?: string;
  /** New status */
  newStatus?: ComplaintStatus;

  // --- calculateCompensation fields ---
  /** Regulation to apply */
  regulation?: Regulation;
  /** Distance in km (EU261 distance bands) */
  distanceKm?: number;
  /** Delay in minutes */
  delayMinutes?: number;
  /** Delay hours (legacy, converted to delayMinutes internally) */
  delayHours?: number;
  /** Whether alternative transport was offered (EU261 reduction) */
  alternativeOffered?: boolean;
  /** Alternative arrival delay hours (for EU261 50% reduction eligibility) */
  alternativeArrivalDelayHours?: number;
  /** Fare paid (decimal string, for downgrade/denied boarding) */
  farePaid?: string;
  /** One-way fare amount (decimal string, for US DOT denied boarding) */
  fareAmount?: string;
  /** Currency */
  currency?: string;
  /** Cabin class */
  cabinClass?: CabinClass;
  /** Whether flight is domestic (US DOT: affects delay thresholds) */
  isDomestic?: boolean;

  // --- listCases filter ---
  /** Filter by status */
  filterStatus?: ComplaintStatus;
  /** Filter by complaint type */
  filterType?: ComplaintType;

  /** Current date (ISO date) */
  currentDate?: string;
}

export interface FeedbackComplaintOutput {
  /** Created or retrieved complaint case */
  complaintCase?: ComplaintCase;
  /** List of complaint cases */
  cases?: ComplaintCase[];
  /** Compensation calculation result */
  compensation?: CompensationResult;
  /** DOT record */
  dotRecord?: DOTRecord;
  /** Error message */
  errorMessage?: string;
}
