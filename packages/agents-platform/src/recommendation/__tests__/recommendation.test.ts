import { describe, expect, it, beforeEach } from 'vitest';
import { RecommendationAgent } from '../index.js';
import type { RecommendationInput } from '../types.js';
import type { PerformanceReport } from '../../performance-audit/types.js';
import type { RoutingReport } from '../../routing-audit/types.js';

function makePerf(overrides: Partial<PerformanceReport> = {}): { report: PerformanceReport } {
  return {
    report: {
      total_executions: 200,
      success_rate: 0.95,
      avg_duration_ms: 300,
      p95_duration_ms: 1500,
      p99_duration_ms: 3000,
      error_rate: 0.05,
      degraded_agents: [],
      ...overrides,
    },
  };
}

function makeRouting(overrides: Partial<RoutingReport> = {}): { report: RoutingReport } {
  return {
    report: {
      total_decisions: 100,
      success_rate: 0.9,
      fallback_rate: 0.1,
      channel_breakdown: {},
      ...overrides,
    },
  };
}

describe('RecommendationAgent (Agent 9.7)', () => {
  let agent: RecommendationAgent;

  beforeEach(async () => {
    agent = new RecommendationAgent();
    await agent.initialize();
  });

  it('has correct id, name, version', () => {
    expect(agent.id).toBe('9.8');
    expect(agent.name).toBe('Recommendation');
    expect(agent.version).toBe('0.1.0');
  });

  it('returns no recommendations when everything is healthy', async () => {
    const result = await agent.execute({
      data: { performance_report: makePerf(), routing_report: makeRouting() },
    });
    expect(result.data.recommendations.length).toBe(0);
  });

  it('produces critical recommendation for high error rate', async () => {
    const result = await agent.execute({
      data: {
        performance_report: makePerf({ error_rate: 0.25, success_rate: 0.75 }),
        routing_report: makeRouting(),
      },
    });
    const critical = result.data.recommendations.filter((r) => r.severity === 'critical');
    expect(critical.length).toBeGreaterThan(0);
    expect(critical[0]!.type).toBe('route_adjustment');
  });

  it('produces warning recommendation for elevated p95 latency', async () => {
    const result = await agent.execute({
      data: {
        performance_report: makePerf({ p95_duration_ms: 9000 }),
        routing_report: makeRouting(),
      },
    });
    const warnings = result.data.recommendations.filter(
      (r) => r.severity === 'warning' && r.type === 'adapter_health',
    );
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('produces recommendation for degraded agents', async () => {
    const result = await agent.execute({
      data: {
        performance_report: makePerf({ degraded_agents: ['1.1', '2.2'] }),
        routing_report: makeRouting(),
      },
    });
    const degraded = result.data.recommendations.filter(
      (r) => r.action.includes('degraded'),
    );
    expect(degraded.length).toBe(1);
  });

  it('produces critical recommendation for channel with high error rate', async () => {
    const result = await agent.execute({
      data: {
        performance_report: makePerf(),
        routing_report: makeRouting({
          channel_breakdown: {
            GDS: { decisions: 50, successes: 40, failures: 10 },
          },
        }),
      },
    });
    const channelRecs = result.data.recommendations.filter(
      (r) => r.type === 'route_adjustment' && r.action.includes('GDS'),
    );
    expect(channelRecs.length).toBeGreaterThan(0);
  });

  it('produces config_update recommendation for high fallback rate', async () => {
    const result = await agent.execute({
      data: {
        performance_report: makePerf(),
        routing_report: makeRouting({ fallback_rate: 0.5 }),
      },
    });
    const configRecs = result.data.recommendations.filter(
      (r) => r.type === 'config_update',
    );
    expect(configRecs.length).toBe(1);
  });

  it('all recommendations have auto_applicable: false', async () => {
    const result = await agent.execute({
      data: {
        performance_report: makePerf({ error_rate: 0.25, success_rate: 0.75, p95_duration_ms: 9000, degraded_agents: ['1.1'] }),
        routing_report: makeRouting({ fallback_rate: 0.5 }),
      },
    });
    for (const rec of result.data.recommendations) {
      expect(rec.auto_applicable).toBe(false);
    }
  });

  it('confidence varies with data volume', async () => {
    // High volume → 0.9
    const highVol = await agent.execute({
      data: {
        performance_report: makePerf({ total_executions: 200 }),
        routing_report: makeRouting({ total_decisions: 100 }),
      },
    });
    expect(highVol.confidence).toBe(0.9);

    // Low volume → 0.7
    const lowVol = await agent.execute({
      data: {
        performance_report: makePerf({ total_executions: 8 }),
        routing_report: makeRouting({ total_decisions: 5 }),
      },
    });
    expect(lowVol.confidence).toBe(0.7);

    // Very low volume → 0.5
    const veryLow = await agent.execute({
      data: {
        performance_report: makePerf({ total_executions: 3 }),
        routing_report: makeRouting({ total_decisions: 2 }),
      },
    });
    expect(veryLow.confidence).toBe(0.5);
  });

  it('throws before initialize', async () => {
    const uninit = new RecommendationAgent();
    await expect(
      uninit.execute({
        data: { performance_report: makePerf(), routing_report: makeRouting() },
      }),
    ).rejects.toThrow('not been initialized');
  });

  it('reports healthy after initialize', async () => {
    expect((await agent.health()).status).toBe('healthy');
  });
});
