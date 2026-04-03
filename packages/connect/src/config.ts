/**
 * Base config validation utilities for ConnectAdapter implementations.
 */

import { z } from 'zod';

export const baseAdapterConfigSchema = z.object({
  timeoutMs: z.number().int().positive().default(30_000),
  maxRetries: z.number().int().min(0).default(3),
  baseDelayMs: z.number().int().positive().default(500),
  maxDelayMs: z.number().int().positive().default(10_000),
});

export type BaseAdapterConfig = z.infer<typeof baseAdapterConfigSchema>;

export function validateConfig<TOutput, TInput = unknown>(
  schema: z.ZodType<TOutput, TInput>,
  config: unknown,
  supplierName: string,
): TOutput {
  const result = schema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid ${supplierName} config: ${issues}`);
  }
  return result.data;
}
