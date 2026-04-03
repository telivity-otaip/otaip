/**
 * Navitaire (New Skies / dotREZ) adapter configuration with Zod validation.
 */

import { z } from 'zod';
import { validateConfig } from '../../config.js';

export const NAVITAIRE_TEST_BASE_URL = 'https://dotrezapi.test.1n.navitaire.com';

export interface NavitaireConfig {
  environment: 'test' | 'production';
  baseUrl: string;
  credentials: {
    domain: string;
    username: string;
    password: string;
  };
  defaultCurrencyCode: string;
  sessionTimeoutMs: number;
}

export const navitaireConfigSchema = z.object({
  environment: z.enum(['test', 'production']).default('test'),
  baseUrl: z.url(),
  credentials: z.object({
    domain: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
  }),
  defaultCurrencyCode: z.string().length(3).default('USD'),
  sessionTimeoutMs: z.number().int().positive().default(1_200_000), // 20 minutes
});

export function validateNavitaireConfig(config: unknown): NavitaireConfig {
  return validateConfig(navitaireConfigSchema, config, 'Navitaire');
}
