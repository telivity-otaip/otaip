/**
 * Alert — Types
 *
 * Agent 9.8: Queries EventStore events, computes metrics against
 * configurable thresholds, and produces alerts. Read-only analytics
 * — no side effects.
 */

export interface AlertThresholds {
  gds_error_rate_warning?: number;
  gds_error_rate_critical?: number;
  ndc_error_rate_warning?: number;
  ndc_error_rate_critical?: number;
  latency_p95_warning_ms?: number;
  consecutive_failures_critical?: number;
  pipeline_rejection_rate_warning?: number;
}

/** Default thresholds from the master plan. */
export const DEFAULT_THRESHOLDS: Required<AlertThresholds> = {
  gds_error_rate_warning: 0.05,
  gds_error_rate_critical: 0.15,
  ndc_error_rate_warning: 0.10,
  ndc_error_rate_critical: 0.25,
  latency_p95_warning_ms: 8_000,
  consecutive_failures_critical: 3,
  pipeline_rejection_rate_warning: 0.20,
};

export type AlertSeverityType = 'info' | 'warning' | 'critical';

export interface AlertItem {
  id: string;
  severity: AlertSeverityType;
  type: string;
  message: string;
  threshold: number;
  actual: number;
  triggered_at: string;
}

export interface AlertInput {
  time_window: {
    from: string;
    to: string;
  };
  thresholds?: AlertThresholds;
}

export interface AlertOutput {
  alerts: AlertItem[];
}
