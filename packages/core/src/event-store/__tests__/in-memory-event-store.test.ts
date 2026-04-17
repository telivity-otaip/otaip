import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEventStore } from '../in-memory.js';
import type { AgentExecutedEvent, OtaipEvent } from '../types.js';

function mkEvent(overrides: Partial<AgentExecutedEvent> & { eventId: string }): AgentExecutedEvent {
  return {
    type: 'agent.executed',
    timestamp: '2026-04-20T12:00:00Z',
    agentId: 'test',
    inputHash: 'abc',
    confidence: 1.0,
    durationMs: 50,
    success: true,
    gateResults: [{ gate: 'schema_in', passed: true }],
    ...overrides,
  };
}

describe('InMemoryEventStore', () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  it('appends and queries events', async () => {
    await store.append(mkEvent({ eventId: 'e1' }));
    await store.append(mkEvent({ eventId: 'e2', agentId: 'other' }));
    const all = await store.query({});
    expect(all).toHaveLength(2);
  });

  it('is idempotent on eventId', async () => {
    await store.append(mkEvent({ eventId: 'e1' }));
    await store.append(mkEvent({ eventId: 'e1' }));
    expect(store.size).toBe(1);
  });

  it('filters by type', async () => {
    await store.append(mkEvent({ eventId: 'e1' }));
    await store.append({
      eventId: 'e2',
      type: 'adapter.health',
      timestamp: '2026-04-20T12:00:01Z',
      adapterId: 'amadeus',
      status: 'healthy',
    });
    const agents = await store.query({ type: 'agent.executed' });
    expect(agents).toHaveLength(1);
  });

  it('filters by agentId', async () => {
    await store.append(mkEvent({ eventId: 'e1', agentId: 'a' }));
    await store.append(mkEvent({ eventId: 'e2', agentId: 'b' }));
    const result = await store.query({ agentId: 'a' });
    expect(result).toHaveLength(1);
    expect((result[0] as AgentExecutedEvent).agentId).toBe('a');
  });

  it('filters by sessionId', async () => {
    await store.append(mkEvent({ eventId: 'e1', sessionId: 's1' }));
    await store.append(mkEvent({ eventId: 'e2', sessionId: 's2' }));
    const result = await store.query({ sessionId: 's1' });
    expect(result).toHaveLength(1);
  });

  it('filters by time window', async () => {
    await store.append(mkEvent({ eventId: 'e1', timestamp: '2026-04-20T10:00:00Z' }));
    await store.append(mkEvent({ eventId: 'e2', timestamp: '2026-04-20T14:00:00Z' }));
    await store.append(mkEvent({ eventId: 'e3', timestamp: '2026-04-20T18:00:00Z' }));
    const result = await store.query({
      window: { from: '2026-04-20T12:00:00Z', to: '2026-04-20T16:00:00Z' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.eventId).toBe('e2');
  });

  it('respects limit', async () => {
    await store.append(mkEvent({ eventId: 'e1' }));
    await store.append(mkEvent({ eventId: 'e2' }));
    await store.append(mkEvent({ eventId: 'e3' }));
    const result = await store.query({ limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('aggregates durationMs with percentiles', async () => {
    for (let i = 0; i < 100; i++) {
      await store.append(
        mkEvent({
          eventId: `e${i}`,
          timestamp: '2026-04-20T12:00:00Z',
          durationMs: i + 1,
        }),
      );
    }
    const agg = await store.aggregate('durationMs', {
      from: '2026-04-20T00:00:00Z',
      to: '2026-04-21T00:00:00Z',
    });
    expect(agg.count).toBe(100);
    expect(agg.sum).toBe(5050);
    expect(agg.avg).toBeCloseTo(50.5, 1);
    expect(agg.min).toBe(1);
    expect(agg.max).toBe(100);
    expect(agg.p50).toBeCloseTo(50.5, 0);
    expect(agg.p95).toBeCloseTo(95.5, 0);
    expect(agg.p99).toBeCloseTo(99.5, 0);
  });

  it('returns zero-count aggregate when no events match', async () => {
    const agg = await store.aggregate('durationMs', {
      from: '2026-04-20T00:00:00Z',
      to: '2026-04-21T00:00:00Z',
    });
    expect(agg.count).toBe(0);
    expect(agg.sum).toBeUndefined();
  });

  it('clear() resets all state', async () => {
    await store.append(mkEvent({ eventId: 'e1' }));
    expect(store.size).toBe(1);
    store.clear();
    expect(store.size).toBe(0);
    // Re-append after clear works (idempotency set was also cleared).
    await store.append(mkEvent({ eventId: 'e1' }));
    expect(store.size).toBe(1);
  });
});
