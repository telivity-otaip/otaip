/**
 * Pipeline contract for FareRuleAgent (Agent 2.1).
 *
 * Semantic validation: origin/destination must be valid airport codes;
 * carrier must be a known airline.
 */

import type {
  AgentContract,
  SemanticIssue,
  SemanticValidationResult,
  ValidationContext,
} from '@otaip/core';
import {
  resolveAirlineStrict,
  resolveAirportStrict,
  validateFutureDate,
} from '@otaip/core';
import { fareRuleInputSchema, fareRuleOutputSchema } from './schema.js';

async function validate(
  input: unknown,
  ctx: ValidationContext,
): Promise<SemanticValidationResult> {
  const data = input as {
    fare_basis: string;
    carrier: string;
    origin: string;
    destination: string;
    travel_date?: string;
  };
  const issues: SemanticIssue[] = [];

  issues.push(...(await resolveAirportStrict(data.origin, ctx.reference, ['origin'])));
  issues.push(
    ...(await resolveAirportStrict(data.destination, ctx.reference, ['destination'])),
  );
  issues.push(...(await resolveAirlineStrict(data.carrier, ctx.reference, ['carrier'])));

  if (data.travel_date !== undefined) {
    issues.push(...validateFutureDate(data.travel_date, ctx.now, ['travel_date']));
  }

  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return { ok: false, issues };
  return { ok: true, warnings: issues };
}

export const fareRuleAgentContract: AgentContract<
  typeof fareRuleInputSchema,
  typeof fareRuleOutputSchema
> = {
  agentId: '2.1',
  inputSchema: fareRuleInputSchema,
  outputSchema: fareRuleOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.7,
  outputContract: ['total_rules', 'valid_for_date', 'in_blackout'],
  validate,
};
