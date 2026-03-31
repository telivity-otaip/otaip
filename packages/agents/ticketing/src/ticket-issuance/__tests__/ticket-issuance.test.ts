/**
 * Ticket Issuance — Unit Tests
 *
 * Agent 4.1: ETR generation, conjunction ticketing, BSP fields.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TicketIssuance } from '../index.js';
import type { TicketIssuanceInput } from '../types.js';

let agent: TicketIssuance;

beforeAll(async () => {
  agent = new TicketIssuance();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

function makeInput(overrides: Partial<TicketIssuanceInput> = {}): TicketIssuanceInput {
  return {
    record_locator: 'ABC123',
    issuing_carrier: 'BA',
    passenger_name: 'SMITH/JOHN',
    segments: [
      {
        carrier: 'BA', flight_number: '115', origin: 'LHR', destination: 'JFK',
        departure_date: '2026-06-15', departure_time: '09:00', booking_class: 'Y',
        fare_basis: 'YOWUS', baggage_allowance: '2PC',
      },
    ],
    base_fare: '450.00',
    base_fare_currency: 'GBP',
    taxes: [
      { code: 'GB', amount: '85.00', currency: 'GBP' },
      { code: 'US', amount: '20.00', currency: 'GBP' },
      { code: 'YQ', amount: '150.00', currency: 'GBP' },
    ],
    fare_calculation: 'LON BA NYC 450.00 NUC450.00 END ROE1.00',
    form_of_payment: { type: 'CREDIT_CARD', card_code: 'VI', card_last_four: '4242', amount: '705.00', currency: 'GBP' },
    issue_date: '2026-04-01',
    ...overrides,
  };
}

describe('Ticket Issuance', () => {
  describe('Basic issuance', () => {
    it('issues a single ticket for 1 segment', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.tickets).toHaveLength(1);
      expect(result.data.total_coupons).toBe(1);
      expect(result.data.is_conjunction).toBe(false);
    });

    it('generates 13-digit ticket number', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.tickets[0]!.ticket_number).toMatch(/^\d{13}$/);
    });

    it('uses correct airline prefix', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.tickets[0]!.ticket_number.startsWith('125')).toBe(true); // BA = 125
    });

    it('uses custom ticket number prefix', async () => {
      const result = await agent.execute({ data: makeInput({ ticket_number_prefix: '999' }) });
      expect(result.data.tickets[0]!.ticket_number.startsWith('999')).toBe(true);
    });

    it('sets all coupons to Open status', async () => {
      const result = await agent.execute({ data: makeInput() });
      for (const coupon of result.data.tickets[0]!.coupons) {
        expect(coupon.status).toBe('O');
      }
    });

    it('preserves passenger name', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.tickets[0]!.passenger_name).toBe('SMITH/JOHN');
    });

    it('preserves record locator', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.tickets[0]!.record_locator).toBe('ABC123');
    });

    it('sets issue date', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.tickets[0]!.issue_date).toBe('2026-04-01');
    });
  });

  describe('Financial calculations', () => {
    it('calculates total tax from breakdown', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.tickets[0]!.total_tax).toBe('255.00');
    });

    it('calculates total amount (base + tax)', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.tickets[0]!.total_amount).toBe('705.00');
    });

    it('preserves tax breakdown', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.tickets[0]!.taxes).toHaveLength(3);
      expect(result.data.tickets[0]!.taxes[0]!.code).toBe('GB');
    });

    it('stores commission data', async () => {
      const input = makeInput({
        commission: { type: 'PERCENTAGE', rate: '5.00', amount: '22.50', currency: 'GBP' },
      });
      const result = await agent.execute({ data: input });
      expect(result.data.tickets[0]!.commission).toBeDefined();
      expect(result.data.tickets[0]!.commission!.type).toBe('PERCENTAGE');
      expect(result.data.tickets[0]!.commission!.amount).toBe('22.50');
    });

    it('handles flat commission', async () => {
      const input = makeInput({
        commission: { type: 'FLAT', rate: '25.00', amount: '25.00', currency: 'GBP' },
      });
      const result = await agent.execute({ data: input });
      expect(result.data.tickets[0]!.commission!.type).toBe('FLAT');
    });

    it('uses equivalent fare for total when present', async () => {
      const input = makeInput({
        base_fare: '400.00',
        base_fare_currency: 'EUR',
        equivalent_fare: '450.00',
        equivalent_fare_currency: 'GBP',
      });
      const result = await agent.execute({ data: input });
      // Total = equivalent_fare + taxes = 450 + 255 = 705
      expect(result.data.tickets[0]!.total_amount).toBe('705.00');
    });
  });

  describe('Conjunction tickets', () => {
    it('generates conjunction for 5 segments', async () => {
      const segs = Array.from({ length: 5 }, (_, i) => ({
        carrier: 'BA', flight_number: String(100 + i), origin: 'LHR', destination: 'JFK',
        departure_date: '2026-06-15', booking_class: 'Y', fare_basis: 'YOWUS',
      }));
      const result = await agent.execute({ data: makeInput({ segments: segs }) });
      expect(result.data.tickets).toHaveLength(2);
      expect(result.data.is_conjunction).toBe(true);
      expect(result.data.total_coupons).toBe(5);
    });

    it('sets conjunction suffix /1 and /2', async () => {
      const segs = Array.from({ length: 5 }, (_, i) => ({
        carrier: 'BA', flight_number: String(100 + i), origin: 'LHR', destination: 'JFK',
        departure_date: '2026-06-15', booking_class: 'Y', fare_basis: 'YOWUS',
      }));
      const result = await agent.execute({ data: makeInput({ segments: segs }) });
      expect(result.data.tickets[0]!.conjunction_suffix).toBe('/1');
      expect(result.data.tickets[1]!.conjunction_suffix).toBe('/2');
    });

    it('first ticket has 4 coupons, second has 1', async () => {
      const segs = Array.from({ length: 5 }, (_, i) => ({
        carrier: 'BA', flight_number: String(100 + i), origin: 'LHR', destination: 'JFK',
        departure_date: '2026-06-15', booking_class: 'Y', fare_basis: 'YOWUS',
      }));
      const result = await agent.execute({ data: makeInput({ segments: segs }) });
      expect(result.data.tickets[0]!.coupons).toHaveLength(4);
      expect(result.data.tickets[1]!.coupons).toHaveLength(1);
    });

    it('generates 3 tickets for 9 segments', async () => {
      const segs = Array.from({ length: 9 }, (_, i) => ({
        carrier: 'LH', flight_number: String(400 + i), origin: 'FRA', destination: 'MUC',
        departure_date: '2026-06-15', booking_class: 'Y', fare_basis: 'YOWEU',
      }));
      const result = await agent.execute({ data: makeInput({ segments: segs, issuing_carrier: 'LH' }) });
      expect(result.data.tickets).toHaveLength(3);
      expect(result.data.tickets[2]!.conjunction_suffix).toBe('/3');
    });

    it('no conjunction suffix for 4 or fewer segments', async () => {
      const segs = Array.from({ length: 4 }, (_, i) => ({
        carrier: 'BA', flight_number: String(100 + i), origin: 'LHR', destination: 'JFK',
        departure_date: '2026-06-15', booking_class: 'Y', fare_basis: 'YOWUS',
      }));
      const result = await agent.execute({ data: makeInput({ segments: segs }) });
      expect(result.data.tickets).toHaveLength(1);
      expect(result.data.tickets[0]!.conjunction_suffix).toBeUndefined();
    });

    it('warns about conjunction tickets', async () => {
      const segs = Array.from({ length: 5 }, (_, i) => ({
        carrier: 'BA', flight_number: String(100 + i), origin: 'LHR', destination: 'JFK',
        departure_date: '2026-06-15', booking_class: 'Y', fare_basis: 'YOWUS',
      }));
      const result = await agent.execute({ data: makeInput({ segments: segs }) });
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('Conjunction');
    });
  });

  describe('BSP reporting', () => {
    it('stores BSP fields', async () => {
      const input = makeInput({
        bsp_reporting: {
          settlement_code: 'AUTH123',
          remittance_currency: 'GBP',
          billing_period: '2026/04/P1',
          reporting_office_id: '12345678',
        },
      });
      const result = await agent.execute({ data: input });
      expect(result.data.tickets[0]!.bsp_reporting).toBeDefined();
      expect(result.data.tickets[0]!.bsp_reporting!.remittance_currency).toBe('GBP');
    });

    it('stores endorsements', async () => {
      const input = makeInput({ endorsements: 'NON-REF/NO CHANGES' });
      const result = await agent.execute({ data: input });
      expect(result.data.tickets[0]!.endorsements).toBe('NON-REF/NO CHANGES');
    });

    it('stores original issue for reissue', async () => {
      const input = makeInput({ original_issue: '1251234567890' });
      const result = await agent.execute({ data: input });
      expect(result.data.tickets[0]!.original_issue).toBe('1251234567890');
    });
  });

  describe('Coupon details', () => {
    it('sets coupon number sequentially', async () => {
      const segs = Array.from({ length: 3 }, (_, i) => ({
        carrier: 'BA', flight_number: String(100 + i), origin: 'LHR', destination: 'JFK',
        departure_date: '2026-06-15', booking_class: 'Y', fare_basis: 'YOWUS',
      }));
      const result = await agent.execute({ data: makeInput({ segments: segs }) });
      expect(result.data.tickets[0]!.coupons[0]!.coupon_number).toBe(1);
      expect(result.data.tickets[0]!.coupons[1]!.coupon_number).toBe(2);
      expect(result.data.tickets[0]!.coupons[2]!.coupon_number).toBe(3);
    });

    it('preserves fare basis per coupon', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.tickets[0]!.coupons[0]!.fare_basis).toBe('YOWUS');
    });

    it('preserves baggage allowance', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.tickets[0]!.coupons[0]!.baggage_allowance).toBe('2PC');
    });
  });

  describe('Input validation', () => {
    it('rejects invalid record locator', async () => {
      await expect(agent.execute({ data: makeInput({ record_locator: 'bad' }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid carrier', async () => {
      await expect(agent.execute({ data: makeInput({ issuing_carrier: 'X' }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid passenger name', async () => {
      await expect(agent.execute({ data: makeInput({ passenger_name: 'john smith' }) })).rejects.toThrow('Invalid input');
    });

    it('rejects empty segments', async () => {
      await expect(agent.execute({ data: makeInput({ segments: [] }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid base fare', async () => {
      await expect(agent.execute({ data: makeInput({ base_fare: 'abc' }) })).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('4.1');
      expect(agent.name).toBe('Ticket Issuance');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['agent_id']).toBe('4.1');
      expect(result.metadata!['ticket_count']).toBe(1);
    });

    it('throws when not initialized', async () => {
      const uninit = new TicketIssuance();
      await expect(uninit.execute({ data: makeInput() })).rejects.toThrow('not been initialized');
    });
  });
});
