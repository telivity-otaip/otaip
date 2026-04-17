/**
 * Pipeline contract for PerformanceAudit (Agent 9.5).
 *
 * Read-only analytics agent — `actionType: 'query'`. Computes aggregate
 * performance metrics from the EventStore. No side effects.
 */

import type { AgentContract, SemanticValidationResult } from '@otaip/core';
import { performanceAuditInputSchema, performanceAuditOutputSchema } from './schema.js';

async function validate(): Promise<SemanticValidationResult> {
  // Time window format is enforced by Zod. No domain-specific checks needed.
  return { ok: true, warnings: [] };
}

export const performanceAuditContract: AgentContract<
  typeof performanceAuditInputSchema,
  typeof performanceAuditOutputSchema
> = {
  agentId: '9.5',
  inputSchema: performanceAuditInputSchema,
  outputSchema: performanceAuditOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.7,
  outputContract: ['total_executions', 'success_rate', 'error_rate'],
  validate,
};
