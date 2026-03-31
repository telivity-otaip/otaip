/**
 * @otaip/agents-platform — Stage 9 infrastructure agents.
 *
 * Re-exports all Stage 9 agent classes.
 */

export { OrchestratorAgent } from './orchestrator/index.js';
export type {
  OrchestratorInput, OrchestratorOutput,
  WorkflowStep, StepExecutor, WorkflowName, WorkflowOptions, StepStatus,
} from './orchestrator/index.js';

export { KnowledgeAgent } from './knowledge/index.js';
export type {
  KnowledgeInput, KnowledgeOutput,
  KnowledgeDocument, KnowledgeResult, KnowledgeTopic, KnowledgeOperation,
} from './knowledge/index.js';

export { MonitoringAgent } from './monitoring/index.js';
export type {
  MonitoringInput, MonitoringOutput,
  MetricEntry, AgentHealth, Alert, SlaReport,
  MonitoringOperation, MetricType, AgentStatus, AlertSeverity,
} from './monitoring/index.js';

export { AuditAgent } from './audit/index.js';
export type {
  AuditInput, AuditOutput,
  AuditLogEntry, ComplianceIssue, ComplianceReport,
  AuditOperation, EventType, ComplianceIssueType, ComplianceSeverity,
} from './audit/index.js';

export { PluginManagerAgent } from './plugin-manager/index.js';
export type {
  PluginInput, PluginOutput,
  Plugin, PluginCapability, PluginOperation,
} from './plugin-manager/index.js';
