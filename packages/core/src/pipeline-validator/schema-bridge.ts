/**
 * Zod → JSON Schema bridge.
 *
 * Single source of truth: one Zod schema produces both the runtime validator
 * (via `safeParse`) and the LLM tool definition (via JSON Schema). This
 * makes structural hallucinations impossible — Zod rejects them before the
 * agent sees them.
 *
 * Implementation: Zod 4.3.6 ships native `z.toJSONSchema()` so no extra
 * dependency is required. The wrapper exists so callers don't depend on the
 * underlying implementation.
 */

import { z } from 'zod';

/** A JSON Schema (draft 2020-12, the default for Zod 4's exporter). */
export type JSONSchema = Record<string, unknown>;

export interface ZodToJsonSchemaOptions {
  /**
   * Pass-through to `z.toJSONSchema`. Common knobs:
   *  - `target`: 'draft-7' | 'draft-2020-12' (default 'draft-2020-12')
   *  - `unrepresentable`: 'throw' | 'any' (default 'throw')
   */
  readonly target?: 'draft-7' | 'draft-2020-12';
  readonly unrepresentable?: 'throw' | 'any';
}

/**
 * Convert a Zod schema to a JSON Schema document.
 *
 * @throws if the schema contains nodes that have no JSON Schema mapping
 *         (e.g. transforms, custom types). Pass `unrepresentable: 'any'`
 *         to coerce those to `{}` instead.
 */
export function zodToJsonSchema(
  schema: z.ZodType,
  options: ZodToJsonSchemaOptions = {},
): JSONSchema {
  const params: Record<string, unknown> = {};
  if (options.target !== undefined) params['target'] = options.target;
  if (options.unrepresentable !== undefined) params['unrepresentable'] = options.unrepresentable;
  return z.toJSONSchema(schema, params) as JSONSchema;
}
