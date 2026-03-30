/**
 * Currency & Tax Code Resolver — Agent 0.6
 *
 * Resolves ISO 4217 currency codes and IATA tax/surcharge codes
 * used in airline pricing and ticketing.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  AgentHealthStatus,
} from '@otaip/core';
import {
  AgentNotInitializedError,
  AgentInputValidationError,
} from '@otaip/core';
import type {
  CurrencyTaxResolverInput,
  CurrencyTaxResolverOutput,
} from './types.js';
import { CURRENCIES, TAX_CODES } from './data.js';
import { buildIndexes, resolve } from './resolver.js';
import type { CurrencyTaxIndexes } from './resolver.js';

const VALID_CODE_TYPES = new Set(['currency', 'tax', 'auto']);

export class CurrencyTaxResolver
  implements Agent<CurrencyTaxResolverInput, CurrencyTaxResolverOutput>
{
  readonly id = '0.6';
  readonly name = 'Currency & Tax Code Resolver';
  readonly version = '0.1.0';

  private indexes: CurrencyTaxIndexes | null = null;

  async initialize(): Promise<void> {
    this.indexes = buildIndexes(CURRENCIES, TAX_CODES);
  }

  async execute(
    input: AgentInput<CurrencyTaxResolverInput>,
  ): Promise<AgentOutput<CurrencyTaxResolverOutput>> {
    if (!this.indexes) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = resolve(input.data, this.indexes);

    return {
      data: result,
      confidence: result.match_confidence,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        currency_count: CURRENCIES.length,
        tax_code_count: TAX_CODES.length,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.indexes) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }

    if (CURRENCIES.length === 0 || TAX_CODES.length === 0) {
      return { status: 'unhealthy', details: 'Reference dataset is empty.' };
    }

    return { status: 'healthy' };
  }

  private validateInput(data: CurrencyTaxResolverInput): void {
    if (!data.code || typeof data.code !== 'string') {
      throw new AgentInputValidationError(
        this.id,
        'code',
        'Required string field. Provide an ISO currency code or IATA tax code.',
      );
    }

    const trimmed = data.code.trim();
    if (trimmed.length < 1 || trimmed.length > 10) {
      throw new AgentInputValidationError(this.id, 'code', 'Must be 1-10 characters.');
    }

    if (data.code_type !== undefined && !VALID_CODE_TYPES.has(data.code_type)) {
      throw new AgentInputValidationError(
        this.id,
        'code_type',
        `Must be one of: ${[...VALID_CODE_TYPES].join(', ')}`,
      );
    }
  }

  /**
   * Tear down resources (used in testing).
   */
  destroy(): void {
    this.indexes = null;
  }
}

export type { CurrencyTaxResolverInput, CurrencyTaxResolverOutput } from './types.js';
export type {
  ResolvedCurrency,
  ResolvedTax,
  CurrencyTaxCodeType,
  TaxCategory,
  TaxAppliesTo,
} from './types.js';
