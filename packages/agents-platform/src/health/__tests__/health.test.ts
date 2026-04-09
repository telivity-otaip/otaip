import { describe, it, expect, vi } from 'vitest';
import { PlatformHealthAggregator } from '../index.js';
import type { Agent, AgentHealthStatus, AgentInput, AgentOutput } from '@otaip/core';

function mockAgent(name: string, health: AgentHealthStatus): Agent<unknown, unknown> {
  return {
    id: name,
    name,
    version: '0.1.0',
    initialize: vi.fn(),
    execute: vi.fn() as (input: AgentInput<unknown>) => Promise<AgentOutput<unknown>>,
    health: vi.fn().mockResolvedValue(health),
    destroy: vi.fn(),
  } as unknown as Agent<unknown, unknown>;
}

describe('PlatformHealthAggregator', () => {
  it('reports healthy when all agents are healthy', async () => {
    const agents = new Map<string, Agent<unknown, unknown>>([
      ['agent-a', mockAgent('a', { status: 'healthy' })],
      ['agent-b', mockAgent('b', { status: 'healthy' })],
    ]);
    const aggregator = new PlatformHealthAggregator(agents);
    const result = await aggregator.check();

    expect(result.status).toBe('healthy');
    expect(result.degradedCount).toBe(0);
    expect(result.unhealthyCount).toBe(0);
    expect(result.totalCount).toBe(2);
  });

  it('reports degraded when any agent is degraded', async () => {
    const agents = new Map<string, Agent<unknown, unknown>>([
      ['agent-a', mockAgent('a', { status: 'healthy' })],
      ['agent-b', mockAgent('b', { status: 'degraded', details: 'slow' })],
    ]);
    const aggregator = new PlatformHealthAggregator(agents);
    const result = await aggregator.check();

    expect(result.status).toBe('degraded');
    expect(result.degradedCount).toBe(1);
  });

  it('reports unhealthy when any agent is unhealthy', async () => {
    const agents = new Map<string, Agent<unknown, unknown>>([
      ['agent-a', mockAgent('a', { status: 'healthy' })],
      ['agent-b', mockAgent('b', { status: 'unhealthy', details: 'down' })],
    ]);
    const aggregator = new PlatformHealthAggregator(agents);
    const result = await aggregator.check();

    expect(result.status).toBe('unhealthy');
    expect(result.unhealthyCount).toBe(1);
  });

  it('handles agent health check errors gracefully', async () => {
    const failingAgent = mockAgent('fail', { status: 'healthy' });
    (failingAgent.health as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('crash'));

    const agents = new Map<string, Agent<unknown, unknown>>([['fail-agent', failingAgent]]);
    const aggregator = new PlatformHealthAggregator(agents);
    const result = await aggregator.check();

    expect(result.status).toBe('unhealthy');
    expect(result.agents['fail-agent']!.details).toContain('crash');
  });

  it('checks individual agent by name', async () => {
    const agents = new Map<string, Agent<unknown, unknown>>([
      ['agent-a', mockAgent('a', { status: 'healthy' })],
    ]);
    const aggregator = new PlatformHealthAggregator(agents);

    const health = await aggregator.checkAgent('agent-a');
    expect(health.status).toBe('healthy');
  });

  it('returns unhealthy for unknown agent', async () => {
    const agents = new Map<string, Agent<unknown, unknown>>();
    const aggregator = new PlatformHealthAggregator(agents);

    const health = await aggregator.checkAgent('nonexistent');
    expect(health.status).toBe('unhealthy');
    expect(health.details).toContain('not registered');
  });

  it('includes timestamp', async () => {
    const agents = new Map<string, Agent<unknown, unknown>>();
    const aggregator = new PlatformHealthAggregator(agents);
    const result = await aggregator.check();

    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('handles empty agent map', async () => {
    const agents = new Map<string, Agent<unknown, unknown>>();
    const aggregator = new PlatformHealthAggregator(agents);
    const result = await aggregator.check();

    expect(result.status).toBe('healthy');
    expect(result.totalCount).toBe(0);
  });
});
