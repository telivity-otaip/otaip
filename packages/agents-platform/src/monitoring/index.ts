/**
 * Monitoring & Alerting — Agent 9.3
 *
 * Tracks agent health, API latency, error rates, SLA compliance.
 */

import type {
  Agent, AgentInput, AgentOutput, AgentHealthStatus,
} from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  MonitoringInput, MonitoringOutput,
  MetricEntry, AgentHealth, Alert, SlaReport, AgentStatus,
} from './types.js';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

export class MonitoringAgent
  implements Agent<MonitoringInput, MonitoringOutput>
{
  readonly id = '9.3';
  readonly name = 'Monitoring & Alerting';
  readonly version = '0.1.0';

  private initialized = false;
  private metrics: MetricEntry[] = [];
  private alerts = new Map<string, Alert>();
  private nextAlertId = 1;

  async initialize(): Promise<void> { this.initialized = true; }

  async execute(
    input: AgentInput<MonitoringInput>,
  ): Promise<AgentOutput<MonitoringOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const d = input.data;

    switch (d.operation) {
      case 'record_metric': return this.handleRecord(d);
      case 'get_health': return this.handleGetHealth(d);
      case 'list_alerts': return this.handleListAlerts();
      case 'acknowledge_alert': return this.handleAcknowledge(d);
      case 'get_sla_report': return this.handleSlaReport(d);
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Invalid operation.');
    }
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
    this.metrics = [];
    this.alerts.clear();
    this.nextAlertId = 1;
  }

  private handleRecord(d: MonitoringInput): AgentOutput<MonitoringOutput> {
    if (!d.agent_id) throw new AgentInputValidationError(this.id, 'agent_id', 'Required.');
    if (!d.metric_type) throw new AgentInputValidationError(this.id, 'metric_type', 'Required.');

    const entry: MetricEntry = {
      agent_id: d.agent_id,
      metric_type: d.metric_type,
      value: d.value,
      timestamp: d.timestamp ?? new Date().toISOString(),
    };
    this.metrics.push(entry);

    return {
      data: { message: 'Metric recorded.' },
      confidence: 1.0,
      metadata: { agent_id: this.id },
    };
  }

  private handleGetHealth(d: MonitoringInput): AgentOutput<MonitoringOutput> {
    const now = d.current_datetime ? new Date(d.current_datetime) : new Date();
    const agentIds = new Set(this.metrics.map((m) => m.agent_id));
    const healthList: AgentHealth[] = [];

    for (const agentId of agentIds) {
      const agentMetrics = this.metrics.filter((m) => m.agent_id === agentId);
      const latencies = agentMetrics
        .filter((m) => m.metric_type === 'latency_ms' && m.value != null)
        .map((m) => m.value!)
        .sort((a, b) => a - b);

      const successes = agentMetrics.filter((m) => m.metric_type === 'success').length;
      const errors = agentMetrics.filter((m) => m.metric_type === 'error').length;
      const timeouts = agentMetrics.filter((m) => m.metric_type === 'timeout').length;
      const totalCalls = successes + errors + timeouts;
      const errorRate = totalCalls > 0 ? ((errors + timeouts) / totalCalls) * 100 : 0;

      const lastEntry = agentMetrics[agentMetrics.length - 1];
      const lastSeen = lastEntry?.timestamp ?? '';
      const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : 0;
      const timeSinceLastSeen = now.getTime() - lastSeenMs;

      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);

      let status: AgentStatus = 'healthy';
      if (errorRate > 20 || p95 > 5000 || timeSinceLastSeen > FIVE_MINUTES_MS) {
        status = 'down';
      } else if (errorRate >= 5 || p95 >= 2000) {
        status = 'degraded';
      }

      // Fire alert on status transition
      if (status === 'degraded' || status === 'down') {
        const existingAlert = [...this.alerts.values()].find(
          (a) => a.agent_id === agentId && !a.acknowledged,
        );
        if (!existingAlert) {
          const alertId = `ALT${String(this.nextAlertId++).padStart(6, '0')}`;
          this.alerts.set(alertId, {
            alert_id: alertId,
            agent_id: agentId,
            severity: status === 'down' ? 'critical' : 'warning',
            reason: `Agent ${agentId} is ${status}. Error rate: ${errorRate.toFixed(1)}%, P95: ${p95}ms.`,
            fired_at: now.toISOString(),
            acknowledged: false,
          });
        }
      }

      healthList.push({
        agent_id: agentId,
        status,
        p50_latency_ms: p50,
        p95_latency_ms: p95,
        error_rate_percent: Math.round(errorRate * 10) / 10,
        total_calls: totalCalls,
        last_seen: lastSeen,
      });
    }

    return {
      data: { health: healthList },
      confidence: 1.0,
      metadata: { agent_id: this.id, agents_monitored: healthList.length },
    };
  }

  private handleListAlerts(): AgentOutput<MonitoringOutput> {
    return {
      data: { alerts: [...this.alerts.values()] },
      confidence: 1.0,
      metadata: { agent_id: this.id, alert_count: this.alerts.size },
    };
  }

  private handleAcknowledge(d: MonitoringInput): AgentOutput<MonitoringOutput> {
    if (!d.alert_id) throw new AgentInputValidationError(this.id, 'alert_id', 'Required.');
    const alert = this.alerts.get(d.alert_id);
    if (!alert) throw new AgentInputValidationError(this.id, 'alert_id', 'Alert not found.');

    alert.acknowledged = true;
    alert.acknowledged_at = d.current_datetime ?? new Date().toISOString();

    return {
      data: { message: `Alert ${d.alert_id} acknowledged.` },
      confidence: 1.0,
      metadata: { agent_id: this.id },
    };
  }

  private handleSlaReport(d: MonitoringInput): AgentOutput<MonitoringOutput> {
    if (!d.date_from || !d.date_to) {
      throw new AgentInputValidationError(this.id, 'date_from/date_to', 'Required.');
    }

    const filtered = this.metrics.filter((m) => {
      if (m.timestamp < d.date_from! || m.timestamp > d.date_to!) return false;
      if (d.agent_ids && !d.agent_ids.includes(m.agent_id)) return false;
      return true;
    });

    const byAgent = new Map<string, MetricEntry[]>();
    for (const m of filtered) {
      const list = byAgent.get(m.agent_id) ?? [];
      list.push(m);
      byAgent.set(m.agent_id, list);
    }

    const report: SlaReport[] = [];
    for (const [agentId, metrics] of byAgent) {
      const successes = metrics.filter((m) => m.metric_type === 'success').length;
      const errors = metrics.filter((m) => m.metric_type === 'error').length;
      const timeouts = metrics.filter((m) => m.metric_type === 'timeout').length;
      const total = successes + errors + timeouts;
      const availability = total > 0 ? (successes / total) * 100 : 100;
      const latencies = metrics.filter((m) => m.metric_type === 'latency_ms' && m.value != null).map((m) => m.value!).sort((a, b) => a - b);

      report.push({
        agent_id: agentId,
        availability_percent: Math.round(availability * 10) / 10,
        p95_latency_ms: percentile(latencies, 95),
        error_count: errors + timeouts,
        total_calls: total,
      });
    }

    return {
      data: { sla_report: report },
      confidence: 1.0,
      metadata: { agent_id: this.id, agents_in_report: report.length },
    };
  }
}

export type {
  MonitoringInput, MonitoringOutput,
  MetricEntry, AgentHealth, Alert, SlaReport,
  MonitoringOperation, MetricType, AgentStatus, AlertSeverity,
} from './types.js';
