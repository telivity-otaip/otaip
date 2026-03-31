/**
 * BSP Reconciliation — Types
 *
 * Agent 7.1: Matches agency records against BSP HOT files,
 * validates commission, identifies discrepancies.
 */

export type DiscrepancyType =
  | 'MISSING_IN_HOT'
  | 'MISSING_IN_AGENCY'
  | 'DUPLICATE_TRANSACTION'
  | 'COMMISSION_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'UNMATCHED_ADM'
  | 'UNMATCHED_ACM';

export type DiscrepancySeverity = 'critical' | 'high' | 'medium' | 'low';

export type HOTFileFormat = 'EDI_X12' | 'FIXED_WIDTH';

export interface HOTFileRecord {
  /** 13-digit ticket number */
  ticket_number: string;
  /** Passenger name */
  passenger_name: string;
  /** Origin airport code */
  origin: string;
  /** Destination airport code */
  destination: string;
  /** 2-char airline code */
  airline_code: string;
  /** Issue date (ISO) */
  issue_date: string;
  /** Ticket face value amount (decimal string) */
  ticket_amount: string;
  /** Commission amount (decimal string) */
  commission_amount: string;
  /** Commission rate percentage */
  commission_rate?: number;
  /** Tax amount (decimal string) */
  tax_amount: string;
  /** Refund amount if applicable (decimal string) */
  refund_amount?: string;
  /** Transaction type: SALE, REFUND, ADM, ACM */
  transaction_type: 'SALE' | 'REFUND' | 'ADM' | 'ACM';
  /** Issue sequence number */
  issue_sequence?: string;
  /** Payment type */
  payment_type?: string;
  /** Currency code */
  currency: string;
  /** BSP billing period (e.g., "2026-P03") */
  billing_period?: string;
}

export interface AgencyRecord {
  /** 13-digit ticket number */
  ticket_number: string;
  /** Passenger name */
  passenger_name: string;
  /** Origin airport code */
  origin: string;
  /** Destination airport code */
  destination: string;
  /** 2-char airline code */
  airline_code: string;
  /** Issue date (ISO) */
  issue_date: string;
  /** Ticket face value amount (decimal string) */
  ticket_amount: string;
  /** Commission amount (decimal string) */
  commission_amount: string;
  /** Commission rate percentage */
  commission_rate?: number;
  /** Tax amount (decimal string) */
  tax_amount: string;
  /** Refund amount if applicable (decimal string) */
  refund_amount?: string;
  /** Transaction type */
  transaction_type: 'SALE' | 'REFUND' | 'ADM' | 'ACM';
  /** Currency code */
  currency: string;
}

export interface Discrepancy {
  /** Discrepancy type */
  type: DiscrepancyType;
  /** Severity */
  severity: DiscrepancySeverity;
  /** Ticket number (if applicable) */
  ticket_number?: string;
  /** Airline code */
  airline_code?: string;
  /** Agency amount (decimal string) */
  agency_amount?: string;
  /** BSP/HOT amount (decimal string) */
  bsp_amount?: string;
  /** Difference (decimal string) */
  difference?: string;
  /** Currency */
  currency?: string;
  /** Human-readable description */
  description: string;
}

export interface PatternDetection {
  /** Pattern name */
  pattern: string;
  /** Number of occurrences */
  count: number;
  /** Total amount affected (decimal string) */
  total_amount: string;
  /** Currency */
  currency: string;
  /** Description */
  description: string;
}

export interface ReconciliationSummary {
  /** Total agency records */
  total_agency_records: number;
  /** Total HOT records */
  total_hot_records: number;
  /** Matched records */
  matched_count: number;
  /** Total discrepancies */
  discrepancy_count: number;
  /** Critical discrepancies */
  critical_count: number;
  /** Total discrepancy amount (decimal string) */
  total_discrepancy_amount: string;
  /** Currency */
  currency: string;
  /** Patterns detected */
  patterns: PatternDetection[];
}

export interface BSPReconciliationInput {
  /** Agency booking records */
  agency_records: AgencyRecord[];
  /** Parsed HOT file records */
  hot_records: HOTFileRecord[];
  /** Billing period (e.g., "2026-P03") */
  billing_period: string;
  /** Remittance deadline (ISO date) */
  remittance_deadline?: string;
  /** Minimum discrepancy threshold (decimal string, default "10.00") */
  min_threshold?: string;
  /** Threshold currency (default "USD") */
  threshold_currency?: string;
  /** Current date/time (ISO) */
  current_datetime?: string;
}

export interface BSPReconciliationOutput {
  /** All discrepancies found */
  discrepancies: Discrepancy[];
  /** Reconciliation summary */
  summary: ReconciliationSummary;
  /** Whether reconciliation passed (no critical discrepancies) */
  passed: boolean;
}
