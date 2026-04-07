/**
 * HAIP PMS Connect API configuration with Zod validation.
 *
 * HAIP v1.0.0 has no authentication. The apiKey field is included
 * for forward-compatibility when HAIP ships OAuth 2.0/OIDC.
 */

import { z } from 'zod';
import { validateConfig } from '../../config.js';

export interface HaipConfig {
  /** Base URL of the HAIP instance (e.g., 'http://localhost:3000') */
  baseUrl: string;
  /** API key — empty string for HAIP v1.0.0, will be OAuth token later */
  apiKey: string;
  /** HTTP request timeout in milliseconds */
  timeoutMs: number;
  /** Maximum retry attempts for retryable errors */
  maxRetries: number;
  /** Base delay between retries in milliseconds (exponential backoff) */
  baseDelayMs: number;
}

export const haipConfigSchema = z.object({
  baseUrl: z
    .string()
    .min(1)
    .transform((url) => url.replace(/\/+$/, '')),
  apiKey: z.string().default(''),
  timeoutMs: z.number().int().positive().default(10_000),
  maxRetries: z.number().int().min(0).default(2),
  baseDelayMs: z.number().int().positive().default(1_000),
});

export function validateHaipConfig(config: unknown): HaipConfig {
  return validateConfig(haipConfigSchema, config, 'HAIP');
}
