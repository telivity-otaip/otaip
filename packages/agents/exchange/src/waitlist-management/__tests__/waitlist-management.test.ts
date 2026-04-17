import { describe, it, expect, beforeEach } from 'vitest';
import { WaitlistManagementAgent } from '../index.js';
import type {
  AddEntryInput,
  WaitlistSegment,
} from '../types.js';
import { computePriorityScore } from '../priority.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const SEG_BA100: WaitlistSegment = {
  carrier: 'BA',
  flightNumber: '100',
  departureDate: '2027-05-01',
  bookingClass: 'Y',
};

const SEG_BA200: WaitlistSegment = {
  carrier: 'BA',
  flightNumber: '200',
  departureDate: '2027-05-01',
  bookingClass: 'Y',
};

function mkAdd(overrides: Partial<AddEntryInput> & { entryId: string }): AddEntryInput {
  return {
    entryId: overrides.entryId,
    bookingReference: 'ABC123',
    segment: SEG_BA100,
    statusTier: 'general',
    fareClass: 'Y',
    fareClassType: 'discount',
    ...overrides,
  };
}

async function makeAgent(): Promise<WaitlistManagementAgent> {
  const a = new WaitlistManagementAgent();
  await a.initialize();
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('WaitlistManagementAgent (5.6)', () => {
  describe('addEntry', () => {
    it('stores an entry and returns computed priority score', async () => {
      const agent = await makeAgent();
      const r = await agent.execute({
        data: { operation: 'addEntry', addEntry: mkAdd({ entryId: 'e1' }) },
      });
      expect(r.data.operation).toBe('addEntry');
      expect(r.data.entry).toBeDefined();
      expect(r.data.entry!.priorityScore).toBeGreaterThan(0);
      expect(agent.size()).toBe(1);
    });

    it('rejects duplicate entryId', async () => {
      const agent = await makeAgent();
      await agent.execute({
        data: { operation: 'addEntry', addEntry: mkAdd({ entryId: 'dup' }) },
      });
      await expect(
        agent.execute({
          data: { operation: 'addEntry', addEntry: mkAdd({ entryId: 'dup' }) },
        }),
      ).rejects.toThrow(/Duplicate/);
    });

    it('validates segment carrier code', async () => {
      const agent = await makeAgent();
      await expect(
        agent.execute({
          data: {
            operation: 'addEntry',
            addEntry: mkAdd({
              entryId: 'x',
              segment: { ...SEG_BA100, carrier: 'TOOLONG' },
            }),
          },
        }),
      ).rejects.toThrow(/carrier/);
    });
  });

  describe('priority ordering', () => {
    it('platinum > gold > silver > general', async () => {
      const agent = await makeAgent();
      const now = new Date();
      const scores = {
        platinum: computePriorityScore({
          statusTier: 'platinum',
          fareClassType: 'discount',
          requestedAt: now.toISOString(),
          now,
        }),
        gold: computePriorityScore({
          statusTier: 'gold',
          fareClassType: 'discount',
          requestedAt: now.toISOString(),
          now,
        }),
        silver: computePriorityScore({
          statusTier: 'silver',
          fareClassType: 'discount',
          requestedAt: now.toISOString(),
          now,
        }),
        general: computePriorityScore({
          statusTier: 'general',
          fareClassType: 'discount',
          requestedAt: now.toISOString(),
          now,
        }),
      };
      expect(scores.platinum).toBeGreaterThan(scores.gold);
      expect(scores.gold).toBeGreaterThan(scores.silver);
      expect(scores.silver).toBeGreaterThan(scores.general);
      // Keep agent reference to satisfy linter — exercise it too.
      expect(agent.size()).toBe(0);
    });

    it('full_fare > discount within same status', async () => {
      const now = new Date();
      const full = computePriorityScore({
        statusTier: 'gold',
        fareClassType: 'full_fare',
        requestedAt: now.toISOString(),
        now,
      });
      const discount = computePriorityScore({
        statusTier: 'gold',
        fareClassType: 'discount',
        requestedAt: now.toISOString(),
        now,
      });
      expect(full).toBeGreaterThan(discount);
    });

    it('tie-break: earlier requestedAt wins on clear', async () => {
      const agent = await makeAgent();
      // Two identical-status/class entries, earlier one should clear first.
      const earlier = new Date('2027-01-01T00:00:00Z').toISOString();
      const later = new Date('2027-01-02T00:00:00Z').toISOString();
      await agent.execute({
        data: {
          operation: 'addEntry',
          addEntry: mkAdd({ entryId: 'later', requestedAt: later }),
        },
      });
      await agent.execute({
        data: {
          operation: 'addEntry',
          addEntry: mkAdd({ entryId: 'earlier', requestedAt: earlier }),
        },
      });
      const r = await agent.execute({
        data: { operation: 'clear', clear: { segment: SEG_BA100, seatsAvailable: 1 } },
      });
      expect(r.data.clearResult!.cleared[0]!.entryId).toBe('earlier');
    });

    it('recency bonus decays to 0 for requests older than 50 hours', async () => {
      const now = new Date('2027-01-03T00:00:00Z');
      const freshAt = new Date('2027-01-03T00:00:00Z').toISOString();
      const staleAt = new Date('2026-12-31T00:00:00Z').toISOString(); // 72h earlier
      const fresh = computePriorityScore({
        statusTier: 'general',
        fareClassType: 'discount',
        requestedAt: freshAt,
        now,
      });
      const stale = computePriorityScore({
        statusTier: 'general',
        fareClassType: 'discount',
        requestedAt: staleAt,
        now,
      });
      // Fresh: 100 + 20 + 50 = 170
      // Stale: 100 + 20 + 0  = 120 (recency bonus clamped at 0)
      expect(fresh).toBe(170);
      expect(stale).toBe(120);
    });
  });

  describe('clear', () => {
    it('with 1 seat clears the highest-priority entry', async () => {
      const agent = await makeAgent();
      await agent.execute({
        data: {
          operation: 'addEntry',
          addEntry: mkAdd({ entryId: 'general', statusTier: 'general' }),
        },
      });
      await agent.execute({
        data: {
          operation: 'addEntry',
          addEntry: mkAdd({ entryId: 'platinum', statusTier: 'platinum' }),
        },
      });
      const r = await agent.execute({
        data: { operation: 'clear', clear: { segment: SEG_BA100, seatsAvailable: 1 } },
      });
      expect(r.data.clearResult!.cleared.map((e) => e.entryId)).toEqual(['platinum']);
      expect(r.data.clearResult!.remaining.map((e) => e.entryId)).toEqual(['general']);
    });

    it('with N seats clears top N by priority', async () => {
      const agent = await makeAgent();
      for (const [id, status] of [
        ['g1', 'general'],
        ['p1', 'platinum'],
        ['s1', 'silver'],
        ['go1', 'gold'],
      ] as const) {
        await agent.execute({
          data: { operation: 'addEntry', addEntry: mkAdd({ entryId: id, statusTier: status }) },
        });
      }
      const r = await agent.execute({
        data: { operation: 'clear', clear: { segment: SEG_BA100, seatsAvailable: 3 } },
      });
      expect(r.data.clearResult!.cleared.map((e) => e.entryId)).toEqual(['p1', 'go1', 's1']);
      expect(r.data.clearResult!.remaining.map((e) => e.entryId)).toEqual(['g1']);
    });

    it('with more seats than entries clears all', async () => {
      const agent = await makeAgent();
      await agent.execute({
        data: { operation: 'addEntry', addEntry: mkAdd({ entryId: 'a' }) },
      });
      const r = await agent.execute({
        data: { operation: 'clear', clear: { segment: SEG_BA100, seatsAvailable: 10 } },
      });
      expect(r.data.clearResult!.cleared).toHaveLength(1);
      expect(r.data.clearResult!.remaining).toHaveLength(0);
    });

    it('clear on a different segment leaves this segment untouched', async () => {
      const agent = await makeAgent();
      await agent.execute({
        data: {
          operation: 'addEntry',
          addEntry: mkAdd({ entryId: 'on-ba100', segment: SEG_BA100 }),
        },
      });
      const r = await agent.execute({
        data: { operation: 'clear', clear: { segment: SEG_BA200, seatsAvailable: 5 } },
      });
      expect(r.data.clearResult!.cleared).toHaveLength(0);
      expect(agent.size()).toBe(1);
    });

    it('removes cleared entries from storage', async () => {
      const agent = await makeAgent();
      await agent.execute({
        data: { operation: 'addEntry', addEntry: mkAdd({ entryId: 'a' }) },
      });
      expect(agent.size()).toBe(1);
      await agent.execute({
        data: { operation: 'clear', clear: { segment: SEG_BA100, seatsAvailable: 1 } },
      });
      expect(agent.size()).toBe(0);
    });
  });

  describe('queryStatus', () => {
    it('returns 1-based position for known entry', async () => {
      const agent = await makeAgent();
      await agent.execute({
        data: {
          operation: 'addEntry',
          addEntry: mkAdd({ entryId: 'platinum-1', statusTier: 'platinum' }),
        },
      });
      await agent.execute({
        data: {
          operation: 'addEntry',
          addEntry: mkAdd({ entryId: 'general-1', statusTier: 'general' }),
        },
      });
      const r = await agent.execute({
        data: { operation: 'queryStatus', queryStatus: { entryId: 'general-1' } },
      });
      expect(r.data.statusResult!.position).toBe(2);
    });

    it('applies historicalClearanceRates override', async () => {
      const agent = await makeAgent();
      await agent.execute({
        data: { operation: 'addEntry', addEntry: mkAdd({ entryId: 'a' }) },
      });
      const r = await agent.execute({
        data: {
          operation: 'queryStatus',
          queryStatus: { entryId: 'a', historicalClearanceRates: { Y: 0.9 } },
        },
      });
      // Position 1, rate 0.9 → 0.9^1 = 0.9
      expect(r.data.statusResult!.estimatedClearanceProbability).toBeCloseTo(0.9, 5);
    });

    it('returns null fields for unknown entryId', async () => {
      const agent = await makeAgent();
      const r = await agent.execute({
        data: { operation: 'queryStatus', queryStatus: { entryId: 'does-not-exist' } },
      });
      expect(r.data.statusResult!.entry).toBeNull();
      expect(r.data.statusResult!.position).toBeNull();
      expect(r.data.statusResult!.estimatedClearanceProbability).toBeNull();
    });
  });

  describe('expire', () => {
    it('removes entries past their cutoff', async () => {
      const agent = await makeAgent();
      await agent.execute({
        data: {
          operation: 'addEntry',
          addEntry: mkAdd({
            entryId: 'soon',
            segment: { ...SEG_BA100, departureDate: '2027-05-01' },
            cutoffBeforeDepartureHours: 24,
          }),
        },
      });
      // Run expire at a time past the cutoff (departure 2027-05-01 UTC → cutoff 2027-04-30 UTC)
      const r = await agent.execute({
        data: { operation: 'expire', expire: { currentTime: '2027-04-30T12:00:00Z' } },
      });
      expect(r.data.expireResult!.expired).toHaveLength(1);
      expect(r.data.expireResult!.remaining).toBe(0);
      expect(agent.size()).toBe(0);
    });

    it('keeps entries still inside the cutoff window', async () => {
      const agent = await makeAgent();
      await agent.execute({
        data: {
          operation: 'addEntry',
          addEntry: mkAdd({
            entryId: 'future',
            segment: { ...SEG_BA100, departureDate: '2027-12-01' },
            cutoffBeforeDepartureHours: 24,
          }),
        },
      });
      const r = await agent.execute({
        data: { operation: 'expire', expire: { currentTime: '2027-01-01T00:00:00Z' } },
      });
      expect(r.data.expireResult!.expired).toHaveLength(0);
      expect(agent.size()).toBe(1);
    });
  });

  describe('validation + lifecycle', () => {
    it('throws on invalid operation', async () => {
      const agent = await makeAgent();
      await expect(
        // @ts-expect-error — intentionally invalid
        agent.execute({ data: { operation: 'launch_rocket' } }),
      ).rejects.toThrow(/operation/);
    });

    it('throws when addEntry payload missing', async () => {
      const agent = await makeAgent();
      await expect(agent.execute({ data: { operation: 'addEntry' } })).rejects.toThrow(
        /addEntry/,
      );
    });

    it('throws AgentNotInitializedError before initialize', async () => {
      const agent = new WaitlistManagementAgent();
      await expect(
        agent.execute({
          data: { operation: 'addEntry', addEntry: mkAdd({ entryId: 'x' }) },
        }),
      ).rejects.toThrow(/not been initialized/);
    });

    it('has correct id, name, version', () => {
      const agent = new WaitlistManagementAgent();
      expect(agent.id).toBe('5.6');
      expect(agent.name).toBe('Waitlist Management');
      expect(agent.version).toBe('0.2.0');
    });
  });
});
