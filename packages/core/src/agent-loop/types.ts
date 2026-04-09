/**
 * Agent loop types — deterministic message→tool→response cycle.
 */

import type { HookRegistry } from '../lifecycle/hook-registry.js';

/** Possible states of the agent loop state machine. */
export type LoopPhase = 'idle' | 'running' | 'tool_call' | 'tool_result' | 'complete' | 'error';

/** A tool invocation request from the model. */
export interface ToolCall {
  /** Tool call ID (for correlating with tool_result). */
  readonly id: string;
  /** Tool name to invoke. */
  readonly name: string;
  /** Tool input (raw — will be validated against schema). */
  readonly input: unknown;
}

/** The result of executing a tool. */
export interface ToolResult {
  /** Correlating tool call ID. */
  readonly toolCallId: string;
  /** Tool output (raw — will be validated against schema). */
  readonly output: unknown;
  /** Whether the tool execution errored. */
  readonly isError: boolean;
}

/** A message in the conversation. */
export interface LoopMessage {
  readonly role: 'user' | 'assistant' | 'tool_result';
  readonly content: string;
  /** Present when role is 'assistant' and the model requests tool calls. */
  readonly toolCalls?: readonly ToolCall[];
  /** Present when role is 'tool_result'. */
  readonly toolResults?: readonly ToolResult[];
}

/** Current snapshot of the loop state. */
export interface LoopState {
  readonly phase: LoopPhase;
  readonly iteration: number;
  readonly messages: readonly LoopMessage[];
}

/** Structured event emitted by the loop at key points. */
export interface LoopEvent {
  readonly type: 'loop_start' | 'loop_end' | 'before_tool_call' | 'after_tool_call' | 'error';
  readonly state: LoopState;
  readonly toolCall?: ToolCall;
  readonly toolResult?: ToolResult;
  readonly error?: unknown;
}

/**
 * A custom stop condition. Returning true halts the loop.
 * Receives the current state after each model response.
 */
export type StopCondition = (state: LoopState) => boolean;

/**
 * Callback for an LLM model call.
 * Given the conversation messages, returns the next assistant message.
 */
export type ModelCallFn = (messages: readonly LoopMessage[]) => Promise<LoopMessage>;

/** Configuration for the agent loop. */
export interface LoopConfig {
  /** Maximum iterations before forced stop. @default 25 */
  maxIterations: number;
  /** Optional custom stop conditions (evaluated after each model response). */
  stopConditions: StopCondition[];
  /** Optional event listener for structured loop events. */
  onEvent?: (event: LoopEvent) => void;
  /** Optional HookRegistry for lifecycle hooks (Module 3). */
  hooks?: HookRegistry;
}
