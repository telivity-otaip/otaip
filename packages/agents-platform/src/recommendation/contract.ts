/**
 * Pipeline contract for Recommendation (Agent 9.7).
 *
 * Read-only analytics agent — `actionType: 'query'`. Produces deterministic
 * recommendations from performance and routing audit reports. No side effects.
 */

import type { AgentContract, SemanticValidationResult } from '@otaip/core';
import { recommendationInputSchema, recommendationOutputSchema } from './schema.js';

async function validate(): Promise<SemanticValidationResult> {
  return { ok: true, warnings: [] };
}

export const recommendationContract: AgentContract<
  typeof recommendationInputSchema,
  typeof recommendationOutputSchema
> = {
  agentId: '9.7',
  inputSchema: recommendationInputSchema,
  outputSchema: recommendationOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.7,
  outputContract: ['recommendations'],
  validate,
};
