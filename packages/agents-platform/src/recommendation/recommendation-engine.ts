/**
 * Recommendation — core rule engine (pure functions over report data).
 *
 * Deterministic rules that evaluate performance and routing reports and
 * produce actionable recommendations. All recommendations are
 * `auto_applicable: false` in v1.
 */

import type { PerformanceReport } from '../performance-audit/types.js';
import type { RoutingReport } from '../routing-audit/types.js';
import type { Recommendation, RecommendationInput } from './types.js';

/**
 * Compute confidence based on data volume.
 * >100 executions → 0.9, >10 → 0.7, else 0.5
 */
function dataConfidence(totalEvents: number): number {
  if (totalEvents > 100) return 0.9;
  if (totalEvents > 10) return 0.7;
  return 0.5;
}

function analysePerformance(
  report: PerformanceReport,
  confidence: number,
): Recommendation[] {
  const recs: Recommendation[] = [];

  // High overall error rate.
  if (report.error_rate > 0.15) {
    recs.push({
      type: 'route_adjustment',
      severity: 'critical',
      confidence,
      action: `Overall error rate is ${(report.error_rate * 100).toFixed(1)}% — review failing agents and consider re-routing traffic.`,
      supporting_data: `error_rate=${report.error_rate}, total_executions=${report.total_executions}`,
      auto_applicable: false,
    });
  } else if (report.error_rate > 0.05) {
    recs.push({
      type: 'route_adjustment',
      severity: 'warning',
      confidence,
      action: `Overall error rate is ${(report.error_rate * 100).toFixed(1)}% — monitor closely.`,
      supporting_data: `error_rate=${report.error_rate}, total_executions=${report.total_executions}`,
      auto_applicable: false,
    });
  }

  // High p95 latency.
  if (report.p95_duration_ms > 8_000) {
    recs.push({
      type: 'adapter_health',
      severity: 'warning',
      confidence,
      action: `p95 latency is ${report.p95_duration_ms.toFixed(0)}ms — investigate slow adapters.`,
      supporting_data: `p95_duration_ms=${report.p95_duration_ms}, avg_duration_ms=${report.avg_duration_ms}`,
      auto_applicable: false,
    });
  }

  // Degraded agents.
  if (report.degraded_agents.length > 0) {
    recs.push({
      type: 'adapter_health',
      severity: 'warning',
      confidence,
      action: `${report.degraded_agents.length} degraded agent(s) detected: ${report.degraded_agents.join(', ')}`,
      supporting_data: `degraded_agents=[${report.degraded_agents.join(', ')}]`,
      auto_applicable: false,
    });
  }

  return recs;
}

function analyseRouting(
  report: RoutingReport,
  confidence: number,
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Per-channel error rates.
  for (const [channel, stats] of Object.entries(report.channel_breakdown)) {
    if (stats.decisions === 0) continue;
    const channelErrorRate = stats.failures / stats.decisions;

    if (channelErrorRate > 0.15) {
      recs.push({
        type: 'route_adjustment',
        severity: 'critical',
        confidence,
        action: `Channel ${channel} error rate is ${(channelErrorRate * 100).toFixed(1)}% — consider routing traffic away.`,
        supporting_data: `channel=${channel}, decisions=${stats.decisions}, failures=${stats.failures}`,
        auto_applicable: false,
      });
    } else if (channelErrorRate > 0.05) {
      recs.push({
        type: 'route_adjustment',
        severity: 'warning',
        confidence,
        action: `Channel ${channel} error rate is ${(channelErrorRate * 100).toFixed(1)}% — monitor closely.`,
        supporting_data: `channel=${channel}, decisions=${stats.decisions}, failures=${stats.failures}`,
        auto_applicable: false,
      });
    }
  }

  // High fallback rate.
  if (report.fallback_rate > 0.3) {
    recs.push({
      type: 'config_update',
      severity: 'warning',
      confidence,
      action: `Fallback rate is ${(report.fallback_rate * 100).toFixed(1)}% — primary channels may need reconfiguration.`,
      supporting_data: `fallback_rate=${report.fallback_rate}, total_decisions=${report.total_decisions}`,
      auto_applicable: false,
    });
  }

  return recs;
}

export function computeRecommendations(input: RecommendationInput): Recommendation[] {
  const totalEvents =
    input.performance_report.report.total_executions +
    input.routing_report.report.total_decisions;
  const confidence = dataConfidence(totalEvents);

  const recs: Recommendation[] = [
    ...analysePerformance(input.performance_report.report, confidence),
    ...analyseRouting(input.routing_report.report, confidence),
  ];

  return recs;
}
