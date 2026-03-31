/**
 * Waitlist Management — Unit Tests
 *
 * Agent 5.6: Waitlist position tracking, priority scoring,
 * clearance management, and suggested alternatives.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WaitlistManagementAgent } from '../index.js';
import type {
  WaitlistManagementInput,
  AlternativeFlight,
  CabinClass,
  CorporateTier,
} from '../types.js';

let agent: WaitlistManagementAgent;

beforeEach(async () => {
  agent = new WaitlistManagementAgent();
  await agent.initialize();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeAddInput(overrides: Partial<WaitlistManagementInput> = {}): WaitlistManagementInput {
  return {
    operation: 'addToWaitlist',
    pnrRef: 'ABC123',
    segmentRef: 'SEG1',
    flightKey: 'BA117-2026-06-15',
    requestedCabin: 'Y',
    passengerCount: 1,
    corporateTier: 'STANDARD',
    bookingClass: 'Y',
    ...overrides,
  };
}

async function addEntry(
  overrides: Partial<WaitlistManagementInput> = {},
): Promise<string> {
  const result = await agent.execute({ data: makeAddInput(overrides) });
  return result.data.entry!.entryId;
}

function makeAlternative(overrides: Partial<AlternativeFlight> = {}): AlternativeFlight {
  return {
    carrier: 'BA',
    flightNumber: '119',
    origin: 'LHR',
    destination: 'JFK',
    departure: '2026-06-15T14:00:00Z',
    seatsAvailable: 5,
    cabin: 'Y',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('WaitlistManagementAgent', () => {
  /* ---- Agent interface compliance ---- */
  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('5.6');
      expect(agent.name).toBe('Waitlist Management');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy after initialization', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('reports unhealthy when not initialized', async () => {
      const uninit = new WaitlistManagementAgent();
      const health = await uninit.health();
      expect(health.status).toBe('unhealthy');
    });

    it('throws when not initialized', async () => {
      const uninit = new WaitlistManagementAgent();
      await expect(
        uninit.execute({ data: makeAddInput() }),
      ).rejects.toThrow('not been initialized');
    });
  });

  /* ---- addToWaitlist ---- */
  describe('addToWaitlist', () => {
    it('creates a waitlist entry', async () => {
      const result = await agent.execute({ data: makeAddInput() });
      expect(result.data.entry).toBeDefined();
      expect(result.data.entry!.status).toBe('WAITLISTED');
    });

    it('generates a unique entryId', async () => {
      const r1 = await agent.execute({ data: makeAddInput({ pnrRef: 'A1' }) });
      const r2 = await agent.execute({ data: makeAddInput({ pnrRef: 'A2' }) });
      expect(r1.data.entry!.entryId).not.toBe(r2.data.entry!.entryId);
    });

    it('stores pnrRef on the entry', async () => {
      const result = await agent.execute({
        data: makeAddInput({ pnrRef: 'XYZ789' }),
      });
      expect(result.data.entry!.pnrRef).toBe('XYZ789');
    });

    it('computes priority score', async () => {
      const result = await agent.execute({ data: makeAddInput() });
      expect(typeof result.data.entry!.priority).toBe('number');
      expect(result.data.entry!.priority).toBeGreaterThanOrEqual(0);
    });

    it('ELITE tier gets higher priority than STANDARD', async () => {
      const e1 = await agent.execute({
        data: makeAddInput({ pnrRef: 'E1', corporateTier: 'ELITE', flightKey: 'TEST1' }),
      });
      const e2 = await agent.execute({
        data: makeAddInput({ pnrRef: 'S1', corporateTier: 'STANDARD', flightKey: 'TEST1' }),
      });
      expect(e1.data.entry!.priority).toBeGreaterThan(e2.data.entry!.priority);
    });

    it('F cabin gets higher priority than Y cabin', async () => {
      const e1 = await agent.execute({
        data: makeAddInput({ pnrRef: 'F1', requestedCabin: 'F', flightKey: 'TEST2' }),
      });
      const e2 = await agent.execute({
        data: makeAddInput({ pnrRef: 'Y1', requestedCabin: 'Y', flightKey: 'TEST2' }),
      });
      expect(e1.data.entry!.priority).toBeGreaterThan(e2.data.entry!.priority);
    });

    it('defaults to passengerCount 1', async () => {
      const result = await agent.execute({
        data: {
          operation: 'addToWaitlist',
          pnrRef: 'A1',
          segmentRef: 'S1',
          flightKey: 'FL1',
          requestedCabin: 'Y',
          corporateTier: 'STANDARD',
        },
      });
      expect(result.data.entry!.passengerCount).toBe(1);
    });

    it('uses provided passengerCount', async () => {
      const result = await agent.execute({
        data: makeAddInput({ passengerCount: 3 }),
      });
      expect(result.data.entry!.passengerCount).toBe(3);
    });
  });

  /* ---- getPosition ---- */
  describe('getPosition', () => {
    it('returns position 1 for first entry', async () => {
      const entryId = await addEntry({ flightKey: 'POS1' });
      const result = await agent.execute({
        data: { operation: 'getPosition', entryId },
      });
      expect(result.data.position!.position).toBe(1);
    });

    it('returns correct queue size', async () => {
      await addEntry({ pnrRef: 'P1', flightKey: 'POS2' });
      await addEntry({ pnrRef: 'P2', flightKey: 'POS2' });
      const id3 = await addEntry({ pnrRef: 'P3', flightKey: 'POS2' });
      const result = await agent.execute({
        data: { operation: 'getPosition', entryId: id3 },
      });
      expect(result.data.position!.queueSize).toBe(3);
    });

    it('position 1-3 -> HIGH likelihood', async () => {
      const entryId = await addEntry({ flightKey: 'LH1' });
      const result = await agent.execute({
        data: { operation: 'getPosition', entryId },
      });
      expect(result.data.position!.clearanceLikelihood).toBe('HIGH');
    });

    it('position >10 -> LOW likelihood', async () => {
      const flightKey = 'LH_LOW';
      // Add 11 ELITE entries to push a STANDARD one beyond position 10
      for (let i = 0; i < 11; i++) {
        await addEntry({
          pnrRef: `ELT${i}`,
          flightKey,
          corporateTier: 'ELITE',
          requestedCabin: 'F',
        });
      }
      const entryId = await addEntry({
        pnrRef: 'STD_LAST',
        flightKey,
        corporateTier: 'STANDARD',
        requestedCabin: 'Y',
      });
      const result = await agent.execute({
        data: { operation: 'getPosition', entryId },
      });
      expect(result.data.position!.clearanceLikelihood).toBe('LOW');
    });

    it('error when entry is not waitlisted', async () => {
      const entryId = await addEntry({ flightKey: 'RM1' });
      // Remove it
      await agent.execute({
        data: { operation: 'removeFromWaitlist', entryId },
      });
      const result = await agent.execute({
        data: { operation: 'getPosition', entryId },
      });
      expect(result.data.error).toBeDefined();
      expect(result.data.error!.code).toBe('SEGMENT_NOT_ON_WAITLIST');
    });
  });

  /* ---- checkStatus ---- */
  describe('checkStatus', () => {
    it('returns current status of an entry', async () => {
      const entryId = await addEntry();
      const result = await agent.execute({
        data: { operation: 'checkStatus', entryId },
      });
      expect(result.data.entry!.status).toBe('WAITLISTED');
    });

    it('returns CLEARED status after confirmation', async () => {
      const entryId = await addEntry();
      await agent.execute({
        data: { operation: 'confirmCleared', entryId },
      });
      const result = await agent.execute({
        data: { operation: 'checkStatus', entryId },
      });
      expect(result.data.entry!.status).toBe('CLEARED');
    });
  });

  /* ---- confirmCleared ---- */
  describe('confirmCleared', () => {
    it('marks entry as CLEARED', async () => {
      const entryId = await addEntry();
      const result = await agent.execute({
        data: { operation: 'confirmCleared', entryId },
      });
      expect(result.data.entry!.status).toBe('CLEARED');
    });

    it('returns ALREADY_CONFIRMED error on double confirmation', async () => {
      const entryId = await addEntry();
      await agent.execute({
        data: { operation: 'confirmCleared', entryId },
      });
      const result = await agent.execute({
        data: { operation: 'confirmCleared', entryId },
      });
      expect(result.data.error).toBeDefined();
      expect(result.data.error!.code).toBe('ALREADY_CONFIRMED');
    });

    it('returns SEGMENT_NOT_ON_WAITLIST for removed entry', async () => {
      const entryId = await addEntry();
      await agent.execute({
        data: { operation: 'removeFromWaitlist', entryId },
      });
      const result = await agent.execute({
        data: { operation: 'confirmCleared', entryId },
      });
      expect(result.data.error).toBeDefined();
      expect(result.data.error!.code).toBe('SEGMENT_NOT_ON_WAITLIST');
    });
  });

  /* ---- removeFromWaitlist ---- */
  describe('removeFromWaitlist', () => {
    it('marks entry as REMOVED', async () => {
      const entryId = await addEntry();
      const result = await agent.execute({
        data: { operation: 'removeFromWaitlist', entryId },
      });
      expect(result.data.entry!.status).toBe('REMOVED');
    });

    it('removed entry no longer appears in priority queue', async () => {
      const flightKey = 'RMQ1';
      const entryId = await addEntry({ flightKey });
      await addEntry({ pnrRef: 'KEEP1', flightKey });
      await agent.execute({
        data: { operation: 'removeFromWaitlist', entryId },
      });
      const queueResult = await agent.execute({
        data: { operation: 'getPriorityQueue', flightKey },
      });
      const ids = queueResult.data.queue!.map((e) => e.entryId);
      expect(ids).not.toContain(entryId);
    });
  });

  /* ---- getSuggestedAlternatives ---- */
  describe('getSuggestedAlternatives', () => {
    it('returns flights with available seats', async () => {
      const result = await agent.execute({
        data: {
          operation: 'getSuggestedAlternatives',
          alternatives: [
            makeAlternative({ seatsAvailable: 5 }),
            makeAlternative({ flightNumber: '121', seatsAvailable: 0 }),
          ],
        },
      });
      expect(result.data.suggestedAlternatives!.length).toBe(1);
    });

    it('sorts by seats descending', async () => {
      const result = await agent.execute({
        data: {
          operation: 'getSuggestedAlternatives',
          alternatives: [
            makeAlternative({ flightNumber: '119', seatsAvailable: 3 }),
            makeAlternative({ flightNumber: '121', seatsAvailable: 10 }),
          ],
        },
      });
      const alts = result.data.suggestedAlternatives!;
      expect(alts[0].seatsAvailable).toBeGreaterThanOrEqual(alts[1].seatsAvailable);
    });

    it('returns empty array when no alternatives', async () => {
      const result = await agent.execute({
        data: { operation: 'getSuggestedAlternatives', alternatives: [] },
      });
      expect(result.data.suggestedAlternatives!.length).toBe(0);
    });
  });

  /* ---- getPriorityQueue ---- */
  describe('getPriorityQueue', () => {
    it('returns all waitlisted entries for a flight', async () => {
      const flightKey = 'PQ1';
      await addEntry({ pnrRef: 'Q1', flightKey });
      await addEntry({ pnrRef: 'Q2', flightKey });
      const result = await agent.execute({
        data: { operation: 'getPriorityQueue', flightKey },
      });
      expect(result.data.queue!.length).toBe(2);
    });

    it('sorted by priority descending', async () => {
      const flightKey = 'PQ2';
      await addEntry({ pnrRef: 'STD', flightKey, corporateTier: 'STANDARD', requestedCabin: 'Y' });
      await addEntry({ pnrRef: 'ELT', flightKey, corporateTier: 'ELITE', requestedCabin: 'F' });
      const result = await agent.execute({
        data: { operation: 'getPriorityQueue', flightKey },
      });
      const queue = result.data.queue!;
      expect(queue[0].priority).toBeGreaterThanOrEqual(queue[1].priority);
    });

    it('excludes non-WAITLISTED entries', async () => {
      const flightKey = 'PQ3';
      const entryId = await addEntry({ pnrRef: 'RM', flightKey });
      await addEntry({ pnrRef: 'KEEP', flightKey });
      await agent.execute({
        data: { operation: 'removeFromWaitlist', entryId },
      });
      const result = await agent.execute({
        data: { operation: 'getPriorityQueue', flightKey },
      });
      expect(result.data.queue!.length).toBe(1);
    });

    it('returns empty queue for unknown flight', async () => {
      const result = await agent.execute({
        data: { operation: 'getPriorityQueue', flightKey: 'UNKNOWN' },
      });
      expect(result.data.queue!.length).toBe(0);
    });
  });

  /* ---- Input validation ---- */
  describe('Input validation', () => {
    it('rejects unknown operation', async () => {
      await expect(
        agent.execute({
          data: { operation: 'unknown' as WaitlistManagementInput['operation'] },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects addToWaitlist without pnrRef', async () => {
      await expect(
        agent.execute({
          data: makeAddInput({ pnrRef: '' }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects addToWaitlist without segmentRef', async () => {
      await expect(
        agent.execute({
          data: makeAddInput({ segmentRef: '' }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects addToWaitlist without flightKey', async () => {
      await expect(
        agent.execute({
          data: makeAddInput({ flightKey: '' }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects getPosition without entryId', async () => {
      await expect(
        agent.execute({
          data: { operation: 'getPosition' },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects getPosition with unknown entryId', async () => {
      await expect(
        agent.execute({
          data: { operation: 'getPosition', entryId: 'nonexistent' },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects getPriorityQueue without flightKey', async () => {
      await expect(
        agent.execute({
          data: { operation: 'getPriorityQueue', flightKey: '' },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  /* ---- Metadata ---- */
  describe('Output metadata', () => {
    it('includes agent_id in metadata', async () => {
      const result = await agent.execute({ data: makeAddInput() });
      expect(result.metadata!['agent_id']).toBe('5.6');
    });

    it('includes operation in metadata', async () => {
      const result = await agent.execute({ data: makeAddInput() });
      expect(result.metadata!['operation']).toBe('addToWaitlist');
    });

    it('confidence is 1.0', async () => {
      const result = await agent.execute({ data: makeAddInput() });
      expect(result.confidence).toBe(1.0);
    });
  });
});
