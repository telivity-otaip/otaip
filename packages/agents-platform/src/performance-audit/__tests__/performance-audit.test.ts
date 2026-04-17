import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEventStore } from '@otaip/core';
import type { AgentExecutedEvent } from '@otaip/core';
import { PerformanceAuditAgent } from '../index.js';

function makeEvent(
  overrides: Partial<AgentExecutedEvent> & { agentId: string },
): AgentExecutedEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2, 10)}`,
    type: 'agent.executed',
    timestamp: '2026-04-01T10:00:00Z',
    inputHash: 'abc123',
    confidence: 0.95,
    durationMs: 200,
    success: true,
    gateResults: [],
    ...overrides,
  };
}

describe('PerformanceAuditAgent (Agent 9.5)', () => {
  let store: InMemoryEventStore;
  let agent: PerformanceAuditAgent;

  beforeEach(async () => {
    store = new InMemoryEventStore();
    agent = new PerformanceAuditAgent(store);
    await agent.initialize();
  });

  it('has correct id, name, version', () => {
    expect(agent.id).toBe('9.5');
    expect(agent.name).toBe('Performance Audit');
    expect(agent.version).toBe('0.1.0');
  });

  it('returns empty report when no events exist', async () => {
    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });
    expect(result.data.report.total_executions).toBe(0);
    expect(result.data.report.success_rate).toBe(0);
    expect(result.data.report.error_rate).toBe(0);
    expect(result.confidence).toBe(1.0);
  });

  it('computes aggregate metrics over agent.executed events', async () => {
    // 8 successes, 2 failures → 80% success, 20% error
    for (let i = 0; i < 8; i++) {
      await store.append(makeEvent({ agentId: '1.1', durationMs: 100 + i * 10 }));
    }
    for (let i = 0; i < 2; i++) {
      await store.append(makeEvent({ agentId: '1.1', durationMs: 500, success: false }));
    }

    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });

    const r = result.data.report;
    expect(r.total_executions).toBe(10);
    expect(r.success_rate).toBe(0.8);
    expect(r.error_rate).toBeCloseTo(0.2);
    expect(r.avg_duration_ms).toBeGreaterThan(0);
    expect(r.p95_duration_ms).toBeGreaterThan(0);
    expect(r.p99_duration_ms).toBeGreaterThan(0);
  });

  it('identifies degraded agents by error rate', async () => {
    // Agent A: 100% success
    for (let i = 0; i < 5; i++) {
      await store.append(makeEvent({ agentId: 'A', durationMs: 100 }));
    }
    // Agent B: 50% failure → degraded
    for (let i = 0; i < 5; i++) {
      await store.append(makeEvent({ agentId: 'B', durationMs: 100, success: i < 2 }));
    }

    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });

    expect(result.data.report.degraded_agents).toContain('B');
    expect(result.data.report.degraded_agents).not.toContain('A');
  });

  it('identifies degraded agents by high p95 latency', async () => {
    // Agent C: all requests > 8000ms
    for (let i = 0; i < 5; i++) {
      await store.append(makeEvent({ agentId: 'C', durationMs: 9000 }));
    }

    const result = await agent.execute({
      data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
    });

    expect(result.data.report.degraded_agents).toContain('C');
  });

  it('respects agent_id filter', async () => {
    await store.append(makeEvent({ agentId: '1.1', durationMs: 100 }));
    await store.append(makeEvent({ agentId: '2.2', durationMs: 200 }));

    const result = await agent.execute({
      data: {
        time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' },
        filters: { agent_id: '1.1' },
      },
    });

    expect(result.data.report.total_executions).toBe(1);
  });

  it('throws before initialize', async () => {
    const uninit = new PerformanceAuditAgent(store);
    await expect(
      uninit.execute({
        data: { time_window: { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' } },
      }),
    ).rejects.toThrow('not been initialized');
  });

  it('rejects invalid time window (from >= to)', async () => {
    await expect(
      agent.execute({
        data: { time_window: { from: '2026-04-02T00:00:00Z', to: '2026-04-01T00:00:00Z' } },
      }),
    ).rejects.toThrow('time_window');
  });

  it('reports healthy after initialize', async () => {
    const health = await agent.health();
    expect(health.status).toBe('healthy');
  });

  it('reports unhealthy before initialize', async () => {
    const uninit = new PerformanceAuditAgent(store);
    const health = await uninit.health();
    expect(health.status).toBe('unhealthy');
  });
});
