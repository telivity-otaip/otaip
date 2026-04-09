/**
 * Audit & Compliance — Unit Tests (Agent 9.4)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AuditAgent } from '../index.js';
import type { AuditInput } from '../types.js';

let agent: AuditAgent;

beforeAll(async () => {
  agent = new AuditAgent();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});
beforeEach(() => {
  agent.destroy();
  void agent.initialize();
});

function logEvent(overrides: Partial<AuditInput> = {}): AuditInput {
  return {
    operation: 'log_event',
    event_type: 'booking_created',
    agent_id: '3.2',
    user_id: 'USR001',
    session_id: 'SESS001',
    payload: { record_locator: 'ABC123', passenger: 'SMITH/JOHN', amount: '570.00' },
    ...overrides,
  };
}

describe('Audit & Compliance', () => {
  describe('log_event', () => {
    it('logs event with generated ID', async () => {
      const res = await agent.execute({ data: logEvent() });
      expect(res.data.entry!.event_id).toMatch(/^EVT\d{8}$/);
      expect(res.data.entry!.event_type).toBe('booking_created');
    });

    it('stores payload_hash', async () => {
      const res = await agent.execute({ data: logEvent() });
      expect(res.data.entry!.payload_hash.length).toBeGreaterThan(0);
    });

    it('sets retention_days for booking events (7 years)', async () => {
      const res = await agent.execute({ data: logEvent() });
      expect(res.data.entry!.retention_days).toBe(2555);
    });

    it('sets retention_days for data access (3 years)', async () => {
      const res = await agent.execute({ data: logEvent({ event_type: 'data_access' }) });
      expect(res.data.entry!.retention_days).toBe(1095);
    });

    it('rejects missing event_type', async () => {
      await expect(
        agent.execute({ data: { operation: 'log_event', agent_id: '3.2', payload: {} } }),
      ).rejects.toThrow('Invalid');
    });

    it('rejects missing payload', async () => {
      await expect(
        agent.execute({
          data: { operation: 'log_event', event_type: 'booking_created', agent_id: '3.2' },
        }),
      ).rejects.toThrow('Invalid');
    });
  });

  describe('PII redaction', () => {
    it('redacts PII fields when pii_present=true', async () => {
      const res = await agent.execute({
        data: logEvent({
          payload: { passport_number: 'A12345', email: 'john@example.com', name: 'SMITH' },
          pii_present: true,
        }),
      });
      expect(res.data.entry!.payload['passport_number']).toBe('[REDACTED]');
      expect(res.data.entry!.payload['email']).toBe('[REDACTED]');
      expect(res.data.entry!.payload['name']).toBe('SMITH'); // not a PII field
      expect(res.data.entry!.pii_redacted).toBe(true);
    });

    it('does not redact when pii_present=false', async () => {
      const res = await agent.execute({
        data: logEvent({
          payload: { passport_number: 'A12345' },
          pii_present: false,
        }),
      });
      expect(res.data.entry!.payload['passport_number']).toBe('A12345');
    });

    it('redacts nested PII fields', async () => {
      const res = await agent.execute({
        data: logEvent({
          payload: { traveler: { email: 'test@test.com', name: 'DOE' } },
          pii_present: true,
        }),
      });
      const traveler = res.data.entry!.payload['traveler'] as Record<string, unknown>;
      expect(traveler['email']).toBe('[REDACTED]');
      expect(traveler['name']).toBe('DOE');
    });

    it('redact_pii operation redacts already-logged event', async () => {
      const logRes = await agent.execute({
        data: logEvent({
          payload: { email: 'test@test.com', data: 'safe' },
        }),
      });
      const eventId = logRes.data.entry!.event_id;

      const redactRes = await agent.execute({
        data: { operation: 'redact_pii', event_id: eventId },
      });
      expect(redactRes.data.entry!.pii_redacted).toBe(true);
      expect(redactRes.data.entry!.payload['email']).toBe('[REDACTED]');
    });

    it('redact_pii rejects unknown event_id', async () => {
      await expect(
        agent.execute({ data: { operation: 'redact_pii', event_id: 'NONEXIST' } }),
      ).rejects.toThrow('not found');
    });
  });

  describe('query_audit_log', () => {
    it('queries all events', async () => {
      await agent.execute({ data: logEvent() });
      await agent.execute({ data: logEvent({ event_type: 'ticket_issued', agent_id: '4.1' }) });
      const res = await agent.execute({ data: { operation: 'query_audit_log' } });
      expect(res.data.entries!.length).toBe(2);
    });

    it('filters by event_type', async () => {
      await agent.execute({ data: logEvent() });
      await agent.execute({ data: logEvent({ event_type: 'ticket_issued', agent_id: '4.1' }) });
      const res = await agent.execute({
        data: { operation: 'query_audit_log', event_type: 'ticket_issued' },
      });
      expect(res.data.entries!.length).toBe(1);
    });

    it('filters by agent_id', async () => {
      await agent.execute({ data: logEvent() });
      await agent.execute({ data: logEvent({ agent_id: '4.1' }) });
      const res = await agent.execute({ data: { operation: 'query_audit_log', agent_id: '4.1' } });
      expect(res.data.entries!.length).toBe(1);
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) await agent.execute({ data: logEvent() });
      const res = await agent.execute({ data: { operation: 'query_audit_log', limit: 3 } });
      expect(res.data.entries!.length).toBe(3);
    });
  });

  describe('flag_compliance_issue', () => {
    it('creates compliance issue', async () => {
      const res = await agent.execute({
        data: {
          operation: 'flag_compliance_issue',
          issue_type: 'gdpr_data_retention',
          description: 'PII data older than 3 years.',
          severity: 'high',
          affected_records: ['EVT001'],
        },
      });
      expect(res.data.issue!.issue_id).toMatch(/^ISS\d{6}$/);
      expect(res.data.issue!.resolved).toBe(false);
    });

    it('warns on critical severity', async () => {
      const res = await agent.execute({
        data: {
          operation: 'flag_compliance_issue',
          issue_type: 'pci_data_exposure',
          description: 'Credit card data exposed.',
          severity: 'critical',
        },
      });
      expect(res.warnings).toBeDefined();
    });

    it('rejects missing fields', async () => {
      await expect(
        agent.execute({
          data: { operation: 'flag_compliance_issue', description: 'test', severity: 'low' },
        }),
      ).rejects.toThrow('Invalid');
    });
  });

  describe('get_compliance_report', () => {
    it('generates compliance report', async () => {
      await agent.execute({ data: logEvent({ pii_present: true }) });
      await agent.execute({ data: logEvent() });
      await agent.execute({
        data: {
          operation: 'flag_compliance_issue',
          issue_type: 'iata_audit_gap',
          description: 'Missing audit.',
          severity: 'medium',
        },
      });

      const res = await agent.execute({ data: { operation: 'get_compliance_report' } });
      expect(res.data.report!.total_events).toBe(2);
      expect(res.data.report!.events_with_pii).toBe(1);
      expect(res.data.report!.open_issues).toBe(1);
      expect(res.data.report!.retention_summary.booking).toBe(2555);
      expect(res.data.report!.retention_summary.personal).toBe(1095);
    });
  });

  describe('Agent compliance', () => {
    it('has correct id/name', () => {
      expect(agent.id).toBe('9.4');
      expect(agent.name).toBe('Audit & Compliance');
    });
    it('reports healthy', async () => {
      expect((await agent.health()).status).toBe('healthy');
    });
    it('throws when not initialized', async () => {
      const u = new AuditAgent();
      await expect(u.execute({ data: logEvent() })).rejects.toThrow('not been initialized');
    });
  });
});
