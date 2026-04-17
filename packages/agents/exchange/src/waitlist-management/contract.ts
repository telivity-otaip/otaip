/**
 * Pipeline contract for WaitlistManagementAgent (5.6).
 *
 * mutation_reversible: addEntry, clear, and expire all mutate the
 * in-memory queue. Removing a cleared entry can be undone by
 * re-adding it; this is not irreversible (unlike ticketing).
 *
 * queryStatus is read-only but the contract covers the whole agent.
 */

import type { AgentContract, SemanticValidationResult } from '@otaip/core';
import { waitlistInputSchema, waitlistOutputSchema } from './schema.js';

async function validate(): Promise<SemanticValidationResult> {
  // Zod .refine() already enforces operation-specific input presence.
  // No cross-field semantic checks required beyond schema validation.
  return { ok: true, warnings: [] };
}

export const waitlistManagementContract: AgentContract<
  typeof waitlistInputSchema,
  typeof waitlistOutputSchema
> = {
  agentId: '5.6',
  inputSchema: waitlistInputSchema,
  outputSchema: waitlistOutputSchema,
  actionType: 'mutation_reversible',
  confidenceThreshold: 0.9,
  outputContract: ['entryId', 'operation'],
  validate,
};
