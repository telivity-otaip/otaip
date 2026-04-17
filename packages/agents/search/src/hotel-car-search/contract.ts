/**
 * Pipeline contract for HotelCarSearchAgent (Agent 1.7).
 *
 * Read-only aggregator — `actionType: 'query'`. Zod schema enforces
 * shape + operation-specific input presence; validate() is a pass-through
 * since unknown/missing adapters surface in the `adapterSummary` output,
 * not as pipeline errors.
 */

import type { AgentContract, SemanticValidationResult } from '@otaip/core';
import {
  hotelCarSearchInputSchema,
  hotelCarSearchOutputSchema,
} from './schema.js';

async function validate(): Promise<SemanticValidationResult> {
  return { ok: true, warnings: [] };
}

export const hotelCarSearchAgentContract: AgentContract<
  typeof hotelCarSearchInputSchema,
  typeof hotelCarSearchOutputSchema
> = {
  agentId: '1.7',
  inputSchema: hotelCarSearchInputSchema,
  outputSchema: hotelCarSearchOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.7,
  outputContract: ['hotelResults', 'carResults'],
  validate,
};
