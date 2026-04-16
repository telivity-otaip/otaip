/**
 * Pipeline contract for AirlineCodeMapper (Agent 0.2).
 */

import type { AgentContract, SemanticValidationResult } from '@otaip/core';
import {
  airlineCodeMapperInputSchema,
  airlineCodeMapperOutputSchema,
} from './schema.js';

async function validate(): Promise<SemanticValidationResult> {
  return { ok: true, warnings: [] };
}

export const airlineCodeMapperContract: AgentContract<
  typeof airlineCodeMapperInputSchema,
  typeof airlineCodeMapperOutputSchema
> = {
  agentId: '0.2',
  inputSchema: airlineCodeMapperInputSchema,
  outputSchema: airlineCodeMapperOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.9,
  outputContract: ['match_confidence'],
  validate,
};
