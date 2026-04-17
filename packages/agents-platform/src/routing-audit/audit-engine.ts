/**
 * Routing Audit — core computation logic (pure functions over events).
 *
 * Queries `routing.decided` and `routing.outcome` events, correlates them
 * by sessionId, and computes per-channel success rates plus fallback frequency.
 */

import type {
  EventStore,
  RoutingDecidedEvent,
  RoutingOutcomeEvent,
} from '@otaip/core';
import type { RoutingAuditInput, RoutingReport, ChannelStats } from './types.js';

export async function computeRoutingReport(
  store: EventStore,
  input: RoutingAuditInput,
): Promise<RoutingReport> {
  const window = { from: input.time_window.from, to: input.time_window.to };

  const decidedEvents = (await store.query({
    type: 'routing.decided',
    window,
  })) as RoutingDecidedEvent[];

  const outcomeEvents = (await store.query({
    type: 'routing.outcome',
    window,
  })) as RoutingOutcomeEvent[];

  if (decidedEvents.length === 0) {
    return {
      total_decisions: 0,
      success_rate: 0,
      fallback_rate: 0,
      channel_breakdown: {},
    };
  }

  // Index outcomes by sessionId for correlation.
  const outcomeBySession = new Map<string, RoutingOutcomeEvent>();
  for (const outcome of outcomeEvents) {
    if (outcome.sessionId) {
      outcomeBySession.set(outcome.sessionId, outcome);
    }
  }

  const channelBreakdown = new Map<string, ChannelStats>();
  let totalDecisions = 0;
  let totalSuccesses = 0;
  let totalFallbacks = 0;

  for (const decided of decidedEvents) {
    totalDecisions++;
    const channel = decided.channel;

    let stats = channelBreakdown.get(channel);
    if (!stats) {
      stats = { decisions: 0, successes: 0, failures: 0 };
      channelBreakdown.set(channel, stats);
    }
    stats.decisions++;

    // Check if this decision had a fallback chain.
    if (decided.fallbackChain && decided.fallbackChain.length > 0) {
      totalFallbacks++;
    }

    // Correlate with outcome by sessionId.
    if (decided.sessionId) {
      const outcome = outcomeBySession.get(decided.sessionId);
      if (outcome) {
        if (outcome.success) {
          stats.successes++;
          totalSuccesses++;
        } else {
          stats.failures++;
        }
      }
    }
  }

  const breakdownRecord: Record<string, ChannelStats> = {};
  for (const [ch, stats] of channelBreakdown) {
    breakdownRecord[ch] = stats;
  }

  return {
    total_decisions: totalDecisions,
    success_rate: totalDecisions > 0 ? totalSuccesses / totalDecisions : 0,
    fallback_rate: totalDecisions > 0 ? totalFallbacks / totalDecisions : 0,
    channel_breakdown: breakdownRecord,
  };
}
