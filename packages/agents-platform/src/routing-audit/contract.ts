/**
 * Pipeline contract for RoutingAudit (Agent 9.6).
 *
 * Read-only analytics agent — `actionType: 'query'`. Computes routing
 * decision and outcome metrics from the EventStore. No side effects.
 */

import type { AgentContract, SemanticValidationResult } from '@otaip/core';
import { routingAuditInputSchema, routingAuditOutputSchema } from './schema.js';

async function validate(): Promise<SemanticValidationResult> {
  return { ok: true, warnings: [] };
}

export const routingAuditContract: AgentContract<
  typeof routingAuditInputSchema,
  typeof routingAuditOutputSchema
> = {
  agentId: '9.6',
  inputSchema: routingAuditInputSchema,
  outputSchema: routingAuditOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.7,
  outputContract: ['total_decisions', 'success_rate', 'fallback_rate'],
  validate,
};
