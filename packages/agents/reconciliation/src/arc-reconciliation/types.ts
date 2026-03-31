/**
 * ARC Reconciliation — Types
 *
 * Agent 7.2: Processes ARC IAR weekly billing, validates commission
 * rates against airline contracts, flags pricing/commission errors,
 * manages ADM/ACM disputes within the 15-day window.
 */

export type IARFormat = 'EDI_X12' | 'CSV' | 'XML';

export type ARCDiscrepancyType =
  | 'MISSING_IN_IAR'
  | 'MISSING_IN_AGENCY'
  | 'DUPLICATE_TRANSACTION'
  | 'COMMISSION_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'UNMATCHED_ADM'
  | 'UNMATCHED_ACM'
  | 'ADM_DISPUTE_WINDOW_EXPIRING';

export type ARCDiscrepancySeverity = 'critical' | 'high' | 'medium' | 'low';

export interface IARRecord {
  /** 13-digit ticket/document number */
  document_number: string;
  /** Passenger name */
  passenger_name: string;
  /** Origin airport */
  origin: string;
  /** Destination airport */
  destination: string;
  /** 2-char airline code */
  airline_code: string;
  /** Issue date (ISO) */
  issue_date: string;
  /** Base fare amount (decimal string) */
  base_fare: string;
  /** Total tax (decimal string) */
  tax_amount: string;
  /** Total amount (decimal string) */
  total_amount: string;
  /** Commission amount (decimal string) */
  commission_amount: string;
  /** Commission rate percentage */
  commission_rate?: number;
  /** Transaction type */
  transaction_type: 'SALE' | 'REFUND' | 'ADM' | 'ACM';
  /** ADM/ACM issue date (ISO — for dispute window calc) */
  adm_issue_date?: string;
  /** Net remittance amount (decimal string) */
  net_remittance?: string;
  /** Currency */
  currency: string;
  /** Settlement week (e.g., "2026-W13") */
  settlement_week?: string;
}

export interface ARCAgencyRecord {
  /** 13-digit ticket number */
  ticket_number: string;
  /** Passenger name */
  passenger_name: string;
  /** Origin */
  origin: string;
  /** Destination */
  destination: string;
  /** Airline code */
  airline_code: string;
  /** Issue date */
  issue_date: string;
  /** Base fare (decimal string) */
  base_fare: string;
  /** Tax (decimal string) */
  tax_amount: string;
  /** Total (decimal string) */
  total_amount: string;
  /** Commission (decimal string) */
  commission_amount: string;
  /** Commission rate % */
  commission_rate?: number;
  /** Transaction type */
  transaction_type: 'SALE' | 'REFUND' | 'ADM' | 'ACM';
  /** Currency */
  currency: string;
}

export interface AirlineContract {
  /** Airline code */
  airline_code: string;
  /** Contracted commission rate % */
  contracted_rate: number;
  /** Effective from (ISO date) */
  effective_from: string;
  /** Effective to (ISO date, optional) */
  effective_to?: string;
}

export interface ARCDiscrepancy {
  type: ARCDiscrepancyType;
  severity: ARCDiscrepancySeverity;
  document_number?: string;
  airline_code?: string;
  agency_amount?: string;
  iar_amount?: string;
  difference?: string;
  currency?: string;
  /** Days remaining in ADM dispute window (if applicable) */
  dispute_days_remaining?: number;
  description: string;
}

export interface ARCPatternDetection {
  pattern: string;
  count: number;
  total_amount: string;
  currency: string;
  description: string;
}

export interface ARCReconciliationSummary {
  total_agency_records: number;
  total_iar_records: number;
  matched_count: number;
  discrepancy_count: number;
  critical_count: number;
  total_discrepancy_amount: string;
  net_remittance: string;
  currency: string;
  adm_count: number;
  acm_count: number;
  adm_dispute_expiring_count: number;
  patterns: ARCPatternDetection[];
}

export interface ARCReconciliationInput {
  /** Agency records */
  agency_records: ARCAgencyRecord[];
  /** Parsed IAR records */
  iar_records: IARRecord[];
  /** Settlement week (e.g., "2026-W13") */
  settlement_week: string;
  /** Airline contracts for commission validation */
  contracts?: AirlineContract[];
  /** Minimum discrepancy threshold (decimal string, default "10.00") */
  min_threshold?: string;
  /** Threshold currency (default "USD") */
  threshold_currency?: string;
  /** ADM dispute window in days (default 15) */
  adm_dispute_window_days?: number;
  /** Current date/time (ISO) */
  current_datetime?: string;
}

export interface ARCReconciliationOutput {
  discrepancies: ARCDiscrepancy[];
  summary: ARCReconciliationSummary;
  passed: boolean;
}
