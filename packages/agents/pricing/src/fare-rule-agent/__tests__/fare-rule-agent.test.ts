/**
 * Fare Rule Agent — Unit Tests
 *
 * Agent 2.1: ATPCO fare rule parsing.
 * Tests against curated tariff snapshot data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FareRuleAgent } from '../index.js';

let agent: FareRuleAgent;

beforeAll(async () => {
  agent = new FareRuleAgent();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

describe('Fare Rule Agent', () => {
  describe('Standard economy fare (UA V14NR JFK-LHR)', () => {
    it('finds fare rule for UA V14NR JFK-LHR', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'V14NR', carrier: 'UA', origin: 'JFK', destination: 'LHR' },
      });

      expect(result.data.total_rules).toBe(1);
      expect(result.data.rules[0]!.carrier).toBe('UA');
      expect(result.data.rules[0]!.fare_basis).toBe('V14NR');
    });

    it('returns 14-day advance purchase requirement', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'V14NR', carrier: 'UA', origin: 'JFK', destination: 'LHR' },
      });

      expect(result.data.rules[0]!.advance_purchase).not.toBeNull();
      expect(result.data.rules[0]!.advance_purchase!.min_days).toBe(14);
    });

    it('returns non-refundable with USD 200 change fee', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'V14NR', carrier: 'UA', origin: 'JFK', destination: 'LHR' },
      });

      const penalty = result.data.rules[0]!.penalty_summary!;
      expect(penalty.refundable).toBe(false);
      expect(penalty.changeable).toBe(true);
      expect(penalty.change_fee!.amount).toBe('200.00');
      expect(penalty.change_fee!.currency).toBe('USD');
    });

    it('requires Saturday night stay', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'V14NR', carrier: 'UA', origin: 'JFK', destination: 'LHR' },
      });

      expect(result.data.rules[0]!.minimum_stay!.saturday_night_required).toBe(true);
      expect(result.data.rules[0]!.minimum_stay!.min_days).toBe(7);
    });
  });

  describe('Flex economy fare (UA Y JFK-LHR)', () => {
    it('finds fully refundable flex fare', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'Y', carrier: 'UA', origin: 'JFK', destination: 'LHR' },
      });

      expect(result.data.total_rules).toBe(1);
      const penalty = result.data.rules[0]!.penalty_summary!;
      expect(penalty.refundable).toBe(true);
      expect(penalty.changeable).toBe(true);
      expect(penalty.change_fee).toBeNull();
    });

    it('has no advance purchase requirement', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'Y', carrier: 'UA', origin: 'JFK', destination: 'LHR' },
      });

      expect(result.data.rules[0]!.advance_purchase!.min_days).toBe(0);
    });

    it('has no minimum stay', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'Y', carrier: 'UA', origin: 'JFK', destination: 'LHR' },
      });

      expect(result.data.rules[0]!.minimum_stay!.min_days).toBe(0);
      expect(result.data.rules[0]!.minimum_stay!.saturday_night_required).toBe(false);
    });
  });

  describe('Business class fare (BA J JFK-LHR)', () => {
    it('finds refundable business fare', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'J', carrier: 'BA', origin: 'JFK', destination: 'LHR' },
      });

      expect(result.data.total_rules).toBe(1);
      expect(result.data.rules[0]!.penalty_summary!.refundable).toBe(true);
    });

    it('has transfer/routing category', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'J', carrier: 'BA', origin: 'JFK', destination: 'LHR' },
      });

      const cat9 = result.data.rules[0]!.categories.find((c) => c.category_number === 9);
      expect(cat9).toBeDefined();
      expect(cat9!.text).toContain('LHR');
    });
  });

  describe('Industry fare (YY Y JFK-LHR)', () => {
    it('finds YY industry fare', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'Y', carrier: 'YY', origin: 'JFK', destination: 'LHR' },
      });

      expect(result.data.total_rules).toBe(1);
      expect(result.data.rules[0]!.carrier).toBe('YY');
    });

    it('has industry eligibility restriction', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'Y', carrier: 'YY', origin: 'JFK', destination: 'LHR' },
      });

      const cat1 = result.data.rules[0]!.categories.find((c) => c.category_number === 1);
      expect(cat1).toBeDefined();
      expect(cat1!.text).toContain('industry');
    });

    it('has ID/AD endorsement', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'Y', carrier: 'YY', origin: 'JFK', destination: 'LHR' },
      });

      const cat18 = result.data.rules[0]!.categories.find((c) => c.category_number === 18);
      expect(cat18).toBeDefined();
      expect(cat18!.text).toContain('ID/AD');
    });
  });

  describe('Peak season with blackout (DL M21NR JFK-LHR)', () => {
    it('finds peak season fare', async () => {
      const result = await agent.execute({
        data: {
          fare_basis: 'M21NR',
          carrier: 'DL',
          origin: 'JFK',
          destination: 'LHR',
          travel_date: '2025-08-01',
        },
      });

      expect(result.data.total_rules).toBe(1);
      expect(result.data.rules[0]!.seasonality).not.toBeNull();
      expect(result.data.rules[0]!.seasonality!.season).toBe('peak');
    });

    it('detects blackout period', async () => {
      const result = await agent.execute({
        data: {
          fare_basis: 'M21NR',
          carrier: 'DL',
          origin: 'JFK',
          destination: 'LHR',
          travel_date: '2025-07-03',
        },
      });

      expect(result.data.in_blackout).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('blackout'))).toBe(true);
    });

    it('returns valid_for_date=true during peak season', async () => {
      const result = await agent.execute({
        data: {
          fare_basis: 'M21NR',
          carrier: 'DL',
          origin: 'JFK',
          destination: 'LHR',
          travel_date: '2025-08-15',
        },
      });

      expect(result.data.valid_for_date).toBe(true);
      expect(result.data.in_blackout).toBe(false);
    });

    it('requires 21-day advance purchase', async () => {
      const result = await agent.execute({
        data: {
          fare_basis: 'M21NR',
          carrier: 'DL',
          origin: 'JFK',
          destination: 'LHR',
          travel_date: '2025-08-01',
        },
      });

      expect(result.data.rules[0]!.advance_purchase!.min_days).toBe(21);
    });
  });

  describe('Saturday night stay (AA H7NR ORD-MIA)', () => {
    it('finds domestic economy fare', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'H7NR', carrier: 'AA', origin: 'ORD', destination: 'MIA' },
      });

      expect(result.data.total_rules).toBe(1);
      expect(result.data.rules[0]!.carrier).toBe('AA');
    });

    it('has no Saturday night requirement for domestic', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'H7NR', carrier: 'AA', origin: 'ORD', destination: 'MIA' },
      });

      expect(result.data.rules[0]!.minimum_stay!.saturday_night_required).toBe(false);
    });
  });

  describe('SQ business (SIN-SYD)', () => {
    it('finds SQ business fare', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'C', carrier: 'SQ', origin: 'SIN', destination: 'SYD' },
      });

      expect(result.data.total_rules).toBe(1);
      expect(result.data.rules[0]!.penalty_summary!.refundable).toBe(true);
    });
  });

  describe('Category filtering', () => {
    it('returns only requested categories', async () => {
      const result = await agent.execute({
        data: {
          fare_basis: 'V14NR',
          carrier: 'UA',
          origin: 'JFK',
          destination: 'LHR',
          categories: [5, 16],
        },
      });

      const catNums = result.data.rules[0]!.categories.map((c) => c.category_number);
      expect(catNums).toContain(5);
      expect(catNums).toContain(16);
      expect(catNums).not.toContain(1);
    });
  });

  describe('No match', () => {
    it('returns empty for unknown fare basis', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'ZZZZ', carrier: 'UA', origin: 'JFK', destination: 'LHR' },
      });

      expect(result.data.total_rules).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('returns empty for unknown market', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'Y', carrier: 'UA', origin: 'XXX', destination: 'YYY' },
      });

      expect(result.data.total_rules).toBe(0);
    });
  });

  describe('Date filtering', () => {
    it('excludes rules outside effective range', async () => {
      const result = await agent.execute({
        data: {
          fare_basis: 'M21NR',
          carrier: 'DL',
          origin: 'JFK',
          destination: 'LHR',
          travel_date: '2026-01-15',
        },
      });

      // DL peak fare ends 2025-09-15
      expect(result.data.total_rules).toBe(0);
    });
  });

  describe('Input validation', () => {
    it('rejects empty fare_basis', async () => {
      await expect(
        agent.execute({
          data: { fare_basis: '', carrier: 'UA', origin: 'JFK', destination: 'LHR' },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid carrier code', async () => {
      await expect(
        agent.execute({
          data: { fare_basis: 'Y', carrier: '123', origin: 'JFK', destination: 'LHR' },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid origin', async () => {
      await expect(
        agent.execute({
          data: { fare_basis: 'Y', carrier: 'UA', origin: '1', destination: 'LHR' },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid date format', async () => {
      await expect(
        agent.execute({
          data: {
            fare_basis: 'Y',
            carrier: 'UA',
            origin: 'JFK',
            destination: 'LHR',
            travel_date: 'bad',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('2.1');
      expect(agent.name).toBe('Fare Rule Agent');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy status', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({
        data: { fare_basis: 'Y', carrier: 'UA', origin: 'JFK', destination: 'LHR' },
      });
      expect(result.metadata!['agent_id']).toBe('2.1');
    });

    it('throws when not initialized', async () => {
      const uninit = new FareRuleAgent();
      await expect(
        uninit.execute({
          data: { fare_basis: 'Y', carrier: 'UA', origin: 'JFK', destination: 'LHR' },
        }),
      ).rejects.toThrow('not been initialized');
    });
  });
});
