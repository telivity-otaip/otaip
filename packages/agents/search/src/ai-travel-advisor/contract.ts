/**
 * Pipeline contract for AITravelAdvisorAgent (1.8).
 *
 * Read-only orchestrator. Semantic validation: origin/destination
 * must resolve to real airports, departureDate must not be in the
 * past.
 */

import type {
  AgentContract,
  SemanticIssue,
  SemanticValidationResult,
  ValidationContext,
} from '@otaip/core';
import { resolveAirportStrict, validateFutureDate } from '@otaip/core';
import { advisorInputSchema, advisorOutputSchema } from './schema.js';

async function validate(
  input: unknown,
  ctx: ValidationContext,
): Promise<SemanticValidationResult> {
  const data = input as {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
  };
  const issues: SemanticIssue[] = [];

  issues.push(...(await resolveAirportStrict(data.origin, ctx.reference, ['origin'])));
  issues.push(
    ...(await resolveAirportStrict(data.destination, ctx.reference, ['destination'])),
  );
  issues.push(...validateFutureDate(data.departureDate, ctx.now, ['departureDate']));
  if (data.returnDate !== undefined) {
    issues.push(...validateFutureDate(data.returnDate, ctx.now, ['returnDate']));
  }

  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return { ok: false, issues };
  return { ok: true, warnings: issues };
}

export const aiTravelAdvisorContract: AgentContract<
  typeof advisorInputSchema,
  typeof advisorOutputSchema
> = {
  agentId: '1.8',
  inputSchema: advisorInputSchema,
  outputSchema: advisorOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.7,
  outputContract: ['recommendations', 'searchSummary'],
  validate,
};
