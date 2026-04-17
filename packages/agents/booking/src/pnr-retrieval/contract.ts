/**
 * Pipeline contract for PnrRetrieval (Agent 3.8).
 *
 * Read-only agent — `actionType: 'query'`. Retrieves an existing PNR
 * by record locator. No side effects, no approval token needed.
 *
 * Semantic validation: record_locator format is enforced by Zod schema.
 * No reference-data lookup needed (record locators are opaque identifiers
 * — only the source system can confirm existence).
 */

import type { AgentContract, SemanticValidationResult } from '@otaip/core';
import { pnrRetrievalInputSchema, pnrRetrievalOutputSchema } from './schema.js';

async function validate(): Promise<SemanticValidationResult> {
  // Zod schema enforces format (5-8 uppercase alphanumeric).
  // Existence check requires the actual adapter call — that's the agent's job.
  return { ok: true, warnings: [] };
}

export const pnrRetrievalContract: AgentContract<
  typeof pnrRetrievalInputSchema,
  typeof pnrRetrievalOutputSchema
> = {
  agentId: '3.8',
  inputSchema: pnrRetrievalInputSchema,
  outputSchema: pnrRetrievalOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.7,
  outputContract: ['record_locator', 'booking_status', 'source'],
  validate,
};
