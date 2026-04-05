/**
 * Sub-agent spawning types.
 */

import type { LoopMessage, LoopState, ModelCallFn } from '../agent-loop/types.js';

/** Options for spawning a sub-agent. */
export interface SpawnOptions {
  /** Human-readable name for the sub-agent (used in logs/events). */
  readonly name: string;
  /** Tool names the sub-agent is allowed to use (scoped from parent). */
  readonly allowedTools: readonly string[];
  /** Context messages to seed the sub-agent's conversation. */
  readonly contextMessages: readonly LoopMessage[];
  /** Model call function for the sub-agent. */
  readonly modelCall: ModelCallFn;
  /** Maximum iterations for the sub-agent loop. @default 10 */
  readonly maxIterations?: number;
  /** Timeout in milliseconds. Sub-agent is aborted if exceeded. */
  readonly timeoutMs?: number;
  /** Whether parent's lifecycle hooks propagate to the child. @default false */
  readonly propagateHooks?: boolean;
}

/** Result returned when a sub-agent completes. */
export interface SubAgentResult {
  /** Sub-agent name from SpawnOptions. */
  readonly name: string;
  /** Final state of the sub-agent loop. */
  readonly state: LoopState;
  /** Whether the sub-agent completed successfully. */
  readonly success: boolean;
  /** The final assistant message content, if any. */
  readonly output: string | undefined;
  /** Duration in milliseconds. */
  readonly durationMs: number;
}
