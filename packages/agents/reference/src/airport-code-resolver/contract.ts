/**
 * Pipeline contract for AirportCodeResolver (Agent 0.1).
 *
 * This agent is a reference data source: the pipeline validator uses it
 * (indirectly, via `ReferenceDataProvider`) as the authority for airport
 * code semantic validation. Its confidence floor is 0.9 (the reference
 * agent floor), enforced automatically when the orchestrator is
 * configured with `referenceAgentIds` including '0.1'.
 */

import type { AgentContract, SemanticValidationResult } from '@otaip/core';
import {
  airportCodeResolverInputSchema,
  airportCodeResolverOutputSchema,
} from './schema.js';

async function validate(): Promise<SemanticValidationResult> {
  // Zod schema already enforces code shape (1..50 chars, enum code_type).
  // Deeper validity ("does this code exist?") IS the agent's job — checking
  // it in the contract would be circular. Pass.
  return { ok: true, warnings: [] };
}

export const airportCodeResolverContract: AgentContract<
  typeof airportCodeResolverInputSchema,
  typeof airportCodeResolverOutputSchema
> = {
  agentId: '0.1',
  inputSchema: airportCodeResolverInputSchema,
  outputSchema: airportCodeResolverOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.9,
  outputContract: ['match_confidence'],
  validate,
};
