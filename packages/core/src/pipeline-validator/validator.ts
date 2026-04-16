/**
 * The gate runner.
 *
 * Given a contract, an agent, and a session, runs the six pipeline gates
 * around the agent's execute() call. Stateless beyond what the session
 * carries; the orchestrator wraps this with session management and retry
 * budget tracking.
 *
 * Gate order:
 *   1. intent_lock       — intentRelevance + drift check
 *   2. schema_in         — Zod safeParse on input
 *   3. semantic_in       — contract.validate(input, ctx)
 *   4. cross_agent       — input fields consistent with session.contractState
 *   --- execute the agent ---
 *   5. schema_out        — Zod safeParse on output.data + optional validateOutput
 *   6. confidence        — output.confidence >= effective threshold
 *   7. action_class      — approval token + zero-warnings check
 *
 * Numbering inside this file follows the implementation order above;
 * the master plan counts six logical gates (schema, semantic, intent,
 * cross-agent, confidence, action).
 */

import type { z } from 'zod';
import type { Agent, AgentOutput } from '../types/agent.js';
import { checkActionClassification, type ApprovalPolicy } from './action-classifier.js';
import {
  captureOutputContract,
  checkCrossAgentConsistency,
} from './cross-agent-checker.js';
import { checkConfidence } from './confidence-gate.js';
import { checkIntentDrift, checkIntentRelevance } from './intent-lock.js';
import type {
  AgentContract,
  AgentInvocation,
  GateResult,
  PipelineSession,
  ReferenceDataProvider,
  SemanticIssue,
  ValidationContext,
} from './types.js';

export interface RunGatesConfig {
  readonly now: Date;
  readonly reference: ReferenceDataProvider;
  readonly approvalPolicy?: ApprovalPolicy;
  /** If true, the contract is marked as a reference-data agent for confidence floor purposes. */
  readonly isReferenceAgent?: boolean;
}

export type GateRunResult =
  | {
      readonly ok: true;
      readonly output: AgentOutput<unknown>;
      readonly gateResults: readonly GateResult[];
    }
  | {
      readonly ok: false;
      readonly reason: GateFailureReason;
      readonly issues: readonly SemanticIssue[];
      readonly gateResults: readonly GateResult[];
    };

export type GateFailureReason =
  | 'intent_lock'
  | 'schema_invalid'
  | 'semantic_invalid'
  | 'cross_agent_inconsistent'
  | 'agent_error'
  | 'schema_out_invalid'
  | 'low_confidence'
  | 'action_class_blocked';

/**
 * Run all gates around the agent's execute() call.
 *
 * The function does NOT apply the retry budget — that's the orchestrator's
 * job. On `ok: false`, the caller decides whether to retry (only
 * `'agent_error'` is a candidate for retry; gate failures are terminal for
 * the current invocation input).
 */
export async function runGates<TIn extends z.ZodType, TOut extends z.ZodType>(
  contract: AgentContract<TIn, TOut>,
  agent: Agent<z.output<TIn>, z.output<TOut>>,
  input: unknown,
  session: PipelineSession,
  config: RunGatesConfig,
): Promise<GateRunResult> {
  const gateResults: GateResult[] = [];

  // Gate 1: intent_lock
  const relevance = checkIntentRelevance(session.intent.type, contract.intentRelevance);
  if (!relevance.ok) {
    gateResults.push({ gate: 'intent_lock', passed: false, issues: relevance.issues });
    return fail('intent_lock', relevance.issues, gateResults);
  }
  const drift = checkIntentDrift(input, session.intent);
  if (!drift.ok) {
    gateResults.push({ gate: 'intent_lock', passed: false, issues: drift.issues });
    return fail('intent_lock', drift.issues, gateResults);
  }
  gateResults.push({
    gate: 'intent_lock',
    passed: true,
    issues: [...relevance.warnings, ...drift.warnings],
  });

  // Gate 2: schema_in
  const parsed = contract.inputSchema.safeParse(input);
  if (!parsed.success) {
    const issues: SemanticIssue[] = parsed.error.issues.map((i) => ({
      code: `ZOD_${i.code.toUpperCase()}`,
      path: i.path,
      message: i.message,
      severity: 'error' as const,
    }));
    gateResults.push({ gate: 'schema_in', passed: false, issues });
    return fail('schema_invalid', issues, gateResults);
  }
  gateResults.push({ gate: 'schema_in', passed: true });

  const validatedInput = parsed.data as z.output<TIn>;

  // Build validation context.
  const priorOutputs: ReadonlyMap<string, Readonly<Record<string, unknown>>> = new Map(
    [...session.contractState.entries()].map(([k, v]) => [k, Object.freeze({ ...v })]),
  );
  const ctx: ValidationContext = {
    reference: config.reference,
    now: config.now,
    intent: session.intent,
    priorOutputs,
  };

  // Gate 3: semantic_in
  const semantic = await contract.validate(validatedInput, ctx);
  if (!semantic.ok) {
    gateResults.push({ gate: 'semantic_in', passed: false, issues: semantic.issues });
    return fail('semantic_invalid', semantic.issues, gateResults);
  }
  gateResults.push({ gate: 'semantic_in', passed: true, issues: semantic.warnings });

  // Gate 4: cross_agent
  const crossAgent = checkCrossAgentConsistency(validatedInput, session);
  if (!crossAgent.ok) {
    gateResults.push({ gate: 'cross_agent', passed: false, issues: crossAgent.issues });
    return fail('cross_agent_inconsistent', crossAgent.issues, gateResults);
  }
  gateResults.push({ gate: 'cross_agent', passed: true, issues: crossAgent.warnings });

  // Execute
  let output: AgentOutput<z.output<TOut>>;
  try {
    output = await agent.execute({ data: validatedInput });
    gateResults.push({ gate: 'execute', passed: true });
  } catch (err) {
    const issues: SemanticIssue[] = [
      {
        code: 'AGENT_EXECUTION_ERROR',
        path: [],
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      },
    ];
    gateResults.push({ gate: 'execute', passed: false, issues });
    return fail('agent_error', issues, gateResults);
  }

  // Gate 5: schema_out
  const outParse = contract.outputSchema.safeParse(output.data);
  if (!outParse.success) {
    const issues: SemanticIssue[] = outParse.error.issues.map((i) => ({
      code: `ZOD_OUT_${i.code.toUpperCase()}`,
      path: i.path,
      message: i.message,
      severity: 'error' as const,
    }));
    gateResults.push({ gate: 'schema_out', passed: false, issues });
    return fail('schema_out_invalid', issues, gateResults);
  }
  // Optional validateOutput
  if (contract.validateOutput) {
    const outSemantic = await contract.validateOutput(outParse.data as z.output<TOut>, ctx);
    if (!outSemantic.ok) {
      gateResults.push({ gate: 'schema_out', passed: false, issues: outSemantic.issues });
      return fail('schema_out_invalid', outSemantic.issues, gateResults);
    }
    gateResults.push({ gate: 'schema_out', passed: true, issues: outSemantic.warnings });
  } else {
    gateResults.push({ gate: 'schema_out', passed: true });
  }

  // Gate 6: confidence
  const conf = checkConfidence({
    outputConfidence: output.confidence,
    threshold: contract.confidenceThreshold,
    actionType: contract.actionType,
    isReferenceAgent: config.isReferenceAgent ?? false,
  });
  if (!conf.ok) {
    gateResults.push({ gate: 'confidence', passed: false, issues: conf.issues });
    return fail('low_confidence', conf.issues, gateResults);
  }
  gateResults.push({ gate: 'confidence', passed: true });

  // Gate 7: action_class
  const actionCheck = checkActionClassification(
    contract.actionType,
    input, // raw input (so approvalToken passthrough is visible)
    gateResults,
    config.approvalPolicy,
  );
  if (!actionCheck.ok) {
    gateResults.push({ gate: 'action_class', passed: false, issues: actionCheck.issues });
    return fail('action_class_blocked', actionCheck.issues, gateResults);
  }
  gateResults.push({ gate: 'action_class', passed: true });

  // Capture output contract into session state.
  captureOutputContract(contract.agentId, output.data, contract.outputContract, session);

  return { ok: true, output, gateResults };
}

function fail(
  reason: GateFailureReason,
  issues: readonly SemanticIssue[],
  gateResults: readonly GateResult[],
): GateRunResult {
  return { ok: false, reason, issues, gateResults };
}

/** Shape the orchestrator uses to record an invocation into session.history. */
export function makeInvocation(
  invocationId: string,
  agentId: string,
  startedAt: Date,
  input: unknown,
  result: GateRunResult,
  finishedAt: Date,
): AgentInvocation {
  return {
    invocationId,
    agentId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    input,
    output: result.ok ? result.output : undefined,
    gateResults: result.gateResults,
    status: result.ok ? 'ok' : result.reason === 'agent_error' ? 'error' : 'blocked',
  };
}
