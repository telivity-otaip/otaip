/**
 * Monitoring & Alerting — Types
 *
 * Agent 9.3: Agent health, latency, error rates, SLA compliance.
 */

export type MonitoringOperation =
  | 'record_metric'
  | 'get_health'
  | 'list_alerts'
  | 'acknowledge_alert'
  | 'get_sla_report';

export type MetricType = 'latency_ms' | 'error' | 'success' | 'timeout';

export type AgentStatus = 'healthy' | 'degraded' | 'down';

export type AlertSeverity = 'warning' | 'critical';

export interface MetricEntry {
  agent_id: string;
  metric_type: MetricType;
  value?: number;
  timestamp: string;
}

export interface AgentHealth {
  agent_id: string;
  status: AgentStatus;
  p50_latency_ms: number;
  p95_latency_ms: number;
  error_rate_percent: number;
  total_calls: number;
  last_seen: string;
}

export interface Alert {
  alert_id: string;
  agent_id: string;
  severity: AlertSeverity;
  reason: string;
  fired_at: string;
  acknowledged: boolean;
  acknowledged_at?: string;
}

export interface SlaReport {
  agent_id: string;
  availability_percent: number;
  p95_latency_ms: number;
  error_count: number;
  total_calls: number;
}

export interface MonitoringInput {
  operation: MonitoringOperation;
  /** For record_metric */
  agent_id?: string;
  metric_type?: MetricType;
  value?: number;
  timestamp?: string;
  /** For acknowledge_alert */
  alert_id?: string;
  /** For get_sla_report */
  date_from?: string;
  date_to?: string;
  agent_ids?: string[];
  /** For get_health */
  current_datetime?: string;
}

export interface MonitoringOutput {
  health?: AgentHealth[];
  alerts?: Alert[];
  sla_report?: SlaReport[];
  message?: string;
}
