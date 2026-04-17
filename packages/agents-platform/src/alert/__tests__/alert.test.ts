import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEventStore } from '@otaip/core';
import type { RoutingOutcomeEvent, AgentExecutedEvent } from '@otaip/core';
import { AlertAgent } from '../index.js';

let eventCounter = 0;

function makeOutcome(
  overrides: Partial<RoutingOutcomeEvent> = {},
): RoutingOutcomeEvent {
  return {
    eventId: `evt-o-${eventCounter++}`,
    type: 'routing.outcome',
    timestamp: '2026-04-01T10:00:00Z',
    channel: 'GDS',
    success: true,
    latencyMs: 300,
    ...overrides,
  };
}

function makeAgentEvent(
  overrides: Partial<AgentExecutedEvent> & { agentId: string },
): AgentExecutedEvent {
  return {
    eventId: `evt-a-${eventCounter++}`,
    type: 'agent.executed',
    timestamp: '2026-04-01T10:00:00Z',
    inputHash: 'abc',
    confidence: 0.95,
    durationMs: 200,
    success: true,
    gateResults: [],
    ...overrides,
  };
}

describe('AlertAgent (Agent 9.8)', () => {
  let store: InMemoryEventStore;
  let agent: AlertAgent;

  beforeEach(async () => {
    eventCounter = 0;
    store = new InMemoryEventStore();
    agent = new AlertAgent(store);
    await agent.initialize();
  });

  it('has correct id, name, version', () => {
    expect(agent.id).toBe('9.9');
    expect(agent.name).toBe('Alert');
    expect(agent.version).toBe('0.1.0');
  });

  it('returns no alerts when everything is healthy', async () => {
    for (let i = 0; i < 10; i++) {
      await store.append(makeOutcome({ channel: 'GDS', success: true }));
    }
    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });
    expect(result.data.alerts.length).toBe(0);
  });

  it('fires GDS error rate warning', async () => {
    // 10% failure > 5% warning threshold
    for (let i = 0; i < 9; i++) {
      await store.append(makeOutcome({ channel: 'GDS', success: true }));
    }
    await store.append(makeOutcome({ channel: 'GDS', success: false }));

    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });
    const gdsAlerts = result.data.alerts.filter((a) => a.type === 'gds_error_rate');
    expect(gdsAlerts.length).toBe(1);
    expect(gdsAlerts[0]!.severity).toBe('warning');
  });

  it('fires GDS error rate critical', async () => {
    // 50% failure > 15% critical threshold
    for (let i = 0; i < 5; i++) {
      await store.append(makeOutcome({ channel: 'GDS', success: true }));
    }
    for (let i = 0; i < 5; i++) {
      await store.append(makeOutcome({ channel: 'GDS', success: false }));
    }

    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });
    const gdsAlerts = result.data.alerts.filter((a) => a.type === 'gds_error_rate');
    expect(gdsAlerts.length).toBe(1);
    expect(gdsAlerts[0]!.severity).toBe('critical');
  });

  it('fires NDC error rate warning', async () => {
    // 15% > 10% warning
    for (let i = 0; i < 17; i++) {
      await store.append(makeOutcome({ channel: 'NDC', success: true }));
    }
    for (let i = 0; i < 3; i++) {
      await store.append(makeOutcome({ channel: 'NDC', success: false }));
    }

    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });
    const ndcAlerts = result.data.alerts.filter((a) => a.type === 'ndc_error_rate');
    expect(ndcAlerts.length).toBe(1);
    expect(ndcAlerts[0]!.severity).toBe('warning');
  });

  it('fires latency p95 warning', async () => {
    // All at 9000ms > 8000ms threshold
    for (let i = 0; i < 10; i++) {
      await store.append(makeOutcome({ channel: 'GDS', latencyMs: 9000 }));
    }

    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });
    const latencyAlerts = result.data.alerts.filter((a) => a.type === 'latency_p95');
    expect(latencyAlerts.length).toBe(1);
    expect(latencyAlerts[0]!.severity).toBe('warning');
  });

  it('fires consecutive failures critical', async () => {
    // 4 consecutive failures for agent 1.1
    for (let i = 0; i < 4; i++) {
      await store.append(
        makeAgentEvent({
          agentId: '1.1',
          success: false,
          timestamp: `2026-04-01T10:0${i}:00Z`,
        }),
      );
    }

    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });
    const consecAlerts = result.data.alerts.filter((a) => a.type === 'consecutive_failures');
    expect(consecAlerts.length).toBe(1);
    expect(consecAlerts[0]!.severity).toBe('critical');
  });

  it('fires pipeline rejection rate warning', async () => {
    // 5 out of 10 have gate failures → 50% > 20% threshold
    for (let i = 0; i < 5; i++) {
      await store.append(makeAgentEvent({ agentId: '1.1' }));
    }
    for (let i = 0; i < 5; i++) {
      await store.append(
        makeAgentEvent({
          agentId: '1.1',
          gateResults: [{ gate: 'schema_in', passed: false }],
        }),
      );
    }

    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });
    const rejAlerts = result.data.alerts.filter((a) => a.type === 'pipeline_rejection_rate');
    expect(rejAlerts.length).toBe(1);
  });

  it('respects custom thresholds', async () => {
    // 10% GDS error rate — default warning at 5%, set warning to 15% so no alert
    for (let i = 0; i < 9; i++) {
      await store.append(makeOutcome({ channel: 'GDS', success: true }));
    }
    await store.append(makeOutcome({ channel: 'GDS', success: false }));

    const result = await agent.execute({
      data: {
        time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' },
        thresholds: { gds_error_rate_warning: 0.15 },
      },
    });
    const gdsAlerts = result.data.alerts.filter((a) => a.type === 'gds_error_rate');
    expect(gdsAlerts.length).toBe(0);
  });

  it('throws before initialize', async () => {
    const uninit = new AlertAgent(store);
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

  it('confidence is always 1.0 (deterministic)', async () => {
    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });
    expect(result.confidence).toBe(1.0);
  });
});
