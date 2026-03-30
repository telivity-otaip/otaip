/**
 * Currency & Tax Code Resolver — Input/Output types
 *
 * Agent 0.6: Resolves ISO 4217 currency codes and IATA tax/surcharge codes
 * used in airline pricing and ticketing.
 * All types derived from the approved spec (agents/specs/0-6-currency-tax-code-resolver.yaml).
 */

export type CurrencyTaxCodeType = 'currency' | 'tax' | 'auto';

export type TaxCategory =
  | 'carrier_surcharge'
  | 'government_tax'
  | 'airport_fee'
  | 'security_fee'
  | 'immigration'
  | 'customs'
  | 'other';

export type TaxAppliesTo = 'departure' | 'arrival' | 'transit' | 'ticketing' | 'both';

export interface CurrencyTaxResolverInput {
  /** ISO 4217 currency code, IATA tax code, or tax code with amount */
  code: string;
  /** Hint for resolution type. Auto-detected if omitted. */
  code_type?: CurrencyTaxCodeType;
  /** ISO 2-letter country code to filter tax applicability */
  country?: string;
}

export interface ResolvedCurrency {
  code: string;
  numeric_code: string;
  name: string;
  symbol: string | null;
  minor_units: number;
  countries: string[];
  is_active: boolean;
}

export interface ResolvedTax {
  code: string;
  name: string;
  description: string;
  category: TaxCategory;
  country_code: string | null;
  country_name: string | null;
  applies_to: TaxAppliesTo | null;
  is_percentage: boolean;
  /** Additional context about the tax */
  note: string | null;
  // TODO: [NEEDS DOMAIN INPUT] Actual tax amounts require live ATPCO/SITA data feeds
}

export interface CurrencyTaxResolverOutput {
  currency: ResolvedCurrency | null;
  tax: ResolvedTax | null;
  match_confidence: number;
}

/** Internal currency record */
export interface CurrencyRecord {
  code: string;
  numeric_code: string;
  name: string;
  symbol: string | null;
  minor_units: number;
  countries: string[];
  is_active: boolean;
}

/** Internal tax code record */
export interface TaxCodeRecord {
  code: string;
  name: string;
  description: string;
  category: TaxCategory;
  country_code: string | null;
  country_name: string | null;
  applies_to: TaxAppliesTo | null;
  is_percentage: boolean;
  note: string | null;
}
