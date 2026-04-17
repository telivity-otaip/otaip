/**
 * Agent → Tool bridge.
 *
 * Converts an `AgentContract` + `Agent` pair into a `ToolDefinition`
 * that `AgentLoop` can dispatch via its standard tool-execution pipeline.
 * The bridge delegates to `PipelineOrchestrator.runAgent()`, so every
 * tool call runs through the six pipeline gates (schema, semantic,
 * intent lock, cross-agent consistency, confidence, action classification).
 *
 * Session is injected at bridge-creation time and shared across all
 * tools in one AgentLoop run: one user goal = one session = one intent lock.
 *
 * Failure handling: the bridge throws `AgentToolError` on pipeline
 * rejection. AgentLoop catches it, wraps it in `ToolResult { isError: true }`,
 * and the LLM sees the structured error message to self-correct.
 */

import type { z } from 'zod';
import type { Agent } from '../types/agent.js';
import type { ToolDefinition } from './types.js';
import type { AgentContract, PipelineSession, SemanticIssue } from '../pipeline-validator/types.js';
import type { PipelineOrchestrator, RunAgentFailureReason } from '../pipeline-validator/orchestrator.js';
import type { EventStore, AgentExecutedEvent } from '../event-store/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stable snake_case tool names for the 10 contracted agents.
// ─────────────────────────────────────────────────────────────────────────────

export const AGENT_TOOL_NAMES: Readonly<Record<string, string>> = Object.freeze({
  '0.1': 'airport_code_resolver',
  '0.2': 'airline_code_mapper',
  '0.3': 'fare_basis_decoder',
  '1.1': 'availability_search',
  '2.1': 'fare_rule_agent',
  '2.4': 'offer_builder',
  '3.1': 'gds_ndc_router',
  '3.2': 'pnr_builder',
  '3.8': 'pnr_retrieval',
  '4.1': 'ticket_issuance',
});

// ─────────────────────────────────────────────────────────────────────────────
// Error class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown by the tool bridge when `PipelineOrchestrator.runAgent()` returns
 * `ok: false`. The error message is structured for LLM self-correction:
 * it includes the rejection reason and every individual issue.
 */
export class AgentToolError extends Error {
  override readonly name = 'AgentToolError';

  constructor(
    readonly agentId: string,
    readonly reason: RunAgentFailureReason,
    readonly issues: readonly SemanticIssue[],
  ) {
    const issueMessages = issues.map((i) => i.message).join('; ');
    super(`Agent ${agentId} rejected at ${reason}${issueMessages ? `: ${issueMessages}` : ''}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bridge options + factory
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentToolBridgeOptions {
  /** Override the auto-derived tool name. */
  readonly toolName?: string;
  /** Human description shown to the LLM. Falls back to `agent.name`. */
  readonly description?: string;
  /** Optional: auto-log `agent.executed` events after each call. */
  readonly eventStore?: EventStore;
}

/**
 * Bridge a contracted agent into a `ToolDefinition` that `AgentLoop`
 * can register and dispatch.
 *
 * @param contract  The agent's pipeline contract (Zod schemas + validation + action type)
 * @param agent     The agent instance (must share `id` with contract.agentId)
 * @param orchestrator  The pipeline orchestrator that enforces the six gates
 * @param session   The pipeline session (shared across all tools in one run)
 * @param options   Optional overrides (tool name, description, event store)
 */
export function agentToTool<
  TIn extends z.ZodType,
  TOut extends z.ZodType,
>(
  contract: AgentContract<TIn, TOut>,
  agent: Agent,
  orchestrator: PipelineOrchestrator,
  session: PipelineSession,
  options?: AgentToolBridgeOptions,
): ToolDefinition<TIn, TOut> {
  const name =
    options?.toolName ??
    AGENT_TOOL_NAMES[contract.agentId] ??
    contract.agentId.replace(/\./g, '_');

  return {
    name,
    description: options?.description ?? agent.name,
    inputSchema: contract.inputSchema,
    outputSchema: contract.outputSchema,
    async execute(input: z.output<TIn>): Promise<z.input<TOut>> {
      const start = Date.now();
      const result = await orchestrator.runAgent(session, contract.agentId, input);
      const durationMs = Date.now() - start;

      // Optional event logging.
      if (options?.eventStore) {
        const event: AgentExecutedEvent = {
          eventId: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'agent.executed',
          timestamp: new Date().toISOString(),
          sessionId: session.sessionId,
          agentId: contract.agentId,
          inputHash: simpleHash(input),
          confidence: result.ok ? (result.output.confidence ?? 0) : 0,
          durationMs,
          success: result.ok,
          gateResults: result.invocation.gateResults.map((g) => ({
            gate: g.gate,
            passed: g.passed,
          })),
        };
        // Fire-and-forget — don't let event logging failure block the tool response.
        options.eventStore.append(event).catch(() => {});
      }

      if (result.ok) {
        return result.output.data as z.input<TOut>;
      }
      throw new AgentToolError(contract.agentId, result.reason, result.issues);
    },
  };
}

/**
 * Batch-convert all contracted agents to tools and register them
 * in a `ToolRegistry`.
 */
export function registerAgentTools(
  contracts: ReadonlyMap<string, AgentContract>,
  agents: ReadonlyMap<string, Agent>,
  orchestrator: PipelineOrchestrator,
  session: PipelineSession,
  registry: { register(tool: ToolDefinition): void },
  options?: Omit<AgentToolBridgeOptions, 'toolName' | 'description'>,
): void {
  for (const [agentId, contract] of contracts) {
    const agent = agents.get(agentId);
    if (!agent) continue;
    const tool = agentToTool(contract, agent, orchestrator, session, options);
    registry.register(tool);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function simpleHash(input: unknown): string {
  // Lightweight non-crypto hash for event dedup. Not SHA-256 (would
  // require a crypto import). Good enough for the in-memory store.
  const str = JSON.stringify(input);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
