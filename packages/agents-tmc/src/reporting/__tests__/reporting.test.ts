/**
 * Reporting & Analytics — Unit Tests (Agent 8.4)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ReportingAgent } from '../index.js';
import type { ReportingInput, Transaction } from '../types.js';

let agent: ReportingAgent;

beforeAll(async () => {
  agent = new ReportingAgent();
  await agent.initialize();
});

afterAll(() => { agent.destroy(); });

const FIXTURES: Transaction[] = [
  { transaction_id: 'T001', ticket_number: '1251234567890', passenger_name: 'SMITH/JOHN', traveler_id: 'TVL001', origin: 'LHR', destination: 'JFK', airline: 'BA', issue_date: '2026-03-15', departure_date: '2026-06-15', base_fare: '450.00', tax: '120.00', total_amount: '570.00', currency: 'USD', agent_id: 'AGT01', corporate_id: 'CORP001', department: 'Engineering', in_policy: true, transaction_type: 'SALE', ticket_used: true },
  { transaction_id: 'T002', ticket_number: '1251234567891', passenger_name: 'JONES/MARY', traveler_id: 'TVL002', origin: 'CDG', destination: 'LAX', airline: 'AF', issue_date: '2026-03-16', departure_date: '2026-06-20', base_fare: '680.00', tax: '95.00', total_amount: '775.00', currency: 'USD', agent_id: 'AGT02', corporate_id: 'CORP001', department: 'Sales', in_policy: true, transaction_type: 'SALE', ticket_used: true },
  { transaction_id: 'T003', ticket_number: '1251234567892', passenger_name: 'DOE/JANE', traveler_id: 'TVL003', origin: 'JFK', destination: 'LHR', airline: 'BA', issue_date: '2026-03-17', departure_date: '2026-07-01', base_fare: '0.00', tax: '0.00', total_amount: '450.00', currency: 'USD', agent_id: 'AGT01', corporate_id: 'CORP001', department: 'Engineering', in_policy: true, transaction_type: 'REFUND', ticket_used: false },
  { transaction_id: 'T004', ticket_number: '1251234567893', passenger_name: 'BROWN/BOB', traveler_id: 'TVL004', origin: 'SIN', destination: 'HKG', airline: 'SQ', issue_date: '2026-03-18', departure_date: '2026-05-01', base_fare: '275.00', tax: '45.00', total_amount: '320.00', currency: 'USD', agent_id: 'AGT01', corporate_id: 'CORP002', department: 'HR', in_policy: false, transaction_type: 'SALE', ticket_used: false },
  { transaction_id: 'T005', ticket_number: '1251234567894', passenger_name: 'TAYLOR/ANN', traveler_id: 'TVL005', origin: 'LHR', destination: 'SIN', airline: 'SQ', issue_date: '2026-03-19', departure_date: '2026-06-10', base_fare: '1050.00', tax: '150.00', total_amount: '1200.00', currency: 'USD', agent_id: 'AGT02', department: 'Marketing', in_policy: true, transaction_type: 'SALE', ticket_used: true },
];

function makeInput(overrides: Partial<ReportingInput> = {}): ReportingInput {
  return {
    report_type: 'booking_volume',
    date_from: '2026-03-01',
    date_to: '2026-03-31',
    transactions: FIXTURES,
    ...overrides,
  };
}

describe('Reporting & Analytics', () => {
  describe('booking_volume', () => {
    it('counts sales and refunds', async () => {
      const res = await agent.execute({ data: makeInput() });
      expect(res.data.summary['total_bookings']).toBe(4);
      expect(res.data.summary['refunds']).toBe(1);
    });
  });

  describe('revenue_summary', () => {
    it('calculates net revenue', async () => {
      const res = await agent.execute({ data: makeInput({ report_type: 'revenue_summary' }) });
      expect(Number(res.data.summary['total_sales'])).toBeGreaterThan(0);
      expect(Number(res.data.summary['net_revenue'])).toBeGreaterThan(0);
    });
  });

  describe('top_routes', () => {
    it('ranks routes by booking count', async () => {
      const res = await agent.execute({ data: makeInput({ report_type: 'top_routes' }) });
      expect(res.data.rows.length).toBeGreaterThan(0);
      expect(res.data.rows[0]).toHaveProperty('route');
    });
  });

  describe('agent_productivity', () => {
    it('counts bookings per agent', async () => {
      const res = await agent.execute({ data: makeInput({ report_type: 'agent_productivity' }) });
      expect(res.data.rows.length).toBeGreaterThan(0);
      expect(Number(res.data.summary['total_agents'])).toBeGreaterThan(0);
    });
  });

  describe('policy_compliance', () => {
    it('calculates compliance rate', async () => {
      const res = await agent.execute({ data: makeInput({ report_type: 'policy_compliance' }) });
      expect(Number(res.data.summary['compliance_rate_percent'])).toBeGreaterThan(0);
      expect(Number(res.data.summary['out_of_policy'])).toBe(1);
    });
  });

  describe('spend_by_traveler', () => {
    it('aggregates spend per traveler', async () => {
      const res = await agent.execute({ data: makeInput({ report_type: 'spend_by_traveler' }) });
      expect(res.data.rows.length).toBeGreaterThan(0);
    });
  });

  describe('spend_by_department', () => {
    it('aggregates spend per department', async () => {
      const res = await agent.execute({ data: makeInput({ report_type: 'spend_by_department' }) });
      expect(res.data.rows.length).toBeGreaterThan(0);
    });
  });

  describe('spend_by_supplier', () => {
    it('aggregates spend per airline', async () => {
      const res = await agent.execute({ data: makeInput({ report_type: 'spend_by_supplier' }) });
      expect(res.data.rows.length).toBeGreaterThan(0);
    });
  });

  describe('unused_tickets', () => {
    it('finds unused tickets', async () => {
      const res = await agent.execute({ data: makeInput({ report_type: 'unused_tickets' }) });
      expect(Number(res.data.summary['unused_count'])).toBeGreaterThan(0);
    });
  });

  describe('Filters', () => {
    it('filters by corporate_id', async () => {
      const res = await agent.execute({ data: makeInput({ filters: { corporate_id: 'CORP002' } }) });
      expect(Number(res.data.summary['total_bookings'])).toBe(1);
    });

    it('filters by agent_id', async () => {
      const res = await agent.execute({ data: makeInput({ filters: { agent_id: 'AGT01' } }) });
      expect(Number(res.data.summary['total_bookings'])).toBeLessThan(4);
    });

    it('filters by airline', async () => {
      const res = await agent.execute({ data: makeInput({ filters: { airline: 'BA' } }) });
      expect(Number(res.data.summary['total_bookings'])).toBeLessThan(4);
    });
  });

  describe('Empty period', () => {
    it('returns zeros for empty period', async () => {
      const res = await agent.execute({ data: makeInput({ date_from: '2020-01-01', date_to: '2020-01-31' }) });
      expect(res.data.rows).toHaveLength(0);
      expect(Number(res.data.summary['total_bookings'])).toBe(0);
    });
  });

  describe('Input validation', () => {
    it('rejects invalid report type', async () => {
      await expect(agent.execute({ data: makeInput({ report_type: 'INVALID' as 'booking_volume' }) })).rejects.toThrow('Invalid');
    });

    it('rejects missing date range', async () => {
      await expect(agent.execute({ data: { ...makeInput(), date_from: '', date_to: '' } })).rejects.toThrow('Invalid');
    });
  });

  describe('agent compliance', () => {
    it('has correct id/name', () => { expect(agent.id).toBe('8.4'); });
    it('reports healthy', async () => { expect((await agent.health()).status).toBe('healthy'); });
    it('throws when not initialized', async () => {
      const u = new ReportingAgent();
      await expect(u.execute({ data: makeInput() })).rejects.toThrow('not been initialized');
    });
  });
});
