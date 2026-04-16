/**
 * Pipeline contract for AvailabilitySearch (Agent 1.1).
 *
 * Semantic validation:
 *  - origin/destination must resolve to a known airport (via ReferenceDataProvider)
 *  - departure_date must not be in the past
 *  - return_date (if present) must be >= departure_date
 *
 * Output contract: offer ids, price, and passenger composition — these
 * are the fields downstream agents (pricing, booking) will reference.
 */

import type {
  AgentContract,
  SemanticIssue,
  SemanticValidationResult,
  ValidationContext,
} from '@otaip/core';
import {
  resolveAirportStrict,
  validateFutureDate,
} from '@otaip/core';
import {
  availabilitySearchInputSchema,
  availabilitySearchOutputSchema,
} from './schema.js';

async function validate(
  input: unknown,
  ctx: ValidationContext,
): Promise<SemanticValidationResult> {
  // Input has already passed the Zod schema_in gate by the time validate() runs.
  const data = input as {
    origin: string;
    destination: string;
    departure_date: string;
    return_date?: string;
  };
  const issues: SemanticIssue[] = [];

  issues.push(...(await resolveAirportStrict(data.origin, ctx.reference, ['origin'])));
  issues.push(
    ...(await resolveAirportStrict(data.destination, ctx.reference, ['destination'])),
  );

  if (data.origin === data.destination) {
    issues.push({
      code: 'ORIGIN_EQUALS_DESTINATION',
      path: ['destination'],
      message: `Origin and destination must differ (both '${data.origin}')`,
      severity: 'error',
    });
  }

  issues.push(...validateFutureDate(data.departure_date, ctx.now, ['departure_date']));
  if (data.return_date !== undefined) {
    issues.push(...validateFutureDate(data.return_date, ctx.now, ['return_date']));
    if (Date.parse(data.return_date) < Date.parse(data.departure_date)) {
      issues.push({
        code: 'RETURN_BEFORE_DEPARTURE',
        path: ['return_date'],
        message: `return_date '${data.return_date}' is before departure_date '${data.departure_date}'`,
        severity: 'error',
      });
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return { ok: false, issues };
  return { ok: true, warnings: issues };
}

export const availabilitySearchContract: AgentContract<
  typeof availabilitySearchInputSchema,
  typeof availabilitySearchOutputSchema
> = {
  agentId: '1.1',
  inputSchema: availabilitySearchInputSchema,
  outputSchema: availabilitySearchOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.7,
  outputContract: ['offers', 'total_raw_offers', 'truncated'],
  validate,
};
