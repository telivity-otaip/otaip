import Decimal from 'decimal.js';
import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  FinancialReportingInput,
  FinancialReportingOutput,
  FinancialRecord,
  FinancialReport,
  ReportLineItem,
  ReportTotals,
} from './types.js';

const VALID_TYPES = new Set([
  'REVENUE_BY_ROUTE',
  'REVENUE_BY_AGENT',
  'REVENUE_BY_CORPORATE_CLIENT',
  'MARGIN_ANALYSIS',
  'COST_TRACKING',
  'COMMISSION_SUMMARY',
  'SPEND_BY_SUPPLIER',
  'UNUSED_TICKETS_VALUE',
  'SETTLEMENT_SUMMARY',
]);
let rptId = 0;

function groupRecords(
  records: FinancialRecord[],
  keyFn: (r: FinancialRecord) => string,
): Map<string, FinancialRecord[]> {
  const m = new Map<string, FinancialRecord[]>();
  for (const r of records) {
    const k = keyFn(r);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

function buildLineItems(grouped: Map<string, FinancialRecord[]>): ReportLineItem[] {
  const items: ReportLineItem[] = [];
  for (const [key, recs] of grouped) {
    let revenue = new Decimal(0),
      cost = new Decimal(0),
      commission = new Decimal(0),
      net = new Decimal(0);
    for (const r of recs) {
      revenue = revenue.plus(new Decimal(r.fareAmount));
      cost = cost.plus(new Decimal(r.taxAmount));
      commission = commission.plus(new Decimal(r.commissionAmount));
      net = net.plus(new Decimal(r.netAmount));
    }
    items.push({
      key,
      label: key,
      revenue: revenue.toFixed(2),
      cost: cost.toFixed(2),
      commission: commission.toFixed(2),
      net: net.toFixed(2),
      recordCount: recs.length,
    });
  }
  return items;
}

function sumTotals(items: ReportLineItem[]): ReportTotals {
  let rev = new Decimal(0),
    cost = new Decimal(0),
    comm = new Decimal(0),
    net = new Decimal(0),
    count = 0;
  for (const i of items) {
    rev = rev.plus(i.revenue);
    cost = cost.plus(i.cost);
    comm = comm.plus(i.commission);
    net = net.plus(i.net);
    count += i.recordCount;
  }
  return {
    totalRevenue: rev.toFixed(2),
    totalCost: cost.toFixed(2),
    totalCommission: comm.toFixed(2),
    totalNet: net.toFixed(2),
    totalRecords: count,
  };
}

export class FinancialReportingAgent implements Agent<
  FinancialReportingInput,
  FinancialReportingOutput
> {
  readonly id = '7.5';
  readonly name = 'Financial Reporting';
  readonly version = '0.1.0';
  private initialized = false;
  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<FinancialReportingInput>,
  ): Promise<AgentOutput<FinancialReportingOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);
    const req = input.data.request;
    if (!req.type || !VALID_TYPES.has(req.type))
      throw new AgentInputValidationError(this.id, 'type', 'Invalid report type.');
    if (!req.period?.from || !req.period?.to)
      throw new AgentInputValidationError(this.id, 'period', 'Required.');

    let records = (req.records ?? []).filter(
      (r) => r.date >= req.period.from && r.date <= req.period.to,
    );
    if (req.filters) {
      const f = req.filters;
      if (f.airlines) records = records.filter((r) => r.airline && f.airlines!.includes(r.airline));
      if (f.agents) records = records.filter((r) => r.agentId && f.agents!.includes(r.agentId));
      if (f.corporateIds)
        records = records.filter((r) => r.corporateId && f.corporateIds!.includes(r.corporateId));
      if (f.minAmount) {
        const min = new Decimal(f.minAmount);
        records = records.filter((r) => new Decimal(r.fareAmount).greaterThanOrEqualTo(min));
      }
    }

    const keyFn = this.getGroupKeyFn(req.type);
    const grouped = groupRecords(records, keyFn);
    const lineItems = buildLineItems(grouped);
    const totals = sumTotals(lineItems);
    const marginPct = new Decimal(totals.totalRevenue).isZero()
      ? new Decimal(0)
      : new Decimal(totals.totalNet).dividedBy(new Decimal(totals.totalRevenue)).times(100);

    const report: FinancialReport = {
      reportId: `RPT${String(++rptId).padStart(8, '0')}`,
      type: req.type,
      period: req.period,
      generatedAt: new Date().toISOString(),
      summary: {
        totalRecords: totals.totalRecords,
        totalRevenue: totals.totalRevenue,
        totalCost: totals.totalCost,
        totalCommission: totals.totalCommission,
        netMargin: totals.totalNet,
        marginPercent: marginPct.toFixed(2),
      },
      lineItems,
      totals,
      currency: req.currency ?? 'USD',
    };
    return { data: { report }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private getGroupKeyFn(type: string): (r: FinancialRecord) => string {
    switch (type) {
      case 'REVENUE_BY_ROUTE':
        return (r) => `${r.origin ?? '?'}-${r.destination ?? '?'}`;
      case 'REVENUE_BY_AGENT':
        return (r) => r.agentId ?? 'UNKNOWN';
      case 'REVENUE_BY_CORPORATE_CLIENT':
        return (r) => r.corporateId ?? 'NONE';
      case 'SPEND_BY_SUPPLIER':
        return (r) => r.airline ?? 'UNKNOWN';
      case 'COMMISSION_SUMMARY':
        return (r) => r.airline ?? 'UNKNOWN';
      default:
        return (r) => r.type;
    }
  }

  async health(): Promise<AgentHealthStatus> {
    return this.initialized
      ? { status: 'healthy' }
      : { status: 'unhealthy', details: 'Not initialized.' };
  }
  destroy(): void {
    this.initialized = false;
  }
}

export type {
  FinancialReportingInput,
  FinancialReportingOutput,
  FinancialReport,
  FinancialRecord,
  ReportLineItem,
  ReportTotals,
  FinReportType,
  RecordType,
  FinancialReportRequest,
} from './types.js';
