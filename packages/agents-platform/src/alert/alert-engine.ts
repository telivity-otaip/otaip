/**
 * Alert — core computation logic (pure functions over events).
 *
 * Queries EventStore events, computes metrics, and checks them against
 * configurable thresholds to produce alerts.
 */

import type {
  EventStore,
  RoutingOutcomeEvent,
  AgentExecutedEvent,
} from '@otaip/core';
import type { AlertInput, AlertItem, AlertThresholds } from './types.js';
import { DEFAULT_THRESHOLDS } from './types.js';

let alertCounter = 0;

function makeId(): string {
  return `alert-${Date.now()}-${++alertCounter}`;
}

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

export async function computeAlerts(
  store: EventStore,
  input: AlertInput,
): Promise<AlertItem[]> {
  const t: Required<AlertThresholds> = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const window = { from: input.time_window.from, to: input.time_window.to };
  const now = new Date().toISOString();
  const alerts: AlertItem[] = [];

  // ── Channel error rates (routing outcomes) ──────────────────────────
  const outcomes = (await store.query({
    type: 'routing.outcome',
    window,
  })) as RoutingOutcomeEvent[];

  const channelStats = new Map<string, { total: number; failures: number }>();
  for (const o of outcomes) {
    let s = channelStats.get(o.channel);
    if (!s) {
      s = { total: 0, failures: 0 };
      channelStats.set(o.channel, s);
    }
    s.total++;
    if (!o.success) s.failures++;
  }

  for (const [channel, stats] of channelStats) {
    if (stats.total === 0) continue;
    const errorRate = stats.failures / stats.total;
    const upperChannel = channel.toUpperCase();

    if (upperChannel === 'GDS') {
      if (errorRate > t.gds_error_rate_critical) {
        alerts.push({
          id: makeId(),
          severity: 'critical',
          type: 'gds_error_rate',
          message: `GDS error rate ${(errorRate * 100).toFixed(1)}% exceeds critical threshold ${(t.gds_error_rate_critical * 100).toFixed(1)}%`,
          threshold: t.gds_error_rate_critical,
          actual: errorRate,
          triggered_at: now,
        });
      } else if (errorRate > t.gds_error_rate_warning) {
        alerts.push({
          id: makeId(),
          severity: 'warning',
          type: 'gds_error_rate',
          message: `GDS error rate ${(errorRate * 100).toFixed(1)}% exceeds warning threshold ${(t.gds_error_rate_warning * 100).toFixed(1)}%`,
          threshold: t.gds_error_rate_warning,
          actual: errorRate,
          triggered_at: now,
        });
      }
    }

    if (upperChannel === 'NDC') {
      if (errorRate > t.ndc_error_rate_critical) {
        alerts.push({
          id: makeId(),
          severity: 'critical',
          type: 'ndc_error_rate',
          message: `NDC error rate ${(errorRate * 100).toFixed(1)}% exceeds critical threshold ${(t.ndc_error_rate_critical * 100).toFixed(1)}%`,
          threshold: t.ndc_error_rate_critical,
          actual: errorRate,
          triggered_at: now,
        });
      } else if (errorRate > t.ndc_error_rate_warning) {
        alerts.push({
          id: makeId(),
          severity: 'warning',
          type: 'ndc_error_rate',
          message: `NDC error rate ${(errorRate * 100).toFixed(1)}% exceeds warning threshold ${(t.ndc_error_rate_warning * 100).toFixed(1)}%`,
          threshold: t.ndc_error_rate_warning,
          actual: errorRate,
          triggered_at: now,
        });
      }
    }
  }

  // ── Adapter latency p95 ─────────────────────────────────────────────
  const latencies = outcomes
    .filter((o) => typeof o.latencyMs === 'number')
    .map((o) => o.latencyMs)
    .sort((a, b) => a - b);

  if (latencies.length > 0) {
    const p95 = percentile(latencies, 95);
    if (p95 > t.latency_p95_warning_ms) {
      alerts.push({
        id: makeId(),
        severity: 'warning',
        type: 'latency_p95',
        message: `Adapter latency p95 ${p95.toFixed(0)}ms exceeds threshold ${t.latency_p95_warning_ms}ms`,
        threshold: t.latency_p95_warning_ms,
        actual: p95,
        triggered_at: now,
      });
    }
  }

  // ── Consecutive failures ────────────────────────────────────────────
  const agentEvents = (await store.query({
    type: 'agent.executed',
    window,
  })) as AgentExecutedEvent[];

  // Track consecutive failures per agent.
  const consecutiveByAgent = new Map<string, number>();
  const maxConsecutiveByAgent = new Map<string, number>();

  // Events are sorted by timestamp ascending.
  for (const e of agentEvents) {
    const prev = consecutiveByAgent.get(e.agentId) ?? 0;
    if (!e.success) {
      const next = prev + 1;
      consecutiveByAgent.set(e.agentId, next);
      const max = maxConsecutiveByAgent.get(e.agentId) ?? 0;
      if (next > max) maxConsecutiveByAgent.set(e.agentId, next);
    } else {
      consecutiveByAgent.set(e.agentId, 0);
    }
  }

  for (const [agentId, maxConsecutive] of maxConsecutiveByAgent) {
    if (maxConsecutive >= t.consecutive_failures_critical) {
      alerts.push({
        id: makeId(),
        severity: 'critical',
        type: 'consecutive_failures',
        message: `Agent ${agentId} had ${maxConsecutive} consecutive failures`,
        threshold: t.consecutive_failures_critical,
        actual: maxConsecutive,
        triggered_at: now,
      });
    }
  }

  // ── Pipeline rejection rate ─────────────────────────────────────────
  if (agentEvents.length > 0) {
    const rejections = agentEvents.filter((e) =>
      e.gateResults.some((g) => !g.passed),
    ).length;
    const rejectionRate = rejections / agentEvents.length;
    if (rejectionRate > t.pipeline_rejection_rate_warning) {
      alerts.push({
        id: makeId(),
        severity: 'warning',
        type: 'pipeline_rejection_rate',
        message: `Pipeline rejection rate ${(rejectionRate * 100).toFixed(1)}% exceeds threshold ${(t.pipeline_rejection_rate_warning * 100).toFixed(1)}%`,
        threshold: t.pipeline_rejection_rate_warning,
        actual: rejectionRate,
        triggered_at: now,
      });
    }
  }

  return alerts;
}
