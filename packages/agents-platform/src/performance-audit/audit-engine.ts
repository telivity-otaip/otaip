/**
 * Performance Audit — core computation logic (pure functions over events).
 *
 * Queries `agent.executed` events from the EventStore within the given
 * time window, then computes aggregate statistics and identifies degraded
 * agents.
 */

import type { EventStore, AgentExecutedEvent } from '@otaip/core';
import type { PerformanceAuditInput, PerformanceReport } from './types.js';

/** Error-rate threshold above which an agent is considered degraded. */
const DEGRADED_ERROR_RATE = 0.15;

/** p95 latency threshold (ms) above which an agent is considered degraded. */
const DEGRADED_P95_MS = 8_000;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

export async function computePerformanceReport(
  store: EventStore,
  input: PerformanceAuditInput,
): Promise<PerformanceReport> {
  const events = (await store.query({
    type: 'agent.executed',
    window: { from: input.time_window.from, to: input.time_window.to },
    ...(input.filters?.agent_id ? { agentId: input.filters.agent_id } : {}),
    ...(input.filters?.adapter_id ? { adapterId: input.filters.adapter_id } : {}),
  })) as AgentExecutedEvent[];

  if (events.length === 0) {
    return {
      total_executions: 0,
      success_rate: 0,
      avg_duration_ms: 0,
      p95_duration_ms: 0,
      p99_duration_ms: 0,
      error_rate: 0,
      degraded_agents: [],
    };
  }

  const totalExecutions = events.length;
  const successes = events.filter((e) => e.success).length;
  const successRate = successes / totalExecutions;
  const errorRate = 1 - successRate;

  const durations = events.map((e) => e.durationMs).sort((a, b) => a - b);
  const avgDurationMs = durations.reduce((s, v) => s + v, 0) / durations.length;
  const p95DurationMs = percentile(durations, 95);
  const p99DurationMs = percentile(durations, 99);

  // Per-agent degradation check.
  const byAgent = new Map<string, { total: number; failures: number; durations: number[] }>();
  for (const event of events) {
    let bucket = byAgent.get(event.agentId);
    if (!bucket) {
      bucket = { total: 0, failures: 0, durations: [] };
      byAgent.set(event.agentId, bucket);
    }
    bucket.total++;
    if (!event.success) bucket.failures++;
    bucket.durations.push(event.durationMs);
  }

  const degradedAgents: string[] = [];
  for (const [agentId, bucket] of byAgent) {
    const agentErrorRate = bucket.failures / bucket.total;
    const agentDurations = bucket.durations.sort((a, b) => a - b);
    const agentP95 = percentile(agentDurations, 95);
    if (agentErrorRate > DEGRADED_ERROR_RATE || agentP95 > DEGRADED_P95_MS) {
      degradedAgents.push(agentId);
    }
  }

  return {
    total_executions: totalExecutions,
    success_rate: successRate,
    avg_duration_ms: avgDurationMs,
    p95_duration_ms: p95DurationMs,
    p99_duration_ms: p99DurationMs,
    error_rate: errorRate,
    degraded_agents: degradedAgents.sort(),
  };
}
