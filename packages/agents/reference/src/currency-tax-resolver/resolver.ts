/**
 * Core resolution logic for Currency & Tax Code Resolver.
 *
 * Auto-detects currency vs tax code and resolves against static datasets.
 * All domain rules from the spec (agents/specs/0-6-currency-tax-code-resolver.yaml).
 */

import type {
  CurrencyTaxResolverInput,
  CurrencyTaxResolverOutput,
  CurrencyTaxCodeType,
} from './types.js';
import type { CurrencyRecord, TaxCodeRecord } from './types.js';

export interface CurrencyTaxIndexes {
  currencies: Map<string, CurrencyRecord>;
  taxCodes: Map<string, TaxCodeRecord>;
}

/**
 * Build lookup indexes from static data.
 */
export function buildIndexes(
  currencies: CurrencyRecord[],
  taxCodes: TaxCodeRecord[],
): CurrencyTaxIndexes {
  const currencyMap = new Map<string, CurrencyRecord>();
  for (const c of currencies) {
    currencyMap.set(c.code.toUpperCase(), c);
  }

  const taxMap = new Map<string, TaxCodeRecord>();
  for (const t of taxCodes) {
    taxMap.set(t.code.toUpperCase(), t);
  }

  return { currencies: currencyMap, taxCodes: taxMap };
}

/**
 * Auto-detect whether a code is a currency or tax code.
 *
 * Heuristics:
 * - 3 uppercase letters: try currency first (ISO 4217 standard is 3 letters)
 * - 2 uppercase letters: likely a tax code (IATA tax codes are 2 letters)
 * - 2 letters + digit(s): tax code (e.g., US1, US2)
 * - If ambiguous (3-letter code that's both), prefer currency
 */
export function classifyCode(
  code: string,
  codeType: CurrencyTaxCodeType | undefined,
  indexes: CurrencyTaxIndexes,
): 'currency' | 'tax' {
  if (codeType && codeType !== 'auto') {
    return codeType;
  }

  const upper = code.toUpperCase();

  // 2-letter or 2-letter+digit pattern → tax
  if (/^[A-Z]{2}\d*$/.test(upper) && upper.length <= 3 && upper.length >= 2) {
    // But check if it's also a 2-letter currency code (rare but exists)
    if (upper.length === 2) {
      return 'tax';
    }
    // 3 chars with digits: tax (e.g., US2)
    if (/\d/.test(upper)) {
      return 'tax';
    }
  }

  // 3 uppercase letters: check if it's a known currency
  if (/^[A-Z]{3}$/.test(upper)) {
    if (indexes.currencies.has(upper)) {
      return 'currency';
    }
    // Not a known currency — might be a tax code
    if (indexes.taxCodes.has(upper)) {
      return 'tax';
    }
    // Unknown 3-letter code — default to currency (ISO 4217 standard)
    return 'currency';
  }

  // Default to tax for other patterns
  return 'tax';
}

/**
 * Resolve a currency or tax code.
 */
export function resolve(
  input: CurrencyTaxResolverInput,
  indexes: CurrencyTaxIndexes,
): CurrencyTaxResolverOutput {
  const code = input.code.trim().toUpperCase();
  const codeType = classifyCode(code, input.code_type, indexes);

  if (codeType === 'currency') {
    const currency = indexes.currencies.get(code) ?? null;
    if (currency) {
      return {
        currency: { ...currency },
        tax: null,
        match_confidence: 1.0,
      };
    }
    // Not found as currency — fall back to tax
    const tax = indexes.taxCodes.get(code) ?? null;
    if (tax) {
      const filtered = applyCountryFilter(tax, input.country);
      if (filtered) {
        return {
          currency: null,
          tax: { ...filtered },
          match_confidence: 1.0,
        };
      }
    }
    return { currency: null, tax: null, match_confidence: 0 };
  }

  // Tax code resolution
  const tax = indexes.taxCodes.get(code) ?? null;
  if (tax) {
    const filtered = applyCountryFilter(tax, input.country);
    if (filtered) {
      return {
        currency: null,
        tax: { ...filtered },
        match_confidence: 1.0,
      };
    }
    // Tax exists but country filter excluded it
    return { currency: null, tax: null, match_confidence: 0 };
  }

  // Not found as tax — try currency as fallback
  const currency = indexes.currencies.get(code) ?? null;
  if (currency) {
    return {
      currency: { ...currency },
      tax: null,
      match_confidence: 1.0,
    };
  }

  return { currency: null, tax: null, match_confidence: 0 };
}

/**
 * Apply country filter if specified.
 * Returns the tax record if it matches the country, or if no filter is set.
 * Returns null if the tax doesn't apply to the specified country.
 */
function applyCountryFilter(
  tax: TaxCodeRecord,
  country: string | undefined,
): TaxCodeRecord | null {
  if (!country) {
    return tax;
  }

  // Carrier surcharges and multi-country taxes apply everywhere
  if (tax.country_code === null) {
    return tax;
  }

  // Check if the tax applies to the specified country
  if (tax.country_code.toUpperCase() === country.toUpperCase()) {
    return tax;
  }

  return null;
}
