import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HotelModificationAgent } from '../index.js';
import { classifyChange } from '../modification-classifier.js';
import {
  calculateCancellationPenalty,
  calculateNoShowPenalty,
} from '../cancellation-calculator.js';
import type { CancellationPolicy } from '../../types/hotel-common.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent 20.6 — Hotel Modification & Cancellation', () => {
  let agent: HotelModificationAgent;

  beforeAll(async () => {
    agent = new HotelModificationAgent();
    await agent.initialize();
  });

  afterAll(() => {
    agent.destroy();
  });

  describe('Modification classification', () => {
    it('classifies name change as free modification', () => {
      expect(classifyChange({ guestFirstName: 'Jane' })).toBe('free_modification');
    });

    it('classifies bed type change as free modification', () => {
      expect(classifyChange({ bedTypePreference: 'king' })).toBe('free_modification');
    });

    it('classifies smoking preference as free modification', () => {
      expect(classifyChange({ smokingPreference: false })).toBe('free_modification');
    });

    it('classifies special requests as free modification', () => {
      expect(classifyChange({ specialRequests: 'Extra pillows' })).toBe('free_modification');
    });

    it('classifies accessibility needs as free modification', () => {
      expect(classifyChange({ accessibilityNeeds: 'Wheelchair accessible' })).toBe(
        'free_modification',
      );
    });

    it('classifies guest count change as free modification', () => {
      expect(classifyChange({ guestCount: 3 })).toBe('free_modification');
    });

    it('classifies date change as cancel/rebook required', () => {
      expect(
        classifyChange(undefined, { newCheckIn: '2025-07-01', newCheckOut: '2025-07-03' }),
      ).toBe('cancel_rebook_required');
    });

    it('date change overrides free modifications', () => {
      expect(
        classifyChange(
          { guestFirstName: 'Jane' },
          { newCheckIn: '2025-07-01', newCheckOut: '2025-07-03' },
        ),
      ).toBe('cancel_rebook_required');
    });
  });

  describe('Cancellation penalty calculation', () => {
    const refundablePolicy: CancellationPolicy = {
      refundable: true,
      deadlines: [{ hoursBeforeCheckin: 24, penaltyType: 'nights', penaltyValue: 1 }],
      freeCancel24hrBooking: true,
    };

    const nonRefundablePolicy: CancellationPolicy = {
      refundable: false,
      deadlines: [],
      freeCancel24hrBooking: true,
    };

    it('applies California 24hr rule (free cancel within 24hr of booking)', () => {
      const now = new Date();
      const bookedAt = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago
      const checkIn = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

      const penalty = calculateCancellationPenalty(
        refundablePolicy,
        checkIn.toISOString(),
        now.toISOString(),
        bookedAt.toISOString(),
        { amount: '299.00', currency: 'USD' },
      );

      expect(penalty.isWithinFreeWindow).toBe(true);
      expect(penalty.californiaRuleApplies).toBe(true);
      expect(penalty.penaltyAmount.amount).toBe('0.00');
    });

    it('charges penalty when past 24hr deadline', () => {
      const now = new Date();
      const checkIn = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 hours from now
      const bookedAt = new Date(now.getTime() - 48 * 60 * 60 * 1000); // Booked 48 hours ago

      const penalty = calculateCancellationPenalty(
        refundablePolicy,
        checkIn.toISOString(),
        now.toISOString(),
        bookedAt.toISOString(),
        { amount: '299.00', currency: 'USD' },
      );

      expect(penalty.isWithinFreeWindow).toBe(false);
      expect(penalty.penaltyAmount.amount).toBe('299.00'); // 1 night
    });

    it('allows free cancellation before all deadlines', () => {
      const now = new Date();
      const checkIn = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72 hours from now
      const bookedAt = new Date(now.getTime() - 48 * 60 * 60 * 1000); // Booked 48 hours ago

      const penalty = calculateCancellationPenalty(
        refundablePolicy,
        checkIn.toISOString(),
        now.toISOString(),
        bookedAt.toISOString(),
        { amount: '299.00', currency: 'USD' },
      );

      expect(penalty.isWithinFreeWindow).toBe(true);
      expect(penalty.penaltyAmount.amount).toBe('0.00');
    });

    it('charges full amount for non-refundable (past California 24hr)', () => {
      const now = new Date();
      const checkIn = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const bookedAt = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      const penalty = calculateCancellationPenalty(
        nonRefundablePolicy,
        checkIn.toISOString(),
        now.toISOString(),
        bookedAt.toISOString(),
        { amount: '299.00', currency: 'USD' },
      );

      expect(penalty.isWithinFreeWindow).toBe(false);
      expect(penalty.penaltyType).toBe('full_charge');
    });

    it('California rule saves non-refundable within 24hr', () => {
      const now = new Date();
      const checkIn = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const bookedAt = new Date(now.getTime() - 6 * 60 * 60 * 1000); // 6 hours ago

      const penalty = calculateCancellationPenalty(
        nonRefundablePolicy,
        checkIn.toISOString(),
        now.toISOString(),
        bookedAt.toISOString(),
        { amount: '299.00', currency: 'USD' },
      );

      expect(penalty.isWithinFreeWindow).toBe(true);
      expect(penalty.californiaRuleApplies).toBe(true);
      expect(penalty.penaltyAmount.amount).toBe('0.00');
    });
  });

  describe('No-show handling', () => {
    it('calculates no-show penalty as 1 night charge', () => {
      const penalty = calculateNoShowPenalty({ amount: '250.00', currency: 'USD' });
      expect(penalty.penaltyAmount.amount).toBe('250.00');
      expect(penalty.penaltyType).toBe('one_night');
    });
  });

  describe('Agent operations', () => {
    it('processes free modification', async () => {
      const result = await agent.execute({
        data: {
          operation: 'modify',
          bookingId: 'BK-001',
          modifications: { guestFirstName: 'Jane' },
        },
      });

      expect(result.data.success).toBe(true);
      expect(result.data.isFreeMod).toBe(true);
      expect(result.data.rebookRequired).toBe(false);
    });

    it('routes date change to cancel/rebook', async () => {
      const result = await agent.execute({
        data: {
          operation: 'modify',
          bookingId: 'BK-001',
          dateChange: { newCheckIn: '2025-07-01', newCheckOut: '2025-07-03' },
        },
      });

      expect(result.data.success).toBe(false);
      expect(result.data.rebookRequired).toBe(true);
      expect(result.data.classification).toBe('cancel_rebook_required');
    });

    it('processes no-show', async () => {
      const result = await agent.execute({
        data: { operation: 'process_no_show', bookingId: 'BK-001' },
      });

      expect(result.data.penalty).toBeDefined();
      expect(result.data.penalty!.penaltyType).toBe('one_night');
    });
  });

  describe('Input validation', () => {
    it('rejects missing booking ID', async () => {
      await expect(agent.execute({ data: { operation: 'modify', bookingId: '' } })).rejects.toThrow(
        'bookingId',
      );
    });

    it('rejects invalid operation', async () => {
      await expect(
        agent.execute({ data: { operation: 'invalid' as 'modify', bookingId: 'BK-001' } }),
      ).rejects.toThrow('operation');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('20.6');
      expect(agent.name).toBe('Hotel Modification & Cancellation');
      expect(agent.version).toBe('0.1.0');
    });

    it('throws when not initialized', async () => {
      const uninit = new HotelModificationAgent();
      await expect(
        uninit.execute({ data: { operation: 'modify', bookingId: 'BK-001' } }),
      ).rejects.toThrow('not been initialized');
    });

    it('reports healthy status', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });
  });
});
