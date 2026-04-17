/**
 * Performance Audit — Types
 *
 * Agent 9.5: Aggregates agent execution metrics from the EventStore within
 * a given time window. Identifies degraded agents (high error rate or
 * elevated latency). Read-only analytics — no side effects.
 */

export interface PerformanceAuditInput {
  /** ISO 8601 time window to analyse. */
  time_window: {
    from: string;
    to: string;
  };
  /** Optional filters to narrow the audit scope. */
  filters?: {
    agent_id?: string;
    adapter_id?: string;
  };
}

export interface PerformanceReport {
  /** Total agent executions in the window. */
  total_executions: number;
  /** Fraction of successful executions (0–1). */
  success_rate: number;
  /** Mean execution duration in milliseconds. */
  avg_duration_ms: number;
  /** 95th-percentile execution duration in milliseconds. */
  p95_duration_ms: number;
  /** 99th-percentile execution duration in milliseconds. */
  p99_duration_ms: number;
  /** Fraction of failed executions (0–1). */
  error_rate: number;
  /** Agent IDs whose error rate exceeds 15 % or whose p95 exceeds 8 000 ms. */
  degraded_agents: string[];
}

export interface PerformanceAuditOutput {
  report: PerformanceReport;
}
