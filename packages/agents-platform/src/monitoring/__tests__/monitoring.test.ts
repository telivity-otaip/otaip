/**
 * Monitoring & Alerting — Unit Tests (Agent 9.3)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MonitoringAgent } from '../index.js';

let agent: MonitoringAgent;

beforeAll(async () => {
  agent = new MonitoringAgent();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

beforeEach(() => {
  agent.destroy();
  void agent.initialize();
});

async function recordMetrics(
  agentId: string,
  successes: number,
  errors: number,
  latencies: number[],
): Promise<void> {
  const ts = '2026-04-01T12:00:00Z';
  for (let i = 0; i < successes; i++) {
    await agent.execute({
      data: {
        operation: 'record_metric',
        agent_id: agentId,
        metric_type: 'success',
        timestamp: ts,
      },
    });
  }
  for (let i = 0; i < errors; i++) {
    await agent.execute({
      data: { operation: 'record_metric', agent_id: agentId, metric_type: 'error', timestamp: ts },
    });
  }
  for (const lat of latencies) {
    await agent.execute({
      data: {
        operation: 'record_metric',
        agent_id: agentId,
        metric_type: 'latency_ms',
        value: lat,
        timestamp: ts,
      },
    });
  }
}

describe('Monitoring & Alerting', () => {
  describe('record_metric', () => {
    it('records a metric', async () => {
      const res = await agent.execute({
        data: {
          operation: 'record_metric',
          agent_id: '1.1',
          metric_type: 'success',
          timestamp: '2026-04-01T12:00:00Z',
        },
      });
      expect(res.data.message).toBe('Metric recorded.');
    });

    it('rejects missing agent_id', async () => {
      await expect(
        agent.execute({ data: { operation: 'record_metric', metric_type: 'success' } }),
      ).rejects.toThrow('Invalid');
    });

    it('rejects missing metric_type', async () => {
      await expect(
        agent.execute({ data: { operation: 'record_metric', agent_id: '1.1' } }),
      ).rejects.toThrow('Invalid');
    });
  });

  describe('get_health', () => {
    it('returns healthy for low error rate and latency', async () => {
      await recordMetrics('1.1', 20, 0, [100, 150, 200, 120, 180]);
      const res = await agent.execute({
        data: { operation: 'get_health', current_datetime: '2026-04-01T12:01:00Z' },
      });
      const h = res.data.health!.find((a) => a.agent_id === '1.1');
      expect(h!.status).toBe('healthy');
      expect(h!.error_rate_percent).toBe(0);
    });

    it('returns degraded for error rate 5-20%', async () => {
      await recordMetrics('2.1', 8, 2, [100]); // 20% errors = at boundary, should be degraded
      const res = await agent.execute({
        data: { operation: 'get_health', current_datetime: '2026-04-01T12:01:00Z' },
      });
      const h = res.data.health!.find((a) => a.agent_id === '2.1');
      expect(h!.status).toBe('degraded');
    });

    it('returns down for error rate > 20%', async () => {
      await recordMetrics('3.1', 3, 7, [100]); // 70% error rate
      const res = await agent.execute({
        data: { operation: 'get_health', current_datetime: '2026-04-01T12:01:00Z' },
      });
      const h = res.data.health!.find((a) => a.agent_id === '3.1');
      expect(h!.status).toBe('down');
    });

    it('returns degraded for high p95 latency (2000-5000ms)', async () => {
      await recordMetrics('4.1', 10, 0, [100, 200, 300, 400, 500, 600, 700, 800, 900, 3000]);
      const res = await agent.execute({
        data: { operation: 'get_health', current_datetime: '2026-04-01T12:01:00Z' },
      });
      const h = res.data.health!.find((a) => a.agent_id === '4.1');
      expect(h!.status).toBe('degraded');
    });

    it('returns down for very high p95 latency (>5000ms)', async () => {
      await recordMetrics('5.1', 10, 0, [100, 200, 300, 400, 500, 600, 700, 800, 900, 6000]);
      const res = await agent.execute({
        data: { operation: 'get_health', current_datetime: '2026-04-01T12:01:00Z' },
      });
      const h = res.data.health!.find((a) => a.agent_id === '5.1');
      expect(h!.status).toBe('down');
    });

    it('calculates p50 and p95 latency', async () => {
      await recordMetrics('6.1', 10, 0, [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
      const res = await agent.execute({
        data: { operation: 'get_health', current_datetime: '2026-04-01T12:01:00Z' },
      });
      const h = res.data.health!.find((a) => a.agent_id === '6.1');
      expect(h!.p50_latency_ms).toBeGreaterThan(0);
      expect(h!.p95_latency_ms).toBeGreaterThan(h!.p50_latency_ms);
    });

    it('counts total calls', async () => {
      await recordMetrics('7.1', 15, 3, []);
      const res = await agent.execute({
        data: { operation: 'get_health', current_datetime: '2026-04-01T12:01:00Z' },
      });
      const h = res.data.health!.find((a) => a.agent_id === '7.1');
      expect(h!.total_calls).toBe(18);
    });
  });

  describe('Alerts', () => {
    it('fires alert when agent becomes degraded', async () => {
      await recordMetrics('A1', 8, 2, [100]);
      await agent.execute({
        data: { operation: 'get_health', current_datetime: '2026-04-01T12:01:00Z' },
      });
      const res = await agent.execute({ data: { operation: 'list_alerts' } });
      expect(res.data.alerts!.some((a) => a.agent_id === 'A1' && a.severity === 'warning')).toBe(
        true,
      );
    });

    it('fires critical alert when agent is down', async () => {
      await recordMetrics('A2', 3, 7, [100]);
      await agent.execute({
        data: { operation: 'get_health', current_datetime: '2026-04-01T12:01:00Z' },
      });
      const res = await agent.execute({ data: { operation: 'list_alerts' } });
      expect(res.data.alerts!.some((a) => a.agent_id === 'A2' && a.severity === 'critical')).toBe(
        true,
      );
    });

    it('does not fire duplicate alerts for same agent', async () => {
      await recordMetrics('A3', 8, 2, [100]);
      await agent.execute({
        data: { operation: 'get_health', current_datetime: '2026-04-01T12:01:00Z' },
      });
      await agent.execute({
        data: { operation: 'get_health', current_datetime: '2026-04-01T12:02:00Z' },
      });
      const res = await agent.execute({ data: { operation: 'list_alerts' } });
      const a3Alerts = res.data.alerts!.filter((a) => a.agent_id === 'A3');
      expect(a3Alerts.length).toBe(1);
    });

    it('acknowledges alert', async () => {
      await recordMetrics('A4', 3, 7, [100]);
      await agent.execute({
        data: { operation: 'get_health', current_datetime: '2026-04-01T12:01:00Z' },
      });
      const alertsRes = await agent.execute({ data: { operation: 'list_alerts' } });
      const alert = alertsRes.data.alerts!.find((a) => a.agent_id === 'A4');
      expect(alert).toBeDefined();

      await agent.execute({ data: { operation: 'acknowledge_alert', alert_id: alert!.alert_id } });
      const updated = await agent.execute({ data: { operation: 'list_alerts' } });
      const acked = updated.data.alerts!.find((a) => a.alert_id === alert!.alert_id);
      expect(acked!.acknowledged).toBe(true);
    });

    it('acknowledge is idempotent', async () => {
      await recordMetrics('A5', 3, 7, [100]);
      await agent.execute({
        data: { operation: 'get_health', current_datetime: '2026-04-01T12:01:00Z' },
      });
      const alertsRes = await agent.execute({ data: { operation: 'list_alerts' } });
      const alert = alertsRes.data.alerts!.find((a) => a.agent_id === 'A5');

      await agent.execute({ data: { operation: 'acknowledge_alert', alert_id: alert!.alert_id } });
      const res = await agent.execute({
        data: { operation: 'acknowledge_alert', alert_id: alert!.alert_id },
      });
      expect(res.data.message).toContain('acknowledged');
    });
  });

  describe('SLA report', () => {
    it('generates SLA report for period', async () => {
      await recordMetrics('S1', 20, 2, [100, 200, 300]);
      const res = await agent.execute({
        data: {
          operation: 'get_sla_report',
          date_from: '2026-04-01T00:00:00Z',
          date_to: '2026-04-02T00:00:00Z',
        },
      });
      const report = res.data.sla_report!.find((r) => r.agent_id === 'S1');
      expect(report).toBeDefined();
      expect(report!.availability_percent).toBeGreaterThan(0);
      expect(report!.total_calls).toBe(22);
    });

    it('filters by agent_ids', async () => {
      await recordMetrics('S2', 10, 0, [100]);
      await recordMetrics('S3', 10, 0, [100]);
      const res = await agent.execute({
        data: {
          operation: 'get_sla_report',
          date_from: '2026-04-01T00:00:00Z',
          date_to: '2026-04-02T00:00:00Z',
          agent_ids: ['S2'],
        },
      });
      expect(res.data.sla_report!.every((r) => r.agent_id === 'S2')).toBe(true);
    });

    it('rejects missing date range', async () => {
      await expect(agent.execute({ data: { operation: 'get_sla_report' } })).rejects.toThrow(
        'Invalid',
      );
    });
  });

  describe('Agent compliance', () => {
    it('has correct id/name', () => {
      expect(agent.id).toBe('9.3');
    });
    it('reports healthy', async () => {
      expect((await agent.health()).status).toBe('healthy');
    });
    it('throws when not initialized', async () => {
      const u = new MonitoringAgent();
      await expect(u.execute({ data: { operation: 'list_alerts' } })).rejects.toThrow(
        'not been initialized',
      );
    });
  });
});
