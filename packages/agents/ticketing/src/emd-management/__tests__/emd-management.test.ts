/**
 * EMD Management — Unit Tests
 *
 * Agent 4.2: EMD-A and EMD-S issuance.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EmdManagement, RFIC_DESCRIPTIONS } from '../index.js';
import type { EmdManagementInput } from '../types.js';

let agent: EmdManagement;

beforeAll(async () => {
  agent = new EmdManagement();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

function makeEmdAInput(overrides: Partial<EmdManagementInput> = {}): EmdManagementInput {
  return {
    emd_type: 'EMD-A',
    record_locator: 'ABC123',
    issuing_carrier: 'BA',
    passenger_name: 'SMITH/JOHN',
    services: [
      {
        rfic: 'C',
        rfisc: '0CC',
        description: 'Extra baggage 23kg',
        amount: '75.00',
        currency: 'GBP',
        associated_ticket_number: '1251234567890',
        associated_coupon_number: 1,
      },
    ],
    issue_date: '2026-04-01',
    ...overrides,
  };
}

function makeEmdSInput(overrides: Partial<EmdManagementInput> = {}): EmdManagementInput {
  return {
    emd_type: 'EMD-S',
    record_locator: 'DEF456',
    issuing_carrier: 'LH',
    passenger_name: 'MUELLER/ANNA',
    services: [
      {
        rfic: 'E',
        description: 'Lounge access',
        amount: '50.00',
        currency: 'EUR',
      },
    ],
    issue_date: '2026-04-01',
    ...overrides,
  };
}

describe('EMD Management', () => {
  describe('EMD-A issuance', () => {
    it('issues an EMD-A document', async () => {
      const result = await agent.execute({ data: makeEmdAInput() });
      expect(result.data.emd.emd_type).toBe('EMD-A');
    });

    it('generates 13-digit EMD number', async () => {
      const result = await agent.execute({ data: makeEmdAInput() });
      expect(result.data.emd.emd_number).toMatch(/^\d{13}$/);
    });

    it('uses airline prefix for EMD number', async () => {
      const result = await agent.execute({ data: makeEmdAInput() });
      expect(result.data.emd.emd_number.startsWith('125')).toBe(true); // BA = 125
    });

    it('links EMD-A coupon to ticket', async () => {
      const result = await agent.execute({ data: makeEmdAInput() });
      expect(result.data.emd.coupons[0]!.associated_ticket_number).toBe('1251234567890');
      expect(result.data.emd.coupons[0]!.associated_coupon_number).toBe(1);
    });

    it('sets coupons to Open status', async () => {
      const result = await agent.execute({ data: makeEmdAInput() });
      expect(result.data.emd.coupons[0]!.status).toBe('O');
    });

    it('stores RFIC code', async () => {
      const result = await agent.execute({ data: makeEmdAInput() });
      expect(result.data.emd.coupons[0]!.rfic).toBe('C');
    });

    it('stores RFISC as passthrough', async () => {
      const result = await agent.execute({ data: makeEmdAInput() });
      expect(result.data.emd.coupons[0]!.rfisc).toBe('0CC');
    });

    it('rejects EMD-A without associated ticket number', async () => {
      const input = makeEmdAInput({
        services: [{ rfic: 'C', description: 'Baggage', amount: '50.00', currency: 'GBP' }],
      });
      await expect(agent.execute({ data: input })).rejects.toThrow('Invalid input');
    });

    it('rejects EMD-A with invalid ticket number format', async () => {
      const input = makeEmdAInput({
        services: [{
          rfic: 'C', description: 'Baggage', amount: '50.00', currency: 'GBP',
          associated_ticket_number: 'INVALID',
        }],
      });
      await expect(agent.execute({ data: input })).rejects.toThrow('Invalid input');
    });
  });

  describe('EMD-S issuance', () => {
    it('issues an EMD-S document', async () => {
      const result = await agent.execute({ data: makeEmdSInput() });
      expect(result.data.emd.emd_type).toBe('EMD-S');
    });

    it('does not require ticket association for EMD-S', async () => {
      const result = await agent.execute({ data: makeEmdSInput() });
      expect(result.data.emd.coupons[0]!.associated_ticket_number).toBeUndefined();
    });

    it('uses LH prefix for Lufthansa', async () => {
      const result = await agent.execute({ data: makeEmdSInput() });
      expect(result.data.emd.emd_number.startsWith('220')).toBe(true); // LH = 220
    });
  });

  describe('Multiple coupons', () => {
    it('issues EMD with multiple services', async () => {
      const input = makeEmdSInput({
        services: [
          { rfic: 'C', description: 'Extra bag 1', amount: '50.00', currency: 'EUR' },
          { rfic: 'C', description: 'Extra bag 2', amount: '50.00', currency: 'EUR' },
          { rfic: 'F', description: 'Duty free pre-order', amount: '120.00', currency: 'EUR' },
        ],
      });
      const result = await agent.execute({ data: input });
      expect(result.data.emd.coupons).toHaveLength(3);
      expect(result.data.coupon_count).toBe(3);
    });

    it('calculates total amount across coupons', async () => {
      const input = makeEmdSInput({
        services: [
          { rfic: 'C', description: 'Bag 1', amount: '50.00', currency: 'EUR' },
          { rfic: 'C', description: 'Bag 2', amount: '75.00', currency: 'EUR' },
        ],
      });
      const result = await agent.execute({ data: input });
      expect(result.data.emd.total_amount).toBe('125.00');
    });

    it('rejects more than 4 coupons', async () => {
      const services = Array.from({ length: 5 }, (_, i) => ({
        rfic: 'F' as const, description: `Item ${i}`, amount: '10.00', currency: 'EUR',
      }));
      await expect(agent.execute({ data: makeEmdSInput({ services }) })).rejects.toThrow('Invalid input');
    });

    it('numbers coupons sequentially', async () => {
      const input = makeEmdSInput({
        services: [
          { rfic: 'E', description: 'Lounge', amount: '50.00', currency: 'EUR' },
          { rfic: 'G', description: 'WiFi', amount: '15.00', currency: 'EUR' },
        ],
      });
      const result = await agent.execute({ data: input });
      expect(result.data.emd.coupons[0]!.coupon_number).toBe(1);
      expect(result.data.emd.coupons[1]!.coupon_number).toBe(2);
    });
  });

  describe('RFIC codes', () => {
    it('accepts all valid RFIC codes A-G', async () => {
      const codes: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'> = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
      for (const rfic of codes) {
        const input = makeEmdSInput({
          services: [{ rfic, description: `Test ${rfic}`, amount: '10.00', currency: 'EUR' }],
        });
        const result = await agent.execute({ data: input });
        expect(result.data.emd.coupons[0]!.rfic).toBe(rfic);
      }
    });

    it('RFIC_DESCRIPTIONS has all 7 codes', () => {
      expect(Object.keys(RFIC_DESCRIPTIONS)).toHaveLength(7);
      expect(RFIC_DESCRIPTIONS.A).toBe('Air transportation');
      expect(RFIC_DESCRIPTIONS.G).toBe('In-flight services');
    });

    it('rejects invalid RFIC code', async () => {
      const input = makeEmdSInput({
        services: [{ rfic: 'Z' as 'A', description: 'Bad', amount: '10.00', currency: 'EUR' }],
      });
      await expect(agent.execute({ data: input })).rejects.toThrow('Invalid input');
    });
  });

  describe('Input validation', () => {
    it('rejects invalid record locator', async () => {
      await expect(agent.execute({ data: makeEmdSInput({ record_locator: 'bad' }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid carrier', async () => {
      await expect(agent.execute({ data: makeEmdSInput({ issuing_carrier: 'X' }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid passenger name', async () => {
      await expect(agent.execute({ data: makeEmdSInput({ passenger_name: 'john' }) })).rejects.toThrow('Invalid input');
    });

    it('rejects empty services', async () => {
      await expect(agent.execute({ data: makeEmdSInput({ services: [] }) })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid EMD type', async () => {
      await expect(agent.execute({ data: makeEmdSInput({ emd_type: 'EMD-X' as 'EMD-A' }) })).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('4.2');
      expect(agent.name).toBe('EMD Management');
    });

    it('reports healthy', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({ data: makeEmdAInput() });
      expect(result.metadata!['agent_id']).toBe('4.2');
      expect(result.metadata!['emd_type']).toBe('EMD-A');
    });

    it('throws when not initialized', async () => {
      const uninit = new EmdManagement();
      await expect(uninit.execute({ data: makeEmdAInput() })).rejects.toThrow('not been initialized');
    });
  });
});
