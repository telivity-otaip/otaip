/**
 * Void Agent — Unit Tests
 *
 * Agent 4.3: Ticket/EMD void processing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VoidAgent } from '../index.js';
import type { VoidAgentInput } from '../types.js';

let agent: VoidAgent;

beforeAll(async () => {
  agent = new VoidAgent();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

function makeInput(overrides: Partial<VoidAgentInput> = {}): VoidAgentInput {
  return {
    document_number: '1251234567890',
    issuing_carrier: 'BA',
    coupons: [
      { coupon_number: 1, status: 'O' },
      { coupon_number: 2, status: 'O' },
    ],
    issue_datetime: '2026-03-30T10:00:00Z',
    current_datetime: '2026-03-30T15:00:00Z', // 5 hours later
    ...overrides,
  };
}

describe('Void Agent', () => {
  describe('Coupon status check', () => {
    it('permits void when all coupons are Open', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.result.permitted).toBe(true);
    });

    it('rejects void when coupon is Exchanged', async () => {
      const result = await agent.execute({
        data: makeInput({
          coupons: [
            { coupon_number: 1, status: 'O' },
            { coupon_number: 2, status: 'E' },
          ],
        }),
      });
      expect(result.data.result.permitted).toBe(false);
      expect(result.data.result.rejection_reason).toBe('COUPON_NOT_OPEN');
    });

    it('rejects void when coupon is Lifted', async () => {
      const result = await agent.execute({
        data: makeInput({
          coupons: [{ coupon_number: 1, status: 'L' }],
        }),
      });
      expect(result.data.result.permitted).toBe(false);
      expect(result.data.result.rejection_reason).toBe('COUPON_NOT_OPEN');
    });

    it('rejects void when coupon is Already Voided', async () => {
      const result = await agent.execute({
        data: makeInput({
          coupons: [{ coupon_number: 1, status: 'V' }],
        }),
      });
      expect(result.data.result.permitted).toBe(false);
      expect(result.data.result.rejection_reason).toBe('COUPON_NOT_OPEN');
    });

    it('rejects void when coupon is Refunded', async () => {
      const result = await agent.execute({
        data: makeInput({
          coupons: [{ coupon_number: 1, status: 'R' }],
        }),
      });
      expect(result.data.result.permitted).toBe(false);
    });

    it('rejects void when coupon is Checked In', async () => {
      const result = await agent.execute({
        data: makeInput({
          coupons: [{ coupon_number: 1, status: 'C' }],
        }),
      });
      expect(result.data.result.permitted).toBe(false);
    });

    it('reports which coupons are not open', async () => {
      const result = await agent.execute({
        data: makeInput({
          coupons: [
            { coupon_number: 1, status: 'O' },
            { coupon_number: 2, status: 'E' },
            { coupon_number: 3, status: 'L' },
          ],
        }),
      });
      expect(result.data.result.message).toContain('coupon 2');
      expect(result.data.result.message).toContain('coupon 3');
    });
  });

  describe('Carrier void window', () => {
    it('permits void within 24h for BA', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.result.permitted).toBe(true);
      expect(result.data.result.void_window_hours).toBe(24);
    });

    it('rejects void after 24h window expires', async () => {
      const result = await agent.execute({
        data: makeInput({
          issue_datetime: '2026-03-28T10:00:00Z',
          current_datetime: '2026-03-30T15:00:00Z', // 53h later
        }),
      });
      expect(result.data.result.permitted).toBe(false);
      expect(result.data.result.rejection_reason).toBe('VOID_WINDOW_EXPIRED');
    });

    it('calculates hours remaining', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.result.hours_remaining).toBeGreaterThan(0);
      expect(result.data.result.hours_remaining).toBeLessThanOrEqual(24);
    });

    it('rejects void for Ryanair (no void window)', async () => {
      const result = await agent.execute({
        data: makeInput({
          issuing_carrier: 'FR',
        }),
      });
      expect(result.data.result.permitted).toBe(false);
      expect(result.data.result.rejection_reason).toBe('NO_VOID_ALLOWED');
    });

    it('rejects void for easyJet (no void window)', async () => {
      const result = await agent.execute({
        data: makeInput({
          issuing_carrier: 'U2',
        }),
      });
      expect(result.data.result.permitted).toBe(false);
      expect(result.data.result.rejection_reason).toBe('NO_VOID_ALLOWED');
    });

    it('returns unknown carrier for unmapped airlines', async () => {
      const result = await agent.execute({
        data: makeInput({
          issuing_carrier: 'ZZ',
        }),
      });
      expect(result.data.result.permitted).toBe(false);
      expect(result.data.result.rejection_reason).toBe('UNKNOWN_CARRIER');
    });

    it('permits void for US carriers within 24h (DOT regulation)', async () => {
      const result = await agent.execute({
        data: makeInput({
          issuing_carrier: 'AA',
        }),
      });
      expect(result.data.result.permitted).toBe(true);
    });
  });

  describe('BSP settlement check', () => {
    it('permits void before BSP cutoff on same day', async () => {
      const result = await agent.execute({
        data: makeInput({
          settlement_system: 'BSP',
          bsp_cutoff_time: '23:59',
        }),
      });
      expect(result.data.result.permitted).toBe(true);
    });

    it('rejects void after BSP next day cutoff', async () => {
      const result = await agent.execute({
        data: makeInput({
          issue_datetime: '2026-03-28T10:00:00Z',
          current_datetime: '2026-03-30T10:00:00Z', // 2 days later — past next day cutoff
          settlement_system: 'BSP',
          bsp_cutoff_time: '23:59',
        }),
      });
      // This is also past the 24h void window, so VOID_WINDOW_EXPIRED
      expect(result.data.result.permitted).toBe(false);
    });
  });

  describe('ARC settlement check', () => {
    it('permits void within ARC window', async () => {
      const result = await agent.execute({
        data: makeInput({
          issuing_carrier: 'AA',
          settlement_system: 'ARC',
        }),
      });
      expect(result.data.result.permitted).toBe(true);
    });

    it('rejects void after ARC cutoff', async () => {
      const result = await agent.execute({
        data: makeInput({
          issuing_carrier: 'AA',
          issue_datetime: '2026-03-28T10:00:00Z',
          current_datetime: '2026-03-30T15:00:00Z',
          settlement_system: 'ARC',
        }),
      });
      expect(result.data.result.permitted).toBe(false);
    });
  });

  describe('Void result details', () => {
    it('sets all coupons to V when permitted', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.result.updated_coupons).toBeDefined();
      for (const coupon of result.data.result.updated_coupons!) {
        expect(coupon.status).toBe('V');
      }
    });

    it('does not return updated coupons when rejected', async () => {
      const result = await agent.execute({
        data: makeInput({
          coupons: [{ coupon_number: 1, status: 'L' }],
        }),
      });
      expect(result.data.result.updated_coupons).toBeUndefined();
    });

    it('includes rejection message', async () => {
      const result = await agent.execute({
        data: makeInput({
          issuing_carrier: 'FR',
        }),
      });
      expect(result.data.result.message).toBeTruthy();
      expect(result.data.result.message.length).toBeGreaterThan(10);
    });
  });

  describe('Input validation', () => {
    it('rejects invalid document number', async () => {
      await expect(
        agent.execute({ data: makeInput({ document_number: 'INVALID' }) }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid carrier', async () => {
      await expect(agent.execute({ data: makeInput({ issuing_carrier: 'X' }) })).rejects.toThrow(
        'Invalid input',
      );
    });

    it('rejects empty coupons', async () => {
      await expect(agent.execute({ data: makeInput({ coupons: [] }) })).rejects.toThrow(
        'Invalid input',
      );
    });

    it('rejects missing issue datetime', async () => {
      await expect(agent.execute({ data: makeInput({ issue_datetime: '' }) })).rejects.toThrow(
        'Invalid input',
      );
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('4.3');
      expect(agent.name).toBe('Void Agent');
    });

    it('reports healthy', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['agent_id']).toBe('4.3');
      expect(result.metadata!['permitted']).toBe(true);
    });

    it('warns when void is rejected', async () => {
      const result = await agent.execute({ data: makeInput({ issuing_carrier: 'FR' }) });
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('rejected');
    });

    it('throws when not initialized', async () => {
      const uninit = new VoidAgent();
      await expect(uninit.execute({ data: makeInput() })).rejects.toThrow('not been initialized');
    });
  });
});
