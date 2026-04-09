/**
 * Runtime schema validation for tool inputs and outputs.
 */

import type { z } from 'zod';
import type { ValidationResult, ValidationIssue } from './types.js';

/**
 * Validate data against a Zod schema, returning a typed result
 * with field-level error details on failure.
 */
function validate<T extends z.ZodType>(schema: T, data: unknown): ValidationResult<z.output<T>> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as z.output<T> };
  }

  const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
  }));

  return { success: false, issues };
}

/** Validate tool input against the tool's input schema. */
export function validateToolInput<T extends z.ZodType>(
  schema: T,
  data: unknown,
): ValidationResult<z.output<T>> {
  return validate(schema, data);
}

/** Validate tool output against the tool's output schema. */
export function validateToolOutput<T extends z.ZodType>(
  schema: T,
  data: unknown,
): ValidationResult<z.output<T>> {
  return validate(schema, data);
}
