/**
 * ADM/ACM Processing — Unit Tests
 *
 * Agent 6.3: ADM receipt, assessment, dispute, accept, escalate;
 * ACM receipt and application; pending deadline tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ADMACMProcessingAgent } from '../index.js';

let agent: ADMACMProcessingAgent;

beforeEach(async () => {
  agent = new ADMACMProcessingAgent();
  await agent.initialize();
});

// --- Helpers ---

async function receiveTestADM(overrides?: Record<string, unknown>) {
  const defaults = {
    operation: 'receiveADM' as const,
    ticketNumber: '1234567890123',
    airline: 'BA',
    amount: '150.00',
    currency: 'GBP',
    reason: 'Fare difference',
    reasonCode: 'A01',
    currentDate: '2025-01-10',
  };
  return agent.execute({ data: { ...defaults, ...overrides } });
}

async function receiveTestACM(overrides?: Record<string, unknown>) {
  const defaults = {
    operation: 'receiveACM' as const,
    ticketNumber: '1234567890123',
    airline: 'BA',
    amount: '75.00',
    currency: 'GBP',
    reason: 'Fare correction credit',
    currentDate: '2025-01-10',
  };
  return agent.execute({ data: { ...defaults, ...overrides } });
}

// --- Tests ---

describe('ADM/ACM Processing Agent', () => {
  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('6.3');
      expect(agent.name).toBe('ADM/ACM Processing');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy status after initialization', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('reports unhealthy status before initialization', async () => {
      const uninit = new ADMACMProcessingAgent();
      const health = await uninit.health();
      expect(health.status).toBe('unhealthy');
    });

    it('throws when not initialized', async () => {
      const uninit = new ADMACMProcessingAgent();
      await expect(
        uninit.execute({ data: { operation: 'getPendingWithDeadlines' } }),
      ).rejects.toThrow('not been initialized');
    });

    it('returns metadata in output', async () => {
      const result = await receiveTestADM();
      expect(result.metadata).toBeDefined();
      expect(result.metadata!['agent_id']).toBe('6.3');
      expect(result.metadata!['operation']).toBe('receiveADM');
    });
  });

  describe('receiveADM', () => {
    it('creates an ADM record with RECEIVED status', async () => {
      const result = await receiveTestADM();
      expect(result.data.adm).toBeDefined();
      expect(result.data.adm!.status).toBe('RECEIVED');
      expect(result.data.adm!.ticketNumber).toBe('1234567890123');
      expect(result.data.adm!.airline).toBe('BA');
      expect(result.data.adm!.amount).toBe('150.00');
      expect(result.data.adm!.currency).toBe('GBP');
    });

    it('generates a UUID admId', async () => {
      const result = await receiveTestADM();
      expect(result.data.adm!.admId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('calculates dispute deadline as issuedDate + 15 days', async () => {
      const result = await receiveTestADM({ currentDate: '2025-01-10' });
      expect(result.data.adm!.issuedDate).toBe('2025-01-10');
      expect(result.data.adm!.disputeDeadline).toBe('2025-01-25');
    });

    it('initializes with empty history', async () => {
      const result = await receiveTestADM();
      expect(result.data.adm!.history).toEqual([]);
    });

    it('stores the reason and reasonCode', async () => {
      const result = await receiveTestADM({ reason: 'Class mismatch', reasonCode: 'B02' });
      expect(result.data.adm!.reason).toBe('Class mismatch');
      expect(result.data.adm!.reasonCode).toBe('B02');
    });
  });

  describe('receiveACM', () => {
    it('creates an ACM record with RECEIVED status', async () => {
      const result = await receiveTestACM();
      expect(result.data.acm).toBeDefined();
      expect(result.data.acm!.status).toBe('RECEIVED');
      expect(result.data.acm!.amount).toBe('75.00');
    });

    it('generates a UUID acmId', async () => {
      const result = await receiveTestACM();
      expect(result.data.acm!.acmId).toMatch(/^[0-9a-f]{8}-/);
    });
  });

  describe('assessADM', () => {
    it('assesses an ADM with days remaining and recommends DISPUTE', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      const result = await agent.execute({
        data: { operation: 'assessADM', admId, currentDate: '2025-01-15' },
      });

      expect(result.data.assessment).toBeDefined();
      expect(result.data.assessment!.daysRemaining).toBe(10);
      expect(result.data.assessment!.windowExpired).toBe(false);
      expect(result.data.assessment!.recommendedAction).toBe('DISPUTE');
    });

    it('transitions ADM status to ASSESSED', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      const result = await agent.execute({
        data: { operation: 'assessADM', admId, currentDate: '2025-01-12' },
      });

      expect(result.data.adm!.status).toBe('ASSESSED');
      expect(result.data.adm!.history.length).toBe(1);
      expect(result.data.adm!.history[0].from).toBe('RECEIVED');
      expect(result.data.adm!.history[0].to).toBe('ASSESSED');
    });

    it('sets urgency warning when 5 days or less remain', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      const result = await agent.execute({
        data: { operation: 'assessADM', admId, currentDate: '2025-01-22' },
      });

      expect(result.data.assessment!.daysRemaining).toBe(3);
      expect(result.data.assessment!.urgencyWarning).toBeDefined();
      expect(result.data.assessment!.urgencyWarning).toContain('URGENT');
      expect(result.data.assessment!.urgencyWarning).toContain('3');
    });

    it('auto-accepts when dispute window has expired', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      const result = await agent.execute({
        data: { operation: 'assessADM', admId, currentDate: '2025-01-30' },
      });

      expect(result.data.assessment!.windowExpired).toBe(true);
      expect(result.data.assessment!.recommendedAction).toBe('ACCEPT');
      expect(result.data.adm!.status).toBe('ACCEPTED');
    });

    it('returns ADM_NOT_FOUND for unknown admId', async () => {
      const result = await agent.execute({
        data: { operation: 'assessADM', admId: 'nonexistent-id' },
      });
      expect(result.data.errorCode).toBe('ADM_NOT_FOUND');
    });
  });

  describe('disputeADM', () => {
    it('disputes an ADM within the window', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      const result = await agent.execute({
        data: {
          operation: 'disputeADM',
          admId,
          disputeGround: 'FARE_ALREADY_CORRECT',
          evidence: 'Fare filed correctly per tariff 1234.',
          currentDate: '2025-01-12',
        },
      });

      expect(result.data.disputeResult).toBeDefined();
      expect(result.data.disputeResult!.success).toBe(true);
      expect(result.data.disputeResult!.ground).toBe('FARE_ALREADY_CORRECT');
      expect(result.data.adm!.status).toBe('DISPUTED');
    });

    it('records dispute in history', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      await agent.execute({
        data: {
          operation: 'disputeADM',
          admId,
          disputeGround: 'DUPLICATE_ADM',
          currentDate: '2025-01-12',
        },
      });

      const get = await agent.execute({ data: { operation: 'getADM', admId } });
      expect(get.data.adm!.history.length).toBeGreaterThanOrEqual(1);
      const lastChange = get.data.adm!.history[get.data.adm!.history.length - 1];
      expect(lastChange.to).toBe('DISPUTED');
    });

    it('returns DISPUTE_WINDOW_CLOSED when expired', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      const result = await agent.execute({
        data: {
          operation: 'disputeADM',
          admId,
          disputeGround: 'AMOUNT_INCORRECT',
          currentDate: '2025-01-30',
        },
      });

      expect(result.data.errorCode).toBe('DISPUTE_WINDOW_CLOSED');
    });

    it('returns ALREADY_DISPUTED for already disputed ADM', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      await agent.execute({
        data: {
          operation: 'disputeADM',
          admId,
          disputeGround: 'FARE_ALREADY_CORRECT',
          currentDate: '2025-01-12',
        },
      });

      const result = await agent.execute({
        data: {
          operation: 'disputeADM',
          admId,
          disputeGround: 'AMOUNT_INCORRECT',
          currentDate: '2025-01-13',
        },
      });

      expect(result.data.errorCode).toBe('ALREADY_DISPUTED');
    });

    it('returns ALREADY_ACCEPTED for accepted ADM', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      await agent.execute({
        data: { operation: 'acceptADM', admId, currentDate: '2025-01-12' },
      });

      const result = await agent.execute({
        data: {
          operation: 'disputeADM',
          admId,
          disputeGround: 'FARE_ALREADY_CORRECT',
          currentDate: '2025-01-13',
        },
      });

      expect(result.data.errorCode).toBe('ALREADY_ACCEPTED');
    });

    it('supports all dispute grounds', async () => {
      const grounds: Array<
        | 'FARE_ALREADY_CORRECT'
        | 'WITHIN_WAIVER_WINDOW'
        | 'DUPLICATE_ADM'
        | 'AMOUNT_INCORRECT'
        | 'OUTSIDE_AIRLINE_POLICY'
        | 'TICKET_REISSUED'
      > = [
        'FARE_ALREADY_CORRECT',
        'WITHIN_WAIVER_WINDOW',
        'DUPLICATE_ADM',
        'AMOUNT_INCORRECT',
        'OUTSIDE_AIRLINE_POLICY',
        'TICKET_REISSUED',
      ];

      for (const ground of grounds) {
        const recv = await receiveTestADM({ currentDate: '2025-01-10' });
        const admId = recv.data.adm!.admId;

        const result = await agent.execute({
          data: {
            operation: 'disputeADM',
            admId,
            disputeGround: ground,
            currentDate: '2025-01-12',
          },
        });

        expect(result.data.disputeResult!.ground).toBe(ground);
      }
    });
  });

  describe('acceptADM', () => {
    it('accepts an ADM and transitions to ACCEPTED', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      const result = await agent.execute({
        data: { operation: 'acceptADM', admId, currentDate: '2025-01-12' },
      });

      expect(result.data.adm!.status).toBe('ACCEPTED');
    });

    it('returns ALREADY_ACCEPTED for already accepted ADM', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      await agent.execute({ data: { operation: 'acceptADM', admId, currentDate: '2025-01-12' } });

      const result = await agent.execute({
        data: { operation: 'acceptADM', admId, currentDate: '2025-01-13' },
      });

      expect(result.data.errorCode).toBe('ALREADY_ACCEPTED');
    });

    it('returns INVALID_STATUS_TRANSITION for disputed ADM', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      await agent.execute({
        data: {
          operation: 'disputeADM',
          admId,
          disputeGround: 'FARE_ALREADY_CORRECT',
          currentDate: '2025-01-12',
        },
      });

      const result = await agent.execute({
        data: { operation: 'acceptADM', admId, currentDate: '2025-01-13' },
      });

      expect(result.data.errorCode).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('escalateADM', () => {
    it('escalates an ADM', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      const result = await agent.execute({
        data: { operation: 'escalateADM', admId, currentDate: '2025-01-12' },
      });

      expect(result.data.adm!.status).toBe('ESCALATED');
    });

    it('returns INVALID_STATUS_TRANSITION for accepted ADM', async () => {
      const recv = await receiveTestADM({ currentDate: '2025-01-10' });
      const admId = recv.data.adm!.admId;

      await agent.execute({ data: { operation: 'acceptADM', admId, currentDate: '2025-01-12' } });

      const result = await agent.execute({
        data: { operation: 'escalateADM', admId, currentDate: '2025-01-13' },
      });

      expect(result.data.errorCode).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('applyACM', () => {
    it('applies an ACM and transitions to APPLIED', async () => {
      const recv = await receiveTestACM();
      const acmId = recv.data.acm!.acmId;

      const result = await agent.execute({
        data: { operation: 'applyACM', acmId },
      });

      expect(result.data.acm!.status).toBe('APPLIED');
    });

    it('returns ACM_NOT_FOUND for unknown acmId', async () => {
      const result = await agent.execute({
        data: { operation: 'applyACM', acmId: 'nonexistent-id' },
      });
      expect(result.data.errorCode).toBe('ACM_NOT_FOUND');
    });

    it('returns INVALID_STATUS_TRANSITION for already applied ACM', async () => {
      const recv = await receiveTestACM();
      const acmId = recv.data.acm!.acmId;

      await agent.execute({ data: { operation: 'applyACM', acmId } });

      const result = await agent.execute({
        data: { operation: 'applyACM', acmId },
      });

      expect(result.data.errorCode).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('getADM', () => {
    it('retrieves an ADM by ID', async () => {
      const recv = await receiveTestADM();
      const admId = recv.data.adm!.admId;

      const result = await agent.execute({
        data: { operation: 'getADM', admId },
      });

      expect(result.data.adm).toBeDefined();
      expect(result.data.adm!.admId).toBe(admId);
    });

    it('returns ADM_NOT_FOUND for unknown ID', async () => {
      const result = await agent.execute({
        data: { operation: 'getADM', admId: 'does-not-exist' },
      });
      expect(result.data.errorCode).toBe('ADM_NOT_FOUND');
    });
  });

  describe('getPendingWithDeadlines', () => {
    it('returns pending ADMs sorted by urgency', async () => {
      await receiveTestADM({ currentDate: '2025-01-05' });
      await receiveTestADM({ currentDate: '2025-01-10' });
      await receiveTestADM({ currentDate: '2025-01-15' });

      const result = await agent.execute({
        data: { operation: 'getPendingWithDeadlines', currentDate: '2025-01-18' },
      });

      expect(result.data.pendingDeadlines).toBeDefined();
      expect(result.data.pendingDeadlines!.length).toBe(3);
      // Sorted by daysRemaining ascending
      const days = result.data.pendingDeadlines!.map((p) => p.daysRemaining);
      expect(days[0]).toBeLessThanOrEqual(days[1]);
      expect(days[1]).toBeLessThanOrEqual(days[2]);
    });

    it('marks urgent items when 5 days or less remain', async () => {
      await receiveTestADM({ currentDate: '2025-01-10' });

      const result = await agent.execute({
        data: { operation: 'getPendingWithDeadlines', currentDate: '2025-01-22' },
      });

      expect(result.data.pendingDeadlines!.length).toBe(1);
      expect(result.data.pendingDeadlines![0].urgent).toBe(true);
      expect(result.data.pendingDeadlines![0].daysRemaining).toBe(3);
    });

    it('excludes accepted/disputed ADMs', async () => {
      const recv1 = await receiveTestADM({ currentDate: '2025-01-10' });
      const recv2 = await receiveTestADM({ currentDate: '2025-01-10' });

      await agent.execute({
        data: { operation: 'acceptADM', admId: recv1.data.adm!.admId, currentDate: '2025-01-11' },
      });
      await agent.execute({
        data: {
          operation: 'disputeADM',
          admId: recv2.data.adm!.admId,
          disputeGround: 'FARE_ALREADY_CORRECT',
          currentDate: '2025-01-11',
        },
      });

      const result = await agent.execute({
        data: { operation: 'getPendingWithDeadlines', currentDate: '2025-01-12' },
      });

      expect(result.data.pendingDeadlines!.length).toBe(0);
    });

    it('returns empty list when no pending ADMs', async () => {
      const result = await agent.execute({
        data: { operation: 'getPendingWithDeadlines', currentDate: '2025-01-10' },
      });
      expect(result.data.pendingDeadlines!.length).toBe(0);
    });
  });

  describe('Input validation', () => {
    it('rejects invalid operation', async () => {
      await expect(agent.execute({ data: { operation: 'invalidOp' as 'getADM' } })).rejects.toThrow(
        'Invalid input',
      );
    });

    it('rejects receiveADM without ticketNumber', async () => {
      await expect(
        agent.execute({
          data: {
            operation: 'receiveADM',
            airline: 'BA',
            amount: '100',
            currency: 'GBP',
            reason: 'test',
            reasonCode: 'A01',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects receiveADM with invalid airline code', async () => {
      await expect(
        agent.execute({
          data: {
            operation: 'receiveADM',
            ticketNumber: '1234567890123',
            airline: 'INVALID',
            amount: '100',
            currency: 'GBP',
            reason: 'test',
            reasonCode: 'A01',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects receiveADM with negative amount', async () => {
      await expect(
        agent.execute({
          data: {
            operation: 'receiveADM',
            ticketNumber: '1234567890123',
            airline: 'BA',
            amount: '-50',
            currency: 'GBP',
            reason: 'test',
            reasonCode: 'A01',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects disputeADM without disputeGround', async () => {
      const recv = await receiveTestADM();
      await expect(
        agent.execute({
          data: { operation: 'disputeADM', admId: recv.data.adm!.admId },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects applyACM without acmId', async () => {
      await expect(agent.execute({ data: { operation: 'applyACM' } })).rejects.toThrow(
        'Invalid input',
      );
    });
  });

  describe('Decimal precision', () => {
    it('stores amounts with 2 decimal places', async () => {
      const result = await receiveTestADM({ amount: '149.999' });
      expect(result.data.adm!.amount).toBe('150.00');
    });

    it('handles large amounts correctly', async () => {
      const result = await receiveTestADM({ amount: '99999.99' });
      expect(result.data.adm!.amount).toBe('99999.99');
    });
  });

  describe('destroy', () => {
    it('clears all stores and sets unhealthy', async () => {
      await receiveTestADM();
      agent.destroy();

      const health = await agent.health();
      expect(health.status).toBe('unhealthy');
    });
  });
});
