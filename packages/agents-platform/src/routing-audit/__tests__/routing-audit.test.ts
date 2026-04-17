import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEventStore } from '@otaip/core';
import type { RoutingDecidedEvent, RoutingOutcomeEvent } from '@otaip/core';
import { RoutingAuditAgent } from '../index.js';

let eventCounter = 0;

function makeDecided(
  overrides: Partial<RoutingDecidedEvent> = {},
): RoutingDecidedEvent {
  return {
    eventId: `evt-d-${eventCounter++}`,
    type: 'routing.decided',
    timestamp: '2026-04-01T10:00:00Z',
    carrier: 'BA',
    channel: 'GDS',
    reasoning: 'default',
    confidence: 0.95,
    ...overrides,
  };
}

function makeOutcome(
  overrides: Partial<RoutingOutcomeEvent> = {},
): RoutingOutcomeEvent {
  return {
    eventId: `evt-o-${eventCounter++}`,
    type: 'routing.outcome',
    timestamp: '2026-04-01T10:00:01Z',
    channel: 'GDS',
    success: true,
    latencyMs: 300,
    ...overrides,
  };
}

describe('RoutingAuditAgent (Agent 9.6)', () => {
  let store: InMemoryEventStore;
  let agent: RoutingAuditAgent;

  beforeEach(async () => {
    eventCounter = 0;
    store = new InMemoryEventStore();
    agent = new RoutingAuditAgent(store);
    await agent.initialize();
  });

  it('has correct id, name, version', () => {
    expect(agent.id).toBe('9.6');
    expect(agent.name).toBe('Routing Audit');
    expect(agent.version).toBe('0.1.0');
  });

  it('returns empty report when no events exist', async () => {
    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });
    const r = result.data.report;
    expect(r.total_decisions).toBe(0);
    expect(r.success_rate).toBe(0);
    expect(r.fallback_rate).toBe(0);
    expect(r.channel_breakdown).toEqual({});
  });

  it('correlates decisions with outcomes by sessionId', async () => {
    await store.append(makeDecided({ sessionId: 's1', channel: 'GDS' }));
    await store.append(makeOutcome({ sessionId: 's1', channel: 'GDS', success: true }));

    await store.append(makeDecided({ sessionId: 's2', channel: 'NDC' }));
    await store.append(makeOutcome({ sessionId: 's2', channel: 'NDC', success: false }));

    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });
    const r = result.data.report;

    expect(r.total_decisions).toBe(2);
    expect(r.success_rate).toBe(0.5);
    expect(r.channel_breakdown['GDS']?.successes).toBe(1);
    expect(r.channel_breakdown['NDC']?.failures).toBe(1);
  });

  it('computes fallback rate from decisions with fallbackChain', async () => {
    await store.append(makeDecided({ sessionId: 's1', fallbackChain: ['NDC'] }));
    await store.append(makeDecided({ sessionId: 's2' }));

    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });

    expect(result.data.report.fallback_rate).toBe(0.5);
  });

  it('throws before initialize', async () => {
    const uninit = new RoutingAuditAgent(store);
    await expect(
      uninit.execute({
        data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
      }),
    ).rejects.toThrow('not been initialized');
  });

  it('rejects invalid time window', async () => {
    await expect(
      agent.execute({
        data: { time_window: { from: '2026-04-02T00:00:00Z', to: '2026-04-01T00:00:00Z' } },
      }),
    ).rejects.toThrow('time_window');
  });

  it('reports healthy after initialize', async () => {
    expect((await agent.health()).status).toBe('healthy');
  });
});
