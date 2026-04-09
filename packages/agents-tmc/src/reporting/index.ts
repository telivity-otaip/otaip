/**
 * Reporting & Analytics — Agent 8.4
 *
 * Aggregates transaction data into reports. All math uses decimal.js.
 */

import Decimal from 'decimal.js';
import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  ReportingInput,
  ReportingOutput,
  Transaction,
  ReportRow,
  ReportSummary,
} from './types.js';

const VALID_REPORTS = new Set([
  'booking_volume',
  'revenue_summary',
  'top_routes',
  'agent_productivity',
  'policy_compliance',
  'spend_by_traveler',
  'spend_by_department',
  'spend_by_supplier',
  'unused_tickets',
]);

function filterTransactions(txns: Transaction[], input: ReportingInput): Transaction[] {
  return txns.filter((t) => {
    if (t.issue_date < input.date_from || t.issue_date > input.date_to) return false;
    const f = input.filters;
    if (!f) return true;
    if (f.corporate_id && t.corporate_id !== f.corporate_id) return false;
    if (f.agent_id && t.agent_id !== f.agent_id) return false;
    if (f.airline && t.airline !== f.airline) return false;
    if (f.department && t.department !== f.department) return false;
    return true;
  });
}

function sumAmount(txns: Transaction[]): string {
  return txns.reduce((sum, t) => sum.plus(new Decimal(t.total_amount)), new Decimal(0)).toFixed(2);
}

function generateReport(
  input: ReportingInput,
  filtered: Transaction[],
): { summary: ReportSummary; rows: ReportRow[] } {
  switch (input.report_type) {
    case 'booking_volume': {
      const sales = filtered.filter((t) => t.transaction_type === 'SALE');
      const refunds = filtered.filter((t) => t.transaction_type === 'REFUND');
      const exchanges = filtered.filter((t) => t.transaction_type === 'EXCHANGE');
      return {
        summary: {
          total_bookings: sales.length,
          refunds: refunds.length,
          exchanges: exchanges.length,
          net_bookings: sales.length - refunds.length,
        },
        rows: sales.map((t) => ({
          ticket_number: t.ticket_number,
          passenger: t.passenger_name,
          airline: t.airline,
          route: `${t.origin}-${t.destination}`,
          date: t.issue_date,
        })),
      };
    }

    case 'revenue_summary': {
      const sales = filtered.filter((t) => t.transaction_type === 'SALE');
      const refunds = filtered.filter((t) => t.transaction_type === 'REFUND');
      const totalSales = sumAmount(sales);
      const totalRefunds = sumAmount(refunds);
      const net = new Decimal(totalSales).minus(new Decimal(totalRefunds)).toFixed(2);
      return {
        summary: {
          total_sales: totalSales,
          total_refunds: totalRefunds,
          net_revenue: net,
          transaction_count: filtered.length,
          currency: input.filters?.currency ?? 'USD',
        },
        rows: [],
      };
    }

    case 'top_routes': {
      const routeMap = new Map<string, { count: number; total: Decimal }>();
      for (const t of filtered) {
        if (t.transaction_type !== 'SALE') continue;
        const route = `${t.origin}-${t.destination}`;
        const existing = routeMap.get(route) ?? { count: 0, total: new Decimal(0) };
        existing.count++;
        existing.total = existing.total.plus(new Decimal(t.total_amount));
        routeMap.set(route, existing);
      }
      const rows: ReportRow[] = [...routeMap.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([route, data]) => ({
          route,
          booking_count: data.count,
          total_spend: data.total.toFixed(2),
        }));
      return { summary: { total_routes: routeMap.size }, rows };
    }

    case 'agent_productivity': {
      const agentMap = new Map<string, number>();
      for (const t of filtered) {
        if (t.agent_id) agentMap.set(t.agent_id, (agentMap.get(t.agent_id) ?? 0) + 1);
      }
      const rows: ReportRow[] = [...agentMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([agent, count]) => ({ agent_id: agent, bookings: count }));
      return { summary: { total_agents: agentMap.size, total_bookings: filtered.length }, rows };
    }

    case 'policy_compliance': {
      const inPolicy = filtered.filter((t) => t.in_policy).length;
      const outPolicy = filtered.filter((t) => !t.in_policy).length;
      const rate = filtered.length > 0 ? Math.round((inPolicy / filtered.length) * 100) : 0;
      return {
        summary: {
          in_policy: inPolicy,
          out_of_policy: outPolicy,
          compliance_rate_percent: rate,
          total: filtered.length,
        },
        rows: filtered
          .filter((t) => !t.in_policy)
          .map((t) => ({
            ticket_number: t.ticket_number,
            passenger: t.passenger_name,
            amount: t.total_amount,
          })),
      };
    }

    case 'spend_by_traveler': {
      const travMap = new Map<string, { name: string; total: Decimal; count: number }>();
      for (const t of filtered) {
        if (t.transaction_type !== 'SALE') continue;
        const key = t.traveler_id ?? t.passenger_name;
        const existing = travMap.get(key) ?? {
          name: t.passenger_name,
          total: new Decimal(0),
          count: 0,
        };
        existing.total = existing.total.plus(new Decimal(t.total_amount));
        existing.count++;
        travMap.set(key, existing);
      }
      const rows: ReportRow[] = [...travMap.entries()]
        .sort((a, b) => b[1].total.comparedTo(a[1].total))
        .map(([id, data]) => ({
          traveler: id,
          name: data.name,
          total_spend: data.total.toFixed(2),
          bookings: data.count,
        }));
      return {
        summary: {
          total_travelers: travMap.size,
          total_spend: sumAmount(filtered.filter((t) => t.transaction_type === 'SALE')),
        },
        rows,
      };
    }

    case 'spend_by_department': {
      const deptMap = new Map<string, Decimal>();
      for (const t of filtered) {
        if (t.transaction_type !== 'SALE' || !t.department) continue;
        deptMap.set(
          t.department,
          (deptMap.get(t.department) ?? new Decimal(0)).plus(new Decimal(t.total_amount)),
        );
      }
      const rows: ReportRow[] = [...deptMap.entries()]
        .sort((a, b) => b[1].comparedTo(a[1]))
        .map(([dept, total]) => ({ department: dept, total_spend: total.toFixed(2) }));
      return { summary: { total_departments: deptMap.size }, rows };
    }

    case 'spend_by_supplier': {
      const airlineMap = new Map<string, Decimal>();
      for (const t of filtered) {
        if (t.transaction_type !== 'SALE') continue;
        airlineMap.set(
          t.airline,
          (airlineMap.get(t.airline) ?? new Decimal(0)).plus(new Decimal(t.total_amount)),
        );
      }
      const rows: ReportRow[] = [...airlineMap.entries()]
        .sort((a, b) => b[1].comparedTo(a[1]))
        .map(([airline, total]) => ({ airline, total_spend: total.toFixed(2) }));
      return { summary: { total_suppliers: airlineMap.size }, rows };
    }

    case 'unused_tickets': {
      const unused = filtered.filter((t) => t.transaction_type === 'SALE' && !t.ticket_used);
      return {
        summary: { unused_count: unused.length, unused_value: sumAmount(unused) },
        rows: unused.map((t) => ({
          ticket_number: t.ticket_number,
          passenger: t.passenger_name,
          amount: t.total_amount,
          departure: t.departure_date,
        })),
      };
    }
  }
}

export class ReportingAgent implements Agent<ReportingInput, ReportingOutput> {
  readonly id = '8.4';
  readonly name = 'Reporting & Analytics';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(input: AgentInput<ReportingInput>): Promise<AgentOutput<ReportingOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const d = input.data;
    if (!d.report_type || !VALID_REPORTS.has(d.report_type)) {
      throw new AgentInputValidationError(this.id, 'report_type', 'Invalid report type.');
    }
    if (!d.date_from || !d.date_to) {
      throw new AgentInputValidationError(this.id, 'date_from/date_to', 'Date range required.');
    }

    const filtered = filterTransactions(d.transactions ?? [], d);
    const { summary, rows } = generateReport(d, filtered);

    return {
      data: {
        report_type: d.report_type,
        period: { from: d.date_from, to: d.date_to },
        generated_at: new Date().toISOString(),
        summary,
        rows,
      },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        records_processed: filtered.length,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
  }
}

export type {
  ReportingInput,
  ReportingOutput,
  Transaction,
  ReportType,
  ReportRow,
  ReportSummary,
  ReportFilters,
} from './types.js';
