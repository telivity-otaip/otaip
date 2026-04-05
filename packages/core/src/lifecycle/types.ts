/**
 * Lifecycle hooks types.
 */

import type { LoopState, ToolCall, ToolResult } from '../agent-loop/types.js';

/** Lifecycle event names. */
export type LifecycleEvent =
  | 'beforeToolCall'
  | 'afterToolCall'
  | 'onError'
  | 'onComplete'
  | 'onLoopStart'
  | 'onLoopEnd';

/** Context passed to every hook handler. */
export interface HookContext {
  readonly state: LoopState;
  readonly toolCall?: ToolCall;
  readonly toolResult?: ToolResult;
  readonly error?: unknown;
}

/** Result from a beforeToolCall hook — can block execution. */
export interface BeforeToolCallResult {
  readonly block?: boolean;
  readonly reason?: string;
}

/**
 * A hook handler function.
 * - For 'beforeToolCall': may return BeforeToolCallResult to block.
 * - For all others: return value is ignored.
 */
export type HookHandler = (
  context: HookContext,
) => void | BeforeToolCallResult | Promise<void | BeforeToolCallResult>;
