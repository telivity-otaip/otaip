/**
 * Schema-aware tool interface types.
 *
 * Tools declare Zod schemas for input/output. The agent loop validates
 * data against these schemas before and after tool execution.
 */

import type { z } from 'zod';

/** A tool definition with Zod-validated input and output schemas. */
export interface ToolDefinition<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
> {
  /** Unique tool name (used for lookup and LLM tool_use blocks). */
  readonly name: string;

  /** Human-readable description shown to the LLM. */
  readonly description: string;

  /** Zod schema for validating tool input. */
  readonly inputSchema: TInput;

  /** Zod schema for validating tool output. */
  readonly outputSchema: TOutput;

  /**
   * Runtime enablement check. When provided and returning false,
   * the tool is hidden from the LLM and rejected if called.
   */
  isEnabled?: () => boolean;

  /** Execute the tool with validated input. */
  execute(input: z.output<TInput>): Promise<z.input<TOutput>>;
}

/** Field-level validation error detail. */
export interface ValidationIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** Result of a schema validation — either success or failure with issues. */
export type ValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly issues: readonly ValidationIssue[] };
