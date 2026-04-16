/**
 * Cross-agent consistency checker.
 *
 * After every successful agent execution, the orchestrator captures the
 * fields named in the agent's `outputContract` and stores them in
 * `PipelineSession.contractState[agentId]`. Before every subsequent agent
 * call, this module checks the new input against the running state.
 *
 * Examples of catches:
 *  - LLM fabricates an offerId not in the search response
 *  - LLM changes passenger count between search and booking
 *  - LLM tries to ticket a booking reference that doesn't exist
 *
 * The checker uses a simple convention: any field on the new input whose
 * name appears in any prior agent's `contractState` must equal the prior
 * value. This catches "fabricated identifier" cases without requiring each
 * contract to declare per-field reverse dependencies.
 */

import type { PipelineSession, SemanticIssue, SemanticValidationResult } from './types.js';

/**
 * Check the new input against all previously captured contract state.
 *
 * Algorithm:
 *  - For each field name on the input that appears in any prior agent's
 *    contractState, the input value must equal one of the recorded values.
 *  - Fields not present in any prior contractState are ignored (they're
 *    new data, not references to prior outputs).
 *
 * `passengerCount` mismatch is a particularly common LLM failure, so
 * is validated explicitly across all agents that ever recorded it.
 */
export function checkCrossAgentConsistency(
  input: unknown,
  session: PipelineSession,
): SemanticValidationResult {
  if (input === null || typeof input !== 'object') {
    return { ok: true, warnings: [] };
  }
  const issues: SemanticIssue[] = [];
  const inputObj = input as Record<string, unknown>;

  // Collect all known prior values per field name.
  const priorByField = new Map<string, { agentId: string; value: unknown }[]>();
  for (const [agentId, fields] of session.contractState.entries()) {
    for (const [fieldName, value] of Object.entries(fields)) {
      const list = priorByField.get(fieldName) ?? [];
      list.push({ agentId, value });
      priorByField.set(fieldName, list);
    }
  }

  for (const [fieldName, inputValue] of Object.entries(inputObj)) {
    const priors = priorByField.get(fieldName);
    if (!priors || priors.length === 0) continue;
    const matched = priors.some((p) => deepEqual(p.value, inputValue));
    if (!matched) {
      const knownValues = priors
        .map((p) => `${p.agentId}=${formatValue(p.value)}`)
        .join(', ');
      issues.push({
        code: 'CROSS_AGENT_INCONSISTENCY',
        path: [fieldName],
        message: `Input ${fieldName}=${formatValue(inputValue)} does not match any prior recorded value (${knownValues})`,
        suggestion: `Use one of the recorded values, or call the upstream agent again to produce a fresh ${fieldName}`,
        severity: 'error',
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, warnings: [] };
}

/**
 * Capture the fields named in `outputContract` from an agent's output and
 * write them into the session's `contractState` under the agent's id.
 * Called by the orchestrator after a successful agent execution.
 */
export function captureOutputContract(
  agentId: string,
  output: unknown,
  outputContract: readonly string[],
  session: PipelineSession,
): void {
  if (output === null || typeof output !== 'object') return;
  const outputObj = output as Record<string, unknown>;
  const captured: Record<string, unknown> = {};
  for (const fieldName of outputContract) {
    if (fieldName in outputObj) {
      captured[fieldName] = outputObj[fieldName];
    }
  }
  if (Object.keys(captured).length > 0) {
    session.contractState.set(agentId, captured);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
      return false;
    }
  }
  return true;
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  try {
    const s = JSON.stringify(v);
    return s.length > 60 ? s.slice(0, 57) + '...' : s;
  } catch {
    return String(v);
  }
}
