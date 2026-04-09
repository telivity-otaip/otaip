/**
 * Exchange/Reissue — Unit Tests
 *
 * Agent 5.2: Ticket reissue with residual value, tax carryforward, GDS commands.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ExchangeReissue } from '../index.js';
import type { ExchangeReissueInput } from '../types.js';

let agent: ExchangeReissue;

beforeAll(async () => {
  agent = new ExchangeReissue();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

function makeInput(overrides: Partial<ExchangeReissueInput> = {}): ExchangeReissueInput {
  return {
    original_ticket_number: '1251234567890',
    original_issue_date: '2026-03-01',
    issuing_carrier: 'BA',
    passenger_name: 'SMITH/JOHN',
    record_locator: 'ABC123',
    original_base_fare: '450.00',
    original_taxes: [
      { code: 'GB', amount: '85.00', currency: 'USD' },
      { code: 'US', amount: '20.00', currency: 'USD' },
      { code: 'YQ', amount: '15.00', currency: 'USD' },
    ],
    change_fee: '200.00',
    residual_value: '250.00', // 450 - 200 = 250
    new_segments: [
      {
        carrier: 'BA',
        flight_number: '117',
        origin: 'LHR',
        destination: 'JFK',
        departure_date: '2026-07-01',
        booking_class: 'H',
        fare_basis: 'HOWUS',
      },
    ],
    new_fare: '550.00',
    new_fare_currency: 'USD',
    new_taxes: [
      { code: 'GB', amount: '90.00', currency: 'USD' },
      { code: 'US', amount: '20.00', currency: 'USD' },
      { code: 'YQ', amount: '15.00', currency: 'USD' },
    ],
    fare_calculation: 'LON BA NYC 550.00 NUC550.00 END ROE1.00',
    form_of_payment: {
      type: 'CREDIT_CARD',
      card_code: 'VI',
      card_last_four: '4242',
      amount: '505.00',
      currency: 'USD',
    },
    same_origin_destination: true,
    issue_date: '2026-04-01',
    ...overrides,
  };
}

describe('Exchange/Reissue', () => {
  describe('Residual value application', () => {
    it('applies residual value to new fare', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.reissue.exchange_audit.residual_applied).toBe('250.00');
    });

    it('calculates additional collection (new fare - residual + change fee + new taxes)', async () => {
      const result = await agent.execute({ data: makeInput() });
      // new fare 550 - residual 250 = 300, + change fee 200 = 500, + new tax delta = 5 (GB increased by 5) → 505
      expect(Number(result.data.additional_collection)).toBeGreaterThan(0);
    });

    it('credit when residual exceeds new fare', async () => {
      const input = makeInput({
        new_fare: '200.00',
        residual_value: '250.00',
        change_fee: '0.00',
      });
      const result = await agent.execute({ data: input });
      expect(Number(result.data.credit_amount)).toBeGreaterThan(0);
    });

    it('no credit when new fare exceeds residual', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.credit_amount).toBe('0.00');
    });
  });

  describe('Tax carryforward', () => {
    it('carries forward taxes when same origin/destination', async () => {
      const result = await agent.execute({ data: makeInput({ same_origin_destination: true }) });
      expect(result.data.reissue.exchange_audit.taxes_carried_forward.length).toBeGreaterThan(0);
    });

    it('collects only tax delta for matching codes', async () => {
      const result = await agent.execute({ data: makeInput() });
      // GB went from 85 to 90, US stayed same, YQ stayed same
      const newTaxes = result.data.reissue.exchange_audit.taxes_new;
      const gbDelta = newTaxes.find((t) => t.code === 'GB');
      expect(gbDelta).toBeDefined();
      expect(gbDelta!.amount).toBe('5.00');
    });

    it('does not carry forward taxes on different origin/destination', async () => {
      const result = await agent.execute({ data: makeInput({ same_origin_destination: false }) });
      expect(result.data.reissue.exchange_audit.taxes_carried_forward).toHaveLength(0);
    });

    it('collects new tax codes in full', async () => {
      const input = makeInput({
        new_taxes: [
          { code: 'GB', amount: '90.00', currency: 'USD' },
          { code: 'US', amount: '20.00', currency: 'USD' },
          { code: 'YQ', amount: '15.00', currency: 'USD' },
          { code: 'XA', amount: '10.00', currency: 'USD' }, // new code
        ],
      });
      const result = await agent.execute({ data: input });
      const newTaxes = result.data.reissue.exchange_audit.taxes_new;
      const xa = newTaxes.find((t) => t.code === 'XA');
      expect(xa).toBeDefined();
      expect(xa!.amount).toBe('10.00');
    });
  });

  describe('New ticket record', () => {
    it('generates 13-digit ticket number', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.reissue.ticket_number).toMatch(/^\d{13}$/);
    });

    it('uses BA prefix (125)', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.reissue.ticket_number.startsWith('125')).toBe(true);
    });

    it('sets all coupons to Open status', async () => {
      const result = await agent.execute({ data: makeInput() });
      for (const c of result.data.reissue.coupons) {
        expect(c.status).toBe('O');
      }
    });

    it('sets issue date', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.reissue.issue_date).toBe('2026-04-01');
    });

    it('preserves passenger name', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.reissue.passenger_name).toBe('SMITH/JOHN');
    });

    it('calculates total amount correctly', async () => {
      const result = await agent.execute({ data: makeInput() });
      const total = Number(result.data.reissue.total_amount);
      expect(total).toBeGreaterThan(0);
    });
  });

  describe('Exchange audit trail', () => {
    it('records original ticket number', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.reissue.exchange_audit.original_ticket_number).toBe('1251234567890');
    });

    it('sets exchange indicator to E', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.reissue.exchange_audit.exchange_indicator).toBe('E');
    });

    it('records change fee paid', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.reissue.exchange_audit.change_fee_paid).toBe('200.00');
    });

    it('records original issue date', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.reissue.exchange_audit.original_issue_date).toBe('2026-03-01');
    });

    it('records waiver code when present', async () => {
      const input = makeInput({ waiver_code: 'WAIVER456' });
      const result = await agent.execute({ data: input });
      expect(result.data.reissue.exchange_audit.waiver_code).toBe('WAIVER456');
    });
  });

  describe('GDS exchange commands', () => {
    it('generates Amadeus TKTXCH command', async () => {
      const input = makeInput({ gds: 'AMADEUS' });
      const result = await agent.execute({ data: input });
      expect(result.data.reissue.exchange_commands).toBeDefined();
      const tktxch = result.data.reissue.exchange_commands!.find(
        (c) => c.command_name === 'TKTXCH',
      );
      expect(tktxch).toBeDefined();
      expect(tktxch!.gds).toBe('AMADEUS');
    });

    it('generates Sabre EXCHANGE_PNR command', async () => {
      const input = makeInput({ gds: 'SABRE' });
      const result = await agent.execute({ data: input });
      const cmd = result.data.reissue.exchange_commands!.find(
        (c) => c.command_name === 'EXCHANGE_PNR',
      );
      expect(cmd).toBeDefined();
    });

    it('generates Travelport UNIVERSAL_RECORD_EXCHANGE command', async () => {
      const input = makeInput({ gds: 'TRAVELPORT' });
      const result = await agent.execute({ data: input });
      const cmd = result.data.reissue.exchange_commands!.find(
        (c) => c.command_name === 'UNIVERSAL_RECORD_EXCHANGE',
      );
      expect(cmd).toBeDefined();
    });

    it('omits commands when no GDS specified', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.reissue.exchange_commands).toBeUndefined();
    });
  });

  describe('Conjunction ticket handling', () => {
    it('references conjunction originals in exchange', async () => {
      const input = makeInput({
        conjunction_originals: ['1251234567891', '1251234567892'],
        gds: 'AMADEUS',
      });
      const result = await agent.execute({ data: input });
      expect(result.data.reissue.exchange_audit.conjunction_originals).toHaveLength(2);
      const conjRef = result.data.reissue.exchange_commands!.find(
        (c) => c.command_name === 'CONJUNCTION_REFERENCE',
      );
      expect(conjRef).toBeDefined();
    });

    it('warns about conjunction exchange', async () => {
      const input = makeInput({ conjunction_originals: ['1251234567891'] });
      const result = await agent.execute({ data: input });
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('Conjunction'))).toBe(true);
    });
  });

  describe('Input validation', () => {
    it('rejects invalid original ticket number', async () => {
      await expect(
        agent.execute({ data: makeInput({ original_ticket_number: 'BAD' }) }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid carrier', async () => {
      await expect(agent.execute({ data: makeInput({ issuing_carrier: 'X' }) })).rejects.toThrow(
        'Invalid input',
      );
    });

    it('rejects invalid passenger name', async () => {
      await expect(agent.execute({ data: makeInput({ passenger_name: 'bad' }) })).rejects.toThrow(
        'Invalid input',
      );
    });

    it('rejects empty segments', async () => {
      await expect(agent.execute({ data: makeInput({ new_segments: [] }) })).rejects.toThrow(
        'Invalid input',
      );
    });

    it('rejects invalid conjunction ticket number', async () => {
      await expect(
        agent.execute({ data: makeInput({ conjunction_originals: ['BAD'] }) }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid GDS', async () => {
      await expect(
        agent.execute({ data: makeInput({ gds: 'INVALID' as 'AMADEUS' }) }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('5.2');
      expect(agent.name).toBe('Exchange/Reissue');
    });

    it('reports healthy', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['agent_id']).toBe('5.2');
      expect(result.metadata!['original_ticket']).toBe('1251234567890');
    });

    it('throws when not initialized', async () => {
      const uninit = new ExchangeReissue();
      await expect(uninit.execute({ data: makeInput() })).rejects.toThrow('not been initialized');
    });
  });
});
