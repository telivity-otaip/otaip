/**
 * Pipeline contract for Alert (Agent 9.8).
 *
 * Read-only analytics agent — `actionType: 'query'`. Computes metrics
 * against configurable thresholds and produces alerts. No side effects.
 */

import type { AgentContract, SemanticValidationResult } from '@otaip/core';
import { alertInputSchema, alertOutputSchema } from './schema.js';

async function validate(): Promise<SemanticValidationResult> {
  return { ok: true, warnings: [] };
}

export const alertContract: AgentContract<
  typeof alertInputSchema,
  typeof alertOutputSchema
> = {
  agentId: '9.8',
  inputSchema: alertInputSchema,
  outputSchema: alertOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.7,
  outputContract: ['alerts'],
  validate,
};
