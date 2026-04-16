/**
 * Pipeline contract for PnrBuilder (Agent 3.2).
 *
 * Action type: `mutation_reversible` — creating a PNR is a real side
 * effect, but it is reversible within the void window / before
 * ticketing. Confidence floor 0.9 enforced; the contract sets exactly
 * that.
 *
 * Semantic validation:
 *  - All segments' carrier codes must resolve.
 *  - All segments' origin/destination codes must resolve.
 *  - ticketing.time_limit must not be in the past.
 *  - is_group requires group_name.
 *  - Infants must reference a valid adult passenger index.
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
import { pnrBuilderInputSchema, pnrBuilderOutputSchema } from './schema.js';

interface PnrInput {
  passengers: Array<{
    passenger_type: 'ADT' | 'CHD' | 'INF';
    infant_accompanying_adult?: number;
  }>;
  segments: Array<{ carrier: string; origin: string; destination: string }>;
  ticketing: { time_limit: string };
  is_group?: boolean;
  group_name?: string;
}

async function validate(
  input: unknown,
  ctx: ValidationContext,
): Promise<SemanticValidationResult> {
  const data = input as PnrInput;
  const issues: SemanticIssue[] = [];

  for (let i = 0; i < data.segments.length; i++) {
    const seg = data.segments[i];
    if (!seg) continue;
    issues.push(
      ...(await resolveAirportStrict(seg.origin, ctx.reference, [
        'segments',
        i,
        'origin',
      ])),
      ...(await resolveAirportStrict(seg.destination, ctx.reference, [
        'segments',
        i,
        'destination',
      ])),
      ...(await resolveAirlineStrict(seg.carrier, ctx.reference, [
        'segments',
        i,
        'carrier',
      ])),
    );
  }

  issues.push(
    ...validateFutureDate(data.ticketing.time_limit, ctx.now, [
      'ticketing',
      'time_limit',
    ]),
  );

  if (data.is_group === true && !data.group_name) {
    issues.push({
      code: 'GROUP_NAME_REQUIRED',
      path: ['group_name'],
      message: 'is_group=true requires a group_name',
      severity: 'error',
    });
  }

  const adultCount = data.passengers.filter((p) => p.passenger_type === 'ADT').length;
  for (let i = 0; i < data.passengers.length; i++) {
    const pax = data.passengers[i];
    if (!pax) continue;
    if (pax.passenger_type === 'INF') {
      const idx = pax.infant_accompanying_adult;
      if (idx === undefined) {
        issues.push({
          code: 'INFANT_MISSING_ADULT',
          path: ['passengers', i, 'infant_accompanying_adult'],
          message: 'Infant passenger must reference an accompanying adult index',
          severity: 'error',
        });
      } else if (idx < 0 || idx >= data.passengers.length) {
        issues.push({
          code: 'INFANT_ADULT_INDEX_INVALID',
          path: ['passengers', i, 'infant_accompanying_adult'],
          message: `infant_accompanying_adult=${idx} is out of range`,
          severity: 'error',
        });
      } else {
        const adult = data.passengers[idx];
        if (!adult || adult.passenger_type !== 'ADT') {
          issues.push({
            code: 'INFANT_ADULT_NOT_ADT',
            path: ['passengers', i, 'infant_accompanying_adult'],
            message: `Referenced passenger at index ${idx} is not type ADT`,
            severity: 'error',
          });
        }
      }
    }
  }
  if (adultCount === 0 && data.passengers.some((p) => p.passenger_type === 'INF')) {
    issues.push({
      code: 'NO_ADULTS_WITH_INFANTS',
      path: ['passengers'],
      message: 'Cannot book infants without any adult passengers',
      severity: 'error',
    });
  }

  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return { ok: false, issues };
  return { ok: true, warnings: issues };
}

export const pnrBuilderContract: AgentContract<
  typeof pnrBuilderInputSchema,
  typeof pnrBuilderOutputSchema
> = {
  agentId: '3.2',
  inputSchema: pnrBuilderInputSchema,
  outputSchema: pnrBuilderOutputSchema,
  actionType: 'mutation_reversible',
  confidenceThreshold: 0.9,
  outputContract: ['passenger_count', 'segment_count', 'is_group'],
  validate,
};
