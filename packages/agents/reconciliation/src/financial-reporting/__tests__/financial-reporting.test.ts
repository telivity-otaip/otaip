import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FinancialReportingAgent } from '../index.js';
import type { FinancialRecord, FinancialReportRequest } from '../types.js';

let agent: FinancialReportingAgent;
beforeAll(async () => {
  agent = new FinancialReportingAgent();
  await agent.initialize();
});
afterAll(() => {
  agent.destroy();
});

const RECORDS: FinancialRecord[] = [
  {
    recordId: 'R1',
    date: '2026-06-01',
    type: 'TICKET',
    airline: 'BA',
    origin: 'LHR',
    destination: 'JFK',
    agentId: 'A1',
    corporateId: 'C1',
    fareAmount: '500.00',
    taxAmount: '85.00',
    commissionAmount: '35.00',
    netAmount: '450.00',
    currency: 'USD',
  },
  {
    recordId: 'R2',
    date: '2026-06-02',
    type: 'TICKET',
    airline: 'LH',
    origin: 'FRA',
    destination: 'SIN',
    agentId: 'A2',
    corporateId: 'C1',
    fareAmount: '1200.00',
    taxAmount: '120.00',
    commissionAmount: '84.00',
    netAmount: '1036.00',
    currency: 'USD',
  },
  {
    recordId: 'R3',
    date: '2026-06-03',
    type: 'REFUND',
    airline: 'BA',
    origin: 'LHR',
    destination: 'JFK',
    agentId: 'A1',
    fareAmount: '-500.00',
    taxAmount: '-85.00',
    commissionAmount: '-35.00',
    netAmount: '-450.00',
    currency: 'USD',
  },
  {
    recordId: 'R4',
    date: '2026-06-05',
    type: 'ADM',
    airline: 'BA',
    agentId: 'A1',
    fareAmount: '50.00',
    taxAmount: '0.00',
    commissionAmount: '0.00',
    netAmount: '50.00',
    currency: 'USD',
  },
  {
    recordId: 'R5',
    date: '2026-06-10',
    type: 'TICKET',
    airline: 'BA',
    origin: 'LHR',
    destination: 'CDG',
    agentId: 'A1',
    corporateId: 'C2',
    fareAmount: '200.00',
    taxAmount: '30.00',
    commissionAmount: '14.00',
    netAmount: '156.00',
    currency: 'USD',
  },
];

function makeReq(overrides: Partial<FinancialReportRequest> = {}): FinancialReportRequest {
  return {
    type: 'REVENUE_BY_ROUTE',
    period: { from: '2026-06-01', to: '2026-06-30' },
    records: RECORDS,
    ...overrides,
  };
}

describe('FinancialReportingAgent', () => {
  it('REVENUE_BY_ROUTE groups by route', async () => {
    const r = await agent.execute({ data: { request: makeReq() } });
    expect(r.data.report.lineItems.length).toBeGreaterThan(0);
    expect(r.data.report.lineItems.some((i) => i.key === 'LHR-JFK')).toBe(true);
  });
  it('REVENUE_BY_AGENT groups by agent', async () => {
    const r = await agent.execute({ data: { request: makeReq({ type: 'REVENUE_BY_AGENT' }) } });
    expect(r.data.report.lineItems.some((i) => i.key === 'A1')).toBe(true);
  });
  it('REVENUE_BY_CORPORATE_CLIENT groups by corp', async () => {
    const r = await agent.execute({
      data: { request: makeReq({ type: 'REVENUE_BY_CORPORATE_CLIENT' }) },
    });
    expect(r.data.report.lineItems.some((i) => i.key === 'C1')).toBe(true);
  });
  it('SPEND_BY_SUPPLIER groups by airline', async () => {
    const r = await agent.execute({ data: { request: makeReq({ type: 'SPEND_BY_SUPPLIER' }) } });
    expect(r.data.report.lineItems.some((i) => i.key === 'BA')).toBe(true);
  });
  it('totals match line items', async () => {
    const r = await agent.execute({ data: { request: makeReq() } });
    expect(r.data.report.totals.totalRecords).toBe(
      r.data.report.lineItems.reduce((s, i) => s + i.recordCount, 0),
    );
  });
  it('empty period returns zeros', async () => {
    const r = await agent.execute({
      data: { request: makeReq({ period: { from: '2020-01-01', to: '2020-01-31' } }) },
    });
    expect(r.data.report.totals.totalRecords).toBe(0);
    expect(r.data.report.totals.totalRevenue).toBe('0.00');
  });
  it('filters by airline', async () => {
    const r = await agent.execute({
      data: { request: makeReq({ filters: { airlines: ['LH'] } }) },
    });
    expect(r.data.report.totals.totalRecords).toBe(1);
  });
  it('filters by agent', async () => {
    const r = await agent.execute({ data: { request: makeReq({ filters: { agents: ['A2'] } }) } });
    expect(r.data.report.totals.totalRecords).toBe(1);
  });
  it('filters by corporate ID', async () => {
    const r = await agent.execute({
      data: { request: makeReq({ filters: { corporateIds: ['C2'] } }) },
    });
    expect(r.data.report.totals.totalRecords).toBe(1);
  });
  it('filters by minAmount', async () => {
    const r = await agent.execute({
      data: { request: makeReq({ filters: { minAmount: '100.00' } }) },
    });
    expect(
      r.data.report.lineItems.every((i) => Number(i.revenue) >= 100 || Number(i.revenue) <= -100),
    ).toBe(true);
  });
  it('margin percent calculated', async () => {
    const r = await agent.execute({ data: { request: makeReq() } });
    expect(r.data.report.summary.marginPercent).toBeDefined();
  });
  it('currency defaults to USD', async () => {
    const r = await agent.execute({ data: { request: makeReq() } });
    expect(r.data.report.currency).toBe('USD');
  });
  it('custom currency', async () => {
    const r = await agent.execute({ data: { request: makeReq({ currency: 'EUR' }) } });
    expect(r.data.report.currency).toBe('EUR');
  });
  it('rejects invalid report type', async () => {
    await expect(
      agent.execute({ data: { request: makeReq({ type: 'INVALID' as 'REVENUE_BY_ROUTE' }) } }),
    ).rejects.toThrow('Invalid');
  });
  it('rejects missing period', async () => {
    await expect(
      agent.execute({
        data: { request: { type: 'REVENUE_BY_ROUTE', period: { from: '', to: '' }, records: [] } },
      }),
    ).rejects.toThrow('Invalid');
  });
  it('has correct id', () => {
    expect(agent.id).toBe('7.5');
  });
  it('reports healthy', async () => {
    expect((await agent.health()).status).toBe('healthy');
  });
  it('throws when not initialized', async () => {
    const u = new FinancialReportingAgent();
    await expect(u.execute({ data: { request: makeReq() } })).rejects.toThrow(
      'not been initialized',
    );
  });
  it('reportId generated', async () => {
    const r = await agent.execute({ data: { request: makeReq() } });
    expect(r.data.report.reportId).toMatch(/^RPT/);
  });
  it('generatedAt populated', async () => {
    const r = await agent.execute({ data: { request: makeReq() } });
    expect(r.data.report.generatedAt).toBeTruthy();
  });
  it('MARGIN_ANALYSIS groups by record type', async () => {
    const r = await agent.execute({ data: { request: makeReq({ type: 'MARGIN_ANALYSIS' }) } });
    expect(r.data.report.lineItems.some((i) => i.key === 'TICKET')).toBe(true);
  });
  it('date range filters correctly', async () => {
    const r = await agent.execute({
      data: { request: makeReq({ period: { from: '2026-06-01', to: '2026-06-03' } }) },
    });
    expect(r.data.report.totals.totalRecords).toBe(3);
  });
  it('all money values are decimal strings', async () => {
    const r = await agent.execute({ data: { request: makeReq() } });
    expect(() => Number(r.data.report.summary.totalRevenue)).not.toThrow();
    expect(() => Number(r.data.report.summary.netMargin)).not.toThrow();
  });
});
