/**
 * Amadeus Self-Service API configuration with Zod validation.
 */

import { z } from 'zod';
import { validateConfig } from '../../config.js';

export interface AmadeusConfig {
  environment: 'test' | 'production';
  clientId: string;
  clientSecret: string;
  defaultCurrency: string;
}

export const amadeusConfigSchema = z.object({
  environment: z.enum(['test', 'production']).default('test'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  defaultCurrency: z.string().length(3).default('USD'),
});

export function validateAmadeusConfig(config: unknown): AmadeusConfig {
  return validateConfig(amadeusConfigSchema, config, 'Amadeus');
}
