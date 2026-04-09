/**
 * Audit & Compliance — Agent 9.4
 *
 * Audit trail, PII redaction, GDPR/PCI/IATA compliance.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  AuditInput,
  AuditOutput,
  AuditLogEntry,
  ComplianceIssue,
  ComplianceReport,
  ComplianceSeverity,
} from './types.js';

const PII_FIELDS = new Set(['passport_number', 'date_of_birth', 'credit_card', 'phone', 'email']);

const RETENTION_DAYS: Record<string, number> = {
  booking_created: 2555,
  ticket_issued: 2555,
  refund_processed: 2555,
  data_exported: 1095,
  agent_decision: 1095,
  data_access: 1095,
};

function simpleHash(obj: Record<string, unknown>): string {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (PII_FIELDS.has(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      redacted[key] = redactPayload(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export class AuditAgent implements Agent<AuditInput, AuditOutput> {
  readonly id = '9.4';
  readonly name = 'Audit & Compliance';
  readonly version = '0.1.0';

  private initialized = false;
  private log: AuditLogEntry[] = [];
  private issues = new Map<string, ComplianceIssue>();
  private nextEventId = 1;
  private nextIssueId = 1;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(input: AgentInput<AuditInput>): Promise<AgentOutput<AuditOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const d = input.data;

    switch (d.operation) {
      case 'log_event':
        return this.handleLogEvent(d);
      case 'query_audit_log':
        return this.handleQuery(d);
      case 'flag_compliance_issue':
        return this.handleFlag(d);
      case 'get_compliance_report':
        return this.handleReport();
      case 'redact_pii':
        return this.handleRedact(d);
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
    this.log = [];
    this.issues.clear();
    this.nextEventId = 1;
    this.nextIssueId = 1;
  }

  private handleLogEvent(d: AuditInput): AgentOutput<AuditOutput> {
    if (!d.event_type) throw new AgentInputValidationError(this.id, 'event_type', 'Required.');
    if (!d.agent_id) throw new AgentInputValidationError(this.id, 'agent_id', 'Required.');
    if (!d.payload) throw new AgentInputValidationError(this.id, 'payload', 'Required.');

    const piiPresent = d.pii_present ?? false;
    const payload = piiPresent ? redactPayload(d.payload) : d.payload;

    const entry: AuditLogEntry = {
      event_id: `EVT${String(this.nextEventId++).padStart(8, '0')}`,
      timestamp: new Date().toISOString(),
      event_type: d.event_type,
      agent_id: d.agent_id,
      user_id: d.user_id,
      session_id: d.session_id,
      payload,
      payload_hash: simpleHash(d.payload),
      pii_redacted: piiPresent,
      retention_days: RETENTION_DAYS[d.event_type] ?? 1095,
    };

    this.log.push(entry);

    return {
      data: { entry },
      confidence: 1.0,
      metadata: { agent_id: this.id },
    };
  }

  private handleQuery(d: AuditInput): AgentOutput<AuditOutput> {
    const limit = d.limit ?? 50;
    let filtered = this.log;

    if (d.event_type) filtered = filtered.filter((e) => e.event_type === d.event_type);
    if (d.agent_id) filtered = filtered.filter((e) => e.agent_id === d.agent_id);
    if (d.user_id) filtered = filtered.filter((e) => e.user_id === d.user_id);
    if (d.date_from) filtered = filtered.filter((e) => e.timestamp >= d.date_from!);
    if (d.date_to) filtered = filtered.filter((e) => e.timestamp <= d.date_to!);

    const entries = filtered.slice(0, limit);

    return {
      data: { entries },
      confidence: 1.0,
      metadata: { agent_id: this.id, total_results: entries.length },
    };
  }

  private handleFlag(d: AuditInput): AgentOutput<AuditOutput> {
    if (!d.issue_type) throw new AgentInputValidationError(this.id, 'issue_type', 'Required.');
    if (!d.description) throw new AgentInputValidationError(this.id, 'description', 'Required.');
    if (!d.severity) throw new AgentInputValidationError(this.id, 'severity', 'Required.');

    const issue: ComplianceIssue = {
      issue_id: `ISS${String(this.nextIssueId++).padStart(6, '0')}`,
      issue_type: d.issue_type,
      description: d.description,
      severity: d.severity,
      affected_records: d.affected_records ?? [],
      flagged_at: new Date().toISOString(),
      resolved: false,
    };

    this.issues.set(issue.issue_id, issue);

    return {
      data: { issue, message: 'Compliance issue flagged.' },
      confidence: 1.0,
      warnings: d.severity === 'critical' ? ['Critical compliance issue flagged.'] : undefined,
      metadata: { agent_id: this.id },
    };
  }

  private handleReport(): AgentOutput<AuditOutput> {
    const totalEvents = this.log.length;
    const eventsWithPii = this.log.filter((e) => e.pii_redacted).length;
    const openIssues = [...this.issues.values()].filter((i) => !i.resolved).length;

    const issuesBySeverity: Record<ComplianceSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    for (const issue of this.issues.values()) {
      if (!issue.resolved) issuesBySeverity[issue.severity]++;
    }

    const report: ComplianceReport = {
      total_events: totalEvents,
      events_with_pii: eventsWithPii,
      pii_redacted_count: eventsWithPii,
      open_issues: openIssues,
      issues_by_severity: issuesBySeverity,
      retention_summary: { booking: 2555, payment: 2555, personal: 1095 },
    };

    return { data: { report }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private handleRedact(d: AuditInput): AgentOutput<AuditOutput> {
    if (!d.event_id) throw new AgentInputValidationError(this.id, 'event_id', 'Required.');

    const entry = this.log.find((e) => e.event_id === d.event_id);
    if (!entry) throw new AgentInputValidationError(this.id, 'event_id', 'Event not found.');

    entry.payload = redactPayload(entry.payload);
    entry.pii_redacted = true;

    return {
      data: { entry, message: 'PII redacted from event.' },
      confidence: 1.0,
      metadata: { agent_id: this.id },
    };
  }
}

export type {
  AuditInput,
  AuditOutput,
  AuditLogEntry,
  ComplianceIssue,
  ComplianceReport,
  AuditOperation,
  EventType,
  ComplianceIssueType,
  ComplianceSeverity,
} from './types.js';
