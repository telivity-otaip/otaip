/**
 * Self-Service Rebooking — Agent 5.5 Types
 *
 * Read-only orchestrator. Finds alternative itineraries via
 * AvailabilitySearch (1.1), assesses change rules via
 * ChangeManagement (5.1), and prices each alternative including
 * change fees and fare differences.
 *
 * Does NOT execute the reissue — that's ExchangeReissue (5.2).
 */

import type { SearchOffer } from '@otaip/core';
import type {
  ChangeAction,
  ChangeFeeRule,
  OriginalTicketSummary,
} from '../change-management/types.js';

export type RebookingReason =
  | 'voluntary'
  | 'schedule_change'
  | 'missed_connection'
  | 'cancellation';

export interface Money {
  amount: string;
  currency: string;
}

export interface RebookingInput {
  /** The original ticket being changed. Required. */
  originalTicket: OriginalTicketSummary;
  /** New desired origin (IATA 3-letter). */
  newOrigin: string;
  /** New desired destination (IATA 3-letter). */
  newDestination: string;
  /** New desired departure date (YYYY-MM-DD). */
  newDepartureDate: string;
  /** Restrict to flights departing the same calendar day as requested. */
  sameDay?: boolean;
  /** Max alternatives to return. Default 5. */
  maxAlternatives?: number;
  /** Reason for the rebooking — controls whether change fees are waived. */
  reason: RebookingReason;
  /** When the rebooking was requested (ISO 8601). Defaults to now. */
  requestedAt?: string;
}

export interface RebookingAlternative {
  rank: number;
  /** The raw search offer for this alternative. */
  newItinerary: SearchOffer;
  /** Change fee (waived → "0.00" for involuntary). */
  changeFee: Money;
  /** Fare diff: new fare minus original fare. Negative = residual credit. */
  fareDifference: Money;
  /** Tax diff: new tax minus original tax. */
  taxDifference: Money;
  /** Total due from passenger: changeFee + fareDifference + taxDifference. */
  totalCost: Money;
  /** Action from ChangeManagement: REISSUE, REBOOK, or REJECT (REJECT filtered out before output). */
  action: ChangeAction;
  /** Any policy notes — e.g. "involuntary change — fee waived" or "same-day only". */
  policyRestrictions: string[];
}

export interface OriginalFarePolicy {
  isRefundable: boolean;
  changeFeeRule?: ChangeFeeRule;
}

export interface RebookingOutput {
  alternatives: RebookingAlternative[];
  noAlternativesFound: boolean;
  originalFarePolicy: OriginalFarePolicy;
}
