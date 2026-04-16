/**
 * Pipeline contract for FareBasisDecoder (Agent 0.3).
 *
 * Fare basis decoding is heuristic — ATPCO codes may contain components the
 * decoder can't parse. `match_confidence` reflects that. We keep the
 * reference-agent floor (0.9) so that partial decodes (confidence < 0.9)
 * surface to the caller rather than silently producing weak results.
 */

import type { AgentContract, SemanticValidationResult } from '@otaip/core';
import {
  fareBasisDecoderInputSchema,
  fareBasisDecoderOutputSchema,
} from './schema.js';

async function validate(): Promise<SemanticValidationResult> {
  return { ok: true, warnings: [] };
}

export const fareBasisDecoderContract: AgentContract<
  typeof fareBasisDecoderInputSchema,
  typeof fareBasisDecoderOutputSchema
> = {
  agentId: '0.3',
  inputSchema: fareBasisDecoderInputSchema,
  outputSchema: fareBasisDecoderOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.9,
  outputContract: ['match_confidence'],
  validate,
};
