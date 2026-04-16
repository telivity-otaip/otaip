/**
 * Confidence gate.
 *
 * Every agent output carries an optional `confidence` score (0..1).
 * The contract declares a `confidenceThreshold`; the gate checks that
 * the output meets it. Floors per action type prevent contracts from
 * declaring a threshold lower than the action's risk level.
 */

import {
  CONFIDENCE_FLOORS,
  REFERENCE_CONFIDENCE_FLOOR,
  type ActionType,
  type SemanticIssue,
  type SemanticValidationResult,
} from './types.js';

export interface ConfidenceCheckInput {
  readonly outputConfidence: number | undefined;
  readonly threshold: number;
  readonly actionType: ActionType;
  readonly isReferenceAgent?: boolean;
}

/**
 * Resolve the floor for an agent. Reference agents get the reference floor
 * (0.9) regardless of action type.
 */
export function resolveFloor(actionType: ActionType, isReferenceAgent: boolean): number {
  if (isReferenceAgent) return REFERENCE_CONFIDENCE_FLOOR;
  return CONFIDENCE_FLOORS[actionType];
}

/**
 * Validate that the declared threshold is at or above the floor for the
 * action type. Called at contract registration time, not per invocation.
 */
export function validateThresholdAgainstFloor(
  agentId: string,
  threshold: number,
  actionType: ActionType,
  isReferenceAgent: boolean,
): SemanticValidationResult {
  const floor = resolveFloor(actionType, isReferenceAgent);
  if (threshold >= floor) {
    return { ok: true, warnings: [] };
  }
  return {
    ok: false,
    issues: [
      {
        code: 'CONFIDENCE_FLOOR_VIOLATION',
        path: ['confidenceThreshold'],
        message: `Agent ${agentId} declares confidenceThreshold=${threshold} which is below the floor ${floor} for action type '${actionType}'${isReferenceAgent ? ' (reference agent)' : ''}`,
        severity: 'error',
      },
    ],
  };
}

/**
 * Per-invocation confidence check. Treats missing confidence as 0.
 */
export function checkConfidence(input: ConfidenceCheckInput): SemanticValidationResult {
  const floor = resolveFloor(input.actionType, input.isReferenceAgent ?? false);
  const effectiveThreshold = Math.max(input.threshold, floor);
  const confidence = input.outputConfidence ?? 0;
  if (confidence >= effectiveThreshold) {
    return { ok: true, warnings: [] };
  }
  const issues: SemanticIssue[] = [
    {
      code: 'CONFIDENCE_BELOW_THRESHOLD',
      path: ['confidence'],
      message: `Agent output confidence ${confidence.toFixed(2)} is below threshold ${effectiveThreshold.toFixed(2)} for action type '${input.actionType}'`,
      suggestion:
        'Re-run the upstream step with a more specific input, or accept a lower-confidence result by explicitly lowering the threshold in the contract',
      severity: 'error',
    },
  ];
  return { ok: false, issues };
}
