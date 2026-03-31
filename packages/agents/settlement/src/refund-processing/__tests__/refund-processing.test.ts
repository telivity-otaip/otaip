/**
 * Refund Processing — Unit Tests
 *
 * Agent 6.1: ATPCO Cat 33 refund with penalty, commission recall, BSP/ARC.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RefundProcessing } from '../index.js';
import type { RefundProcessingInput, TaxItem, CouponRefundItem } from '../types.js';

let agent: RefundProcessing;

beforeAll(async () => {
  agent = new RefundProcessing();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

const BASE_TAXES: TaxItem[] = [
  { code: 'GB', amount: '85.00', currency: 'USD' },
  { code: 'US', amount: '20.00', currency: 'USD' },
  { code: 'YQ', amount: '15.00', currency: 'USD' },
];

function makeInput(overrides: Partial<RefundProcessingInput> = {}): RefundProcessingInput {
  return {
    ticket_number: '1251234567890',
    issuing_carrier: 'BA',
    passenger_name: 'SMITH/JOHN',
    record_locator: 'ABC123',
    base_fare: '450.00',
    base_fare_currency: 'USD',
    taxes: BASE_TAXES,
    commission: { amount: '31.50', type: 'PERCENTAGE', rate: 7 },
    refund_type: 'FULL',
    total_coupons: 4,
    fare_basis: 'HOWUS',
    is_refundable: true,
    settlement_system: 'BSP',
    current_date: '2026-04-01',
    ...overrides,
  };
}

describe('Refund Processing', () => {
  describe('Full refund', () => {
    it('applies penalty for restricted fare', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(Number(result.data.refund.penalty_applied)).toBeGreaterThan(0);
    });

    it('calculates base fare refund after penalty', async () => {
      const result = await agent.execute({ data: makeInput() });
      const base = Number(result.data.refund.base_fare_refund);
      expect(base).toBeLessThan(450);
      expect(base).toBeGreaterThan(0);
    });

    it('refunds all taxes', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.refund.tax_refund).toBe('120.00');
    });

    it('calculates total refund', async () => {
      const result = await agent.execute({ data: makeInput() });
      const total = Number(result.data.refund.total_refund);
      expect(total).toBeGreaterThan(0);
    });

    it('no penalty for Y class (full fare)', async () => {
      const result = await agent.execute({ data: makeInput({ fare_basis: 'YOWUS' }) });
      expect(result.data.refund.penalty_applied).toBe('0.00');
      expect(result.data.refund.base_fare_refund).toBe('450.00');
    });

    it('no penalty for business class', async () => {
      const result = await agent.execute({ data: makeInput({ fare_basis: 'COWUS' }) });
      expect(result.data.refund.penalty_applied).toBe('0.00');
    });

    it('higher penalty for deep discount (E/G)', async () => {
      const result = await agent.execute({ data: makeInput({ fare_basis: 'EOWUS' }) });
      expect(Number(result.data.refund.penalty_applied)).toBe(300);
    });

    it('lists all coupons as refunded', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.refund.audit.coupons_refunded).toEqual([1, 2, 3, 4]);
    });
  });

  describe('Non-refundable fares', () => {
    it('forfeits base fare for BASIC economy', async () => {
      const result = await agent.execute({ data: makeInput({ fare_basis: 'HOWBASIC', is_refundable: false }) });
      expect(result.data.refund.base_fare_refund).toBe('0.00');
      expect(result.data.refund.tax_refund).toBe('120.00');
    });

    it('forfeits base fare for NR fares', async () => {
      const result = await agent.execute({ data: makeInput({ fare_basis: 'HOWNR', is_refundable: false }) });
      expect(result.data.refund.base_fare_refund).toBe('0.00');
    });

    it('taxes still refundable on non-refundable fare', async () => {
      const result = await agent.execute({ data: makeInput({ fare_basis: 'HOWBASIC', is_refundable: false }) });
      expect(Number(result.data.refund.tax_refund)).toBeGreaterThan(0);
    });
  });

  describe('Tax-only refund', () => {
    it('refunds only taxes', async () => {
      const result = await agent.execute({ data: makeInput({ refund_type: 'TAX_ONLY' }) });
      expect(result.data.refund.base_fare_refund).toBe('0.00');
      expect(result.data.refund.tax_refund).toBe('120.00');
    });

    it('no penalty on tax-only refund', async () => {
      const result = await agent.execute({ data: makeInput({ refund_type: 'TAX_ONLY' }) });
      expect(result.data.refund.penalty_applied).toBe('0.00');
    });
  });

  describe('Partial refund', () => {
    it('prorates fare for partial refund', async () => {
      const coupons: CouponRefundItem[] = [
        { coupon_number: 1, status: 'O', refundable: true },
        { coupon_number: 2, status: 'O', refundable: true },
      ];
      const result = await agent.execute({ data: makeInput({ refund_type: 'PARTIAL', coupons_to_refund: coupons }) });
      // 2 of 4 coupons = 50% of base fare
      expect(Number(result.data.refund.audit.original_base_fare)).toBe(450);
      expect(result.data.refund.audit.coupons_refunded).toEqual([1, 2]);
    });

    it('prorates taxes for partial refund', async () => {
      const coupons: CouponRefundItem[] = [
        { coupon_number: 3, status: 'O', refundable: true },
      ];
      const result = await agent.execute({ data: makeInput({ refund_type: 'PARTIAL', coupons_to_refund: coupons }) });
      // 1 of 4 coupons = 25% of taxes
      expect(result.data.refund.tax_refund).toBe('30.00');
    });

    it('only refunds coupons marked as refundable', async () => {
      const coupons: CouponRefundItem[] = [
        { coupon_number: 1, status: 'O', refundable: true },
        { coupon_number: 2, status: 'L', refundable: false },
      ];
      const result = await agent.execute({ data: makeInput({ refund_type: 'PARTIAL', coupons_to_refund: coupons }) });
      expect(result.data.refund.audit.coupons_refunded).toEqual([1]);
    });
  });

  describe('Waiver code', () => {
    it('bypasses penalty with waiver code', async () => {
      const result = await agent.execute({ data: makeInput({ waiver_code: 'WAIVER123' }) });
      expect(result.data.refund.penalty_applied).toBe('0.00');
      expect(result.data.refund.base_fare_refund).toBe('450.00');
    });

    it('stores waiver code on record', async () => {
      const result = await agent.execute({ data: makeInput({ waiver_code: 'WAIVER123' }) });
      expect(result.data.refund.waiver_code).toBe('WAIVER123');
      expect(result.data.refund.audit.waiver_code).toBe('WAIVER123');
    });
  });

  describe('Commission recall', () => {
    it('recalls proportional commission on full refund', async () => {
      const result = await agent.execute({ data: makeInput({ waiver_code: 'W' }) }); // waiver so full base refund
      expect(result.data.commission_recalled).toBe('31.50'); // full commission
    });

    it('recalls proportional commission on partial refund', async () => {
      const coupons: CouponRefundItem[] = [{ coupon_number: 1, status: 'O', refundable: true }];
      const result = await agent.execute({ data: makeInput({
        refund_type: 'PARTIAL', coupons_to_refund: coupons, waiver_code: 'W',
      }) });
      // 1/4 = 25% of base = 112.50 refunded → commission recall = 31.50 * 112.50/450 = 7.875 → 7.88
      expect(Number(result.data.commission_recalled)).toBeGreaterThan(0);
      expect(Number(result.data.commission_recalled)).toBeLessThan(31.50);
    });

    it('no commission recall when no commission data', async () => {
      const result = await agent.execute({ data: makeInput({ commission: undefined }) });
      expect(result.data.commission_recalled).toBe('0.00');
    });

    it('no commission recall on tax-only refund', async () => {
      const result = await agent.execute({ data: makeInput({ refund_type: 'TAX_ONLY' }) });
      expect(result.data.commission_recalled).toBe('0.00');
    });
  });

  describe('BSP/ARC reporting', () => {
    it('generates BSP fields for BSP settlement', async () => {
      const result = await agent.execute({ data: makeInput({ settlement_system: 'BSP' }) });
      expect(result.data.refund.bsp_fields).toBeDefined();
      expect(result.data.refund.bsp_fields!.refund_indicator).toBe('R');
      expect(result.data.refund.bsp_fields!.original_ticket_number).toBe('1251234567890');
    });

    it('generates ARC fields for ARC settlement', async () => {
      const result = await agent.execute({ data: makeInput({ settlement_system: 'ARC' }) });
      expect(result.data.refund.arc_fields).toBeDefined();
      expect(result.data.refund.arc_fields!.refund_type_indicator).toBe('R');
    });

    it('no ARC fields on BSP ticket', async () => {
      const result = await agent.execute({ data: makeInput({ settlement_system: 'BSP' }) });
      expect(result.data.refund.arc_fields).toBeUndefined();
    });
  });

  describe('Conjunction tickets', () => {
    it('records conjunction tickets in audit', async () => {
      const input = makeInput({ conjunction_tickets: ['1251234567891', '1251234567892'] });
      const result = await agent.execute({ data: input });
      expect(result.data.refund.audit.conjunction_tickets).toHaveLength(2);
    });

    it('rejects partial refund for conjunction set', async () => {
      const input = makeInput({
        conjunction_tickets: ['1251234567891'],
        refund_type: 'PARTIAL',
        coupons_to_refund: [{ coupon_number: 1, status: 'O', refundable: true }],
      });
      await expect(agent.execute({ data: input })).rejects.toThrow('Invalid input');
    });

    it('warns about conjunction refund', async () => {
      const input = makeInput({ conjunction_tickets: ['1251234567891'] });
      const result = await agent.execute({ data: input });
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('Conjunction'))).toBe(true);
    });
  });

  describe('Input validation', () => {
    it('rejects invalid ticket number', async () => {
      await expect(agent.execute({ data: makeInput({ ticket_number: 'BAD' }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid carrier', async () => {
      await expect(agent.execute({ data: makeInput({ issuing_carrier: 'X' }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid passenger name', async () => {
      await expect(agent.execute({ data: makeInput({ passenger_name: 'bad' }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid refund type', async () => {
      await expect(agent.execute({ data: makeInput({ refund_type: 'INVALID' as 'FULL' }) })).rejects.toThrow('Invalid input');
    });

    it('rejects partial without coupons', async () => {
      await expect(agent.execute({ data: makeInput({ refund_type: 'PARTIAL', coupons_to_refund: [] }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid settlement system', async () => {
      await expect(agent.execute({ data: makeInput({ settlement_system: 'INVALID' as 'BSP' }) })).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('6.1');
      expect(agent.name).toBe('Refund Processing');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy', async () => {
      expect((await agent.health()).status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['agent_id']).toBe('6.1');
      expect(result.metadata!['refund_type']).toBe('FULL');
    });

    it('throws when not initialized', async () => {
      const uninit = new RefundProcessing();
      await expect(uninit.execute({ data: makeInput() })).rejects.toThrow('not been initialized');
    });

    it('reports unhealthy when not initialized', async () => {
      const uninit = new RefundProcessing();
      expect((await uninit.health()).status).toBe('unhealthy');
    });
  });
});
