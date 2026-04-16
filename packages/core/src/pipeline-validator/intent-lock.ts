/**
 * Intent lock — the immutable goal of a pipeline session.
 *
 * Once a session is opened with an intent, no agent or LLM tool call can
 * change the goal-defining fields (origin, destination, dates, passenger
 * count, cabin class). A developer can explicitly unlock+relock through
 * code (e.g. for IRROPS rebooking), but the LLM cannot.
 *
 * The intent_lock gate (Gate 1 in the orchestrator) checks two things:
 *  1. The agent's `intentRelevance` (if declared) includes the intent type.
 *  2. The agent's input does not attempt to change a locked field.
 */

import type { PipelineIntent, SemanticIssue, SemanticValidationResult } from './types.js';

/**
 * The set of fields on a PipelineIntent that cannot drift mid-session.
 * Inputs that contain any of these keys must match the intent's value.
 */
const LOCKED_FIELDS = [
  'origin',
  'destination',
  'outboundDate',
  'returnDate',
  'passengerCount',
  'cabinClass',
] as const;

type LockedField = (typeof LOCKED_FIELDS)[number];

/**
 * Compare a candidate input against the locked intent. Any locked field
 * present in the input must match the intent's value exactly.
 *
 * Inputs that don't reference locked fields (e.g. a fare-rule lookup that
 * only takes a fare basis) pass through.
 */
export function checkIntentDrift(
  input: unknown,
  intent: PipelineIntent,
): SemanticValidationResult {
  if (input === null || typeof input !== 'object') {
    return { ok: true, warnings: [] };
  }
  const issues: SemanticIssue[] = [];
  const inputObj = input as Record<string, unknown>;

  for (const field of LOCKED_FIELDS) {
    if (!(field in inputObj)) continue;
    const inputValue = inputObj[field];
    const intentValue = intent[field as LockedField];
    if (intentValue === undefined) continue; // intent doesn't constrain this field
    if (inputValue !== intentValue) {
      issues.push({
        code: 'INTENT_LOCK_VIOLATION',
        path: [field],
        message: `Input ${field}=${formatValue(inputValue)} does not match locked intent ${formatValue(intentValue)}`,
        suggestion: `Use intent value ${formatValue(intentValue)} or open a new session if the goal has changed`,
        severity: 'error',
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, warnings: [] };
}

/**
 * Check whether an agent's declared `intentRelevance` includes the
 * session's intent type. If `intentRelevance` is undefined or empty, the
 * agent is intent-agnostic and always allowed.
 */
export function checkIntentRelevance(
  intentType: string,
  intentRelevance: readonly string[] | undefined,
): SemanticValidationResult {
  if (!intentRelevance || intentRelevance.length === 0) {
    return { ok: true, warnings: [] };
  }
  if (intentRelevance.includes(intentType)) {
    return { ok: true, warnings: [] };
  }
  return {
    ok: false,
    issues: [
      {
        code: 'INTENT_MISMATCH',
        path: [],
        message: `Agent does not serve intent type '${intentType}' (supported: ${intentRelevance.join(', ')})`,
        severity: 'error',
      },
    ],
  };
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}
