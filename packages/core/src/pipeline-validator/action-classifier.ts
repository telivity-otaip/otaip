/**
 * Action classifier — escalating requirements per `ActionType`.
 *
 *  - query: pass-through.
 *  - mutation_reversible: requires zero warnings on prior gates.
 *  - mutation_irreversible: requires zero warnings on prior gates AND an
 *    `approvalToken` on the input (or in the configured ApprovalPolicy).
 *
 * The token is a coarse proxy for "a human (or a developer-coded policy)
 * has signed off on this action." Sprint A treats any non-empty string
 * as a valid token; Sprint B+ may attach scoped JWTs.
 */

import type {
  ActionType,
  GateResult,
  SemanticIssue,
  SemanticValidationResult,
} from './types.js';

/**
 * Per-deployment policy for which action types require an approval token
 * and how to validate it. Default: only `mutation_irreversible` requires
 * an approval token, and any non-empty string is accepted.
 */
export interface ApprovalPolicy {
  readonly requiresApproval: ReadonlySet<ActionType>;
  validateApprovalToken?(
    token: unknown,
    actionType: ActionType,
  ): SemanticValidationResult;
}

function defaultValidateApprovalToken(
  token: unknown,
  _actionType: ActionType,
): SemanticValidationResult {
  if (typeof token === 'string' && token.length > 0) {
    return { ok: true, warnings: [] };
  }
  return {
    ok: false,
    issues: [
      {
        code: 'APPROVAL_TOKEN_INVALID',
        path: ['approvalToken'],
        message: 'Approval token is missing or empty',
        severity: 'error',
      },
    ],
  };
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = Object.freeze({
  requiresApproval: new Set<ActionType>(['mutation_irreversible']),
  validateApprovalToken: defaultValidateApprovalToken,
});

/**
 * Run the action-class checks against an agent invocation.
 *
 * @param actionType the contract's declared action type
 * @param input the (already-Zod-validated) input to the agent
 * @param priorGates the gate results so far this invocation (used to enforce
 *                   "zero warnings" on reversible/irreversible mutations)
 * @param policy approval policy (optional; uses DEFAULT_APPROVAL_POLICY)
 */
export function checkActionClassification(
  actionType: ActionType,
  input: unknown,
  priorGates: readonly GateResult[],
  policy: ApprovalPolicy = DEFAULT_APPROVAL_POLICY,
): SemanticValidationResult {
  const issues: SemanticIssue[] = [];

  // Reversible/irreversible mutations require zero warnings on prior gates.
  if (actionType !== 'query') {
    const warnings = priorGates.flatMap((g) =>
      (g.issues ?? []).filter((i) => i.severity === 'warning'),
    );
    if (warnings.length > 0) {
      issues.push({
        code: 'MUTATION_WITH_WARNINGS',
        path: [],
        message: `Action type '${actionType}' requires zero warnings on prior gates; found ${warnings.length}`,
        severity: 'error',
      });
    }
  }

  // Approval check.
  if (policy.requiresApproval.has(actionType)) {
    const token =
      input && typeof input === 'object'
        ? (input as Record<string, unknown>)['approvalToken']
        : undefined;
    const validator = policy.validateApprovalToken;
    if (validator !== undefined) {
      const result = validator(token, actionType);
      if (!result.ok) {
        issues.push(...result.issues);
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, warnings: [] };
}
