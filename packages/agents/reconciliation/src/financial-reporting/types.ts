export type FinReportType =
  | 'REVENUE_BY_ROUTE'
  | 'REVENUE_BY_AGENT'
  | 'REVENUE_BY_CORPORATE_CLIENT'
  | 'MARGIN_ANALYSIS'
  | 'COST_TRACKING'
  | 'COMMISSION_SUMMARY'
  | 'SPEND_BY_SUPPLIER'
  | 'UNUSED_TICKETS_VALUE'
  | 'SETTLEMENT_SUMMARY';
export type RecordType = 'TICKET' | 'REFUND' | 'ADM' | 'ACM' | 'COMMISSION' | 'FEE';

export interface FinancialRecord {
  recordId: string;
  date: string;
  type: RecordType;
  airline?: string;
  origin?: string;
  destination?: string;
  agentId?: string;
  corporateId?: string;
  fareAmount: string;
  taxAmount: string;
  commissionAmount: string;
  netAmount: string;
  currency: string;
  passengerCount?: number;
  fareBasis?: string;
}

export interface ReportLineItem {
  key: string;
  label: string;
  revenue: string;
  cost: string;
  commission: string;
  net: string;
  recordCount: number;
}
export interface ReportTotals {
  totalRevenue: string;
  totalCost: string;
  totalCommission: string;
  totalNet: string;
  totalRecords: number;
}

export interface FinancialReportRequest {
  type: FinReportType;
  period: { from: string; to: string };
  filters?: {
    airlines?: string[];
    agents?: string[];
    corporateIds?: string[];
    currencies?: string[];
    minAmount?: string;
  };
  groupBy?: string[];
  records: FinancialRecord[];
  currency?: string;
}
export interface FinancialReport {
  reportId: string;
  type: FinReportType;
  period: { from: string; to: string };
  generatedAt: string;
  summary: {
    totalRecords: number;
    totalRevenue: string;
    totalCost: string;
    totalCommission: string;
    netMargin: string;
    marginPercent: string;
  };
  lineItems: ReportLineItem[];
  totals: ReportTotals;
  currency: string;
}
export interface FinancialReportingInput {
  request: FinancialReportRequest;
}
export interface FinancialReportingOutput {
  report: FinancialReport;
}
