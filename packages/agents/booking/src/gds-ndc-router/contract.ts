/**
 * Pipeline contract for GdsNdcRouter (Agent 3.1).
 *
 * Semantic validation: every segment's marketing/operating carrier must
 * resolve against the airline reference, and origin/destination against
 * the airport reference.
 *
 * Sprint A scope: the existing lookup-table router continues to power
 * the agent's `execute()`. The registry-driven weighted-scoring refactor
 * (Step 3b internals swap) is deferred to a follow-up; the contract
 * (schemas + this file) is shipped now so the router is a platform
 * citizen.
 */

import type {
  AgentContract,
  SemanticIssue,
  SemanticValidationResult,
  ValidationContext,
} from '@otaip/core';
import { resolveAirlineStrict, resolveAirportStrict } from '@otaip/core';
import { gdsNdcRouterInputSchema, gdsNdcRouterOutputSchema } from './schema.js';

interface RoutingSegment {
  marketing_carrier: string;
  operating_carrier?: string;
  origin: string;
  destination: string;
}

async function validate(
  input: unknown,
  ctx: ValidationContext,
): Promise<SemanticValidationResult> {
  const data = input as { segments: RoutingSegment[] };
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
      ...(await resolveAirlineStrict(seg.marketing_carrier, ctx.reference, [
        'segments',
        i,
        'marketing_carrier',
      ])),
    );
    if (seg.operating_carrier !== undefined && seg.operating_carrier !== seg.marketing_carrier) {
      issues.push(
        ...(await resolveAirlineStrict(seg.operating_carrier, ctx.reference, [
          'segments',
          i,
          'operating_carrier',
        ])),
      );
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return { ok: false, issues };
  return { ok: true, warnings: issues };
}

export const gdsNdcRouterContract: AgentContract<
  typeof gdsNdcRouterInputSchema,
  typeof gdsNdcRouterOutputSchema
> = {
  agentId: '3.1',
  inputSchema: gdsNdcRouterInputSchema,
  outputSchema: gdsNdcRouterOutputSchema,
  actionType: 'query',
  confidenceThreshold: 0.8,
  outputContract: ['recommended_channel', 'unified_channel'],
  validate,
};
