/**
 * Routing Audit — Types
 *
 * Agent 9.6: Analyses routing decisions and outcomes from the EventStore
 * within a given time window. Correlates `routing.decided` and
 * `routing.outcome` events by sessionId to compute per-channel success
 * rates and fallback frequency. Read-only analytics — no side effects.
 */

export interface RoutingAuditInput {
  /** ISO 8601 time window to analyse. */
  time_window: {
    from: string;
    to: string;
  };
}

export interface ChannelStats {
  decisions: number;
  successes: number;
  failures: number;
}

export interface RoutingReport {
  /** Total routing decisions in the window. */
  total_decisions: number;
  /** Fraction of routing decisions that led to a successful outcome (0–1). */
  success_rate: number;
  /** Fraction of routing decisions that triggered a fallback (0–1). */
  fallback_rate: number;
  /** Per-channel breakdown of decisions, successes, and failures. */
  channel_breakdown: Record<string, ChannelStats>;
}

export interface RoutingAuditOutput {
  report: RoutingReport;
}
