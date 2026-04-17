/**
 * Pipeline contract for SelfServiceRebookingAgent (5.5).
 *
 * Read-only — this agent finds and prices alternatives but does NOT
 * execute the reissue. The actual REISSUE/REBOOK action is handled
 * by ExchangeReissue (5.2).
 */

import type {
  AgentContract,
  SemanticIssue,
  SemanticValidationResult,
  ValidationContext,
} from '@otaip/core';
import { resolveAirportStrict, validateFutureDate } from '@otaip/core';
import { rebookingInputSchema, rebookingOutputSchema } from './schema.js';

async function validate(
  input: unknown,
  ctx: ValidationContext,
): Promise<SemanticValidationResult> {
  const data = input as {
    newOrigin: string;
    newDestination: string;
    newDepartureDate: string;
  };
  const issues: SemanticIssue[] = [];

  issues.push(...(await resolveAirportStrict(data.newOrigin, ctx.reference, ['newOrigin'])));
  issues.push(
    ...(await resolveAirportStrict(data.newDestination, ctx.reference, ['newDestination'])),
  );
  issues.push(
    ...validateFutureDate(data.newDepartureDate, ctx.now, ['newDepartureDate']),
  );

  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return { ok: false, issues };
  return { ok: true, warnings: issues };
}

export const selfServiceRebookingContract: AgentContract<
  typeof rebookingInputSchema,
  typeof rebookingOutputSchema
> = {
  agentId: '5.5',
  inputSchema: rebookingInputSchema,
  outputSchema: rebookingOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.7,
  outputContract: ['alternatives', 'noAlternativesFound'],
  validate,
};
