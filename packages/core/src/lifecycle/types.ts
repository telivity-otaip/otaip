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

/** Controls how the HookRegistry handles errors thrown by hook handlers. */
export type HookErrorPolicy =
  /** Silently swallow errors (default, backward-compatible). */
  | 'swallow'
  /** Log errors via the onHookError callback, then continue. */
  | 'log'
  /** Re-throw the error, stopping hook execution. */
  | 'propagate';

/** Configuration for HookRegistry behavior. */
export interface HookRegistryConfig {
  /** How to handle errors from hook handlers. Default: 'swallow'. */
  errorPolicy?: HookErrorPolicy;

  /** Called when a hook throws and errorPolicy is 'log'. Receives the error and handler context. */
  onHookError?: (error: unknown, event: LifecycleEvent) => void;
}
