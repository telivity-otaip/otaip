/**
 * Audit & Compliance — Types
 *
 * Agent 9.4: Audit trail, PII redaction, regulatory compliance.
 */

export type AuditOperation =
  | 'log_event' | 'query_audit_log' | 'flag_compliance_issue'
  | 'get_compliance_report' | 'redact_pii';

export type EventType =
  | 'agent_decision' | 'data_access' | 'booking_created'
  | 'ticket_issued' | 'refund_processed' | 'data_exported';

export type ComplianceIssueType =
  | 'gdpr_data_retention' | 'pci_data_exposure'
  | 'iata_audit_gap' | 'unauthorized_access';

export type ComplianceSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AuditLogEntry {
  event_id: string;
  timestamp: string;
  event_type: EventType;
  agent_id: string;
  user_id?: string;
  session_id?: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  pii_redacted: boolean;
  retention_days: number;
}

export interface ComplianceIssue {
  issue_id: string;
  issue_type: ComplianceIssueType;
  description: string;
  severity: ComplianceSeverity;
  affected_records: string[];
  flagged_at: string;
  resolved: boolean;
}

export interface ComplianceReport {
  total_events: number;
  events_with_pii: number;
  pii_redacted_count: number;
  open_issues: number;
  issues_by_severity: Record<ComplianceSeverity, number>;
  retention_summary: { booking: number; payment: number; personal: number };
}

export interface AuditInput {
  operation: AuditOperation;
  /** For log_event */
  event_type?: EventType;
  agent_id?: string;
  user_id?: string;
  session_id?: string;
  payload?: Record<string, unknown>;
  pii_present?: boolean;
  /** For query_audit_log */
  date_from?: string;
  date_to?: string;
  limit?: number;
  /** For flag_compliance_issue */
  issue_type?: ComplianceIssueType;
  description?: string;
  severity?: ComplianceSeverity;
  affected_records?: string[];
  /** For redact_pii */
  event_id?: string;
}

export interface AuditOutput {
  entry?: AuditLogEntry;
  entries?: AuditLogEntry[];
  issue?: ComplianceIssue;
  report?: ComplianceReport;
  message?: string;
}
