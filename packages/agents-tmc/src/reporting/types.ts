/**
 * Reporting & Analytics — Types
 *
 * Agent 8.4: Transaction aggregation and report generation.
 */

export type ReportType =
  | 'booking_volume'
  | 'revenue_summary'
  | 'top_routes'
  | 'agent_productivity'
  | 'policy_compliance'
  | 'spend_by_traveler'
  | 'spend_by_department'
  | 'spend_by_supplier'
  | 'unused_tickets';

export interface Transaction {
  transaction_id: string;
  ticket_number: string;
  passenger_name: string;
  traveler_id?: string;
  origin: string;
  destination: string;
  airline: string;
  issue_date: string;
  departure_date: string;
  base_fare: string;
  tax: string;
  total_amount: string;
  currency: string;
  agent_id?: string;
  corporate_id?: string;
  department?: string;
  in_policy: boolean;
  transaction_type: 'SALE' | 'REFUND' | 'EXCHANGE';
  ticket_used: boolean;
}

export interface ReportFilters {
  corporate_id?: string;
  agent_id?: string;
  airline?: string;
  department?: string;
  currency?: string;
}

export interface ReportRow {
  [key: string]: string | number | boolean;
}

export interface ReportSummary {
  [key: string]: string | number;
}

export interface ReportingInput {
  report_type: ReportType;
  date_from: string;
  date_to: string;
  filters?: ReportFilters;
  group_by?: string[];
  transactions: Transaction[];
}

export interface ReportingOutput {
  report_type: ReportType;
  period: { from: string; to: string };
  generated_at: string;
  summary: ReportSummary;
  rows: ReportRow[];
}
