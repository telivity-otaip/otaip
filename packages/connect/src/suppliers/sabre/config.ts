/**
 * Sabre GDS adapter configuration with Zod validation.
 */

import { z } from 'zod';
import { validateConfig } from '../../config.js';

export const SABRE_CERT_BASE_URL = 'https://api.cert.platform.sabre.com';
export const SABRE_PROD_BASE_URL = 'https://api.platform.sabre.com';

export interface SabreConfig {
  environment: 'cert' | 'prod';
  clientId: string;
  clientSecret: string;
  pcc?: string;
  defaultCurrency: string;
}

export const sabreConfigSchema = z.object({
  environment: z.enum(['cert', 'prod']).default('cert'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  pcc: z.string().min(1).optional(),
  defaultCurrency: z.string().length(3).default('USD'),
});

export function validateSabreConfig(config: unknown): SabreConfig {
  return validateConfig(sabreConfigSchema, config, 'Sabre');
}

export function getBaseUrl(environment: SabreConfig['environment']): string {
  return environment === 'prod' ? SABRE_PROD_BASE_URL : SABRE_CERT_BASE_URL;
}
