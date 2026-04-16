/**
 * Pipeline contract for OfferBuilderAgent (Agent 2.4).
 *
 * Semantic validation:
 *  - If operation is 'buildOffer', the build input must be present and its
 *    segments' carrier + origin/destination codes must resolve against the
 *    reference dataset.
 *  - 'getOffer'/'validateOffer'/'markUsed'/'expireOffer' require offerId.
 *
 * Output contract: the offerId is the primary cross-agent reference. The
 * pipeline's cross-agent checker will use it downstream (e.g., PnrBuilder
 * must reference an offerId that was produced here).
 */

import type {
  AgentContract,
  SemanticIssue,
  SemanticValidationResult,
  ValidationContext,
} from '@otaip/core';
import { resolveAirlineStrict, resolveAirportStrict } from '@otaip/core';
import { offerBuilderInputSchema, offerBuilderOutputSchema } from './schema.js';

interface BuildInput {
  segments: Array<{ carrier: string; origin: string; destination: string }>;
  passengerCount: number;
}

async function validate(
  input: unknown,
  ctx: ValidationContext,
): Promise<SemanticValidationResult> {
  const data = input as {
    operation: string;
    buildInput?: BuildInput;
    offerId?: string;
  };
  const issues: SemanticIssue[] = [];

  switch (data.operation) {
    case 'buildOffer': {
      if (!data.buildInput) {
        issues.push({
          code: 'BUILD_INPUT_REQUIRED',
          path: ['buildInput'],
          message: "operation 'buildOffer' requires a buildInput",
          severity: 'error',
        });
        break;
      }
      for (let i = 0; i < data.buildInput.segments.length; i++) {
        const seg = data.buildInput.segments[i];
        if (!seg) continue;
        issues.push(
          ...(await resolveAirportStrict(seg.origin, ctx.reference, [
            'buildInput',
            'segments',
            i,
            'origin',
          ])),
          ...(await resolveAirportStrict(seg.destination, ctx.reference, [
            'buildInput',
            'segments',
            i,
            'destination',
          ])),
          ...(await resolveAirlineStrict(seg.carrier, ctx.reference, [
            'buildInput',
            'segments',
            i,
            'carrier',
          ])),
        );
      }
      break;
    }
    case 'getOffer':
    case 'validateOffer':
    case 'markUsed':
    case 'expireOffer': {
      if (!data.offerId) {
        issues.push({
          code: 'OFFER_ID_REQUIRED',
          path: ['offerId'],
          message: `operation '${data.operation}' requires offerId`,
          severity: 'error',
        });
      }
      break;
    }
    case 'cleanExpired':
      // No extra validation needed.
      break;
  }

  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return { ok: false, issues };
  return { ok: true, warnings: issues };
}

export const offerBuilderAgentContract: AgentContract<
  typeof offerBuilderInputSchema,
  typeof offerBuilderOutputSchema
> = {
  agentId: '2.4',
  inputSchema: offerBuilderInputSchema,
  outputSchema: offerBuilderOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.7,
  outputContract: [],
  validate,
};
