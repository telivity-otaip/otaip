/**
 * Tax Calculation — Input/Output types
 *
 * Agent 2.3: Per-segment tax computation with exemption engine,
 * ~30 countries, ~50 tax codes, currency conversion.
 */

export interface TaxSegment {
  /** Origin airport IATA code */
  origin: string;
  /** Destination airport IATA code */
  destination: string;
  /** Origin country ISO 2-letter code */
  origin_country: string;
  /** Destination country ISO 2-letter code */
  destination_country: string;
  /** Carrier IATA code */
  carrier: string;
  /** Cabin class: economy | premium | business | first */
  cabin_class: CabinClass;
  /** Base fare in NUC for this segment (used for percentage-based taxes) */
  base_fare_nuc: string;
}

export type CabinClass = 'economy' | 'premium' | 'business' | 'first';

export type PassengerType = 'adult' | 'child' | 'infant' | 'crew' | 'diplomatic';

export type ExemptionType = 'infant' | 'transit' | 'crew' | 'diplomatic' | 'involuntary';

export interface TaxCalculationInput {
  /** Segments in the itinerary */
  segments: TaxSegment[];
  /** Passenger type */
  passenger_type: PassengerType;
  /** Whether this is a transit/connection (< 24h same ticket) */
  is_transit: boolean;
  /** Whether this is an involuntary reroute */
  is_involuntary: boolean;
  /** Total base fare in NUC (for percentage-based taxes) */
  total_base_fare_nuc: string;
  /** Selling currency (ISO 4217) for final aggregation */
  selling_currency: string;
}

export interface AppliedTax {
  /** Tax code (e.g., "US", "GB", "AY") */
  code: string;
  /** Tax name */
  name: string;
  /** Country of origin for this tax */
  country: string;
  /** Tax type: fixed, percentage, or tiered */
  type: 'fixed' | 'percentage' | 'tiered';
  /** Original tax amount in original currency */
  original_amount: string;
  /** Original currency */
  original_currency: string;
  /** Converted amount in selling currency */
  converted_amount: string;
  /** Which segment(s) this tax applies to (0-indexed) */
  segment_indices: number[];
  /** Whether this tax is interlineable */
  interlineable: boolean;
  /** Whether an exemption was applied */
  exempt: boolean;
  /** Exemption reason if exempt */
  exemption_reason: string | null;
}

export interface TaxBreakdown {
  /** Taxes grouped by country */
  by_country: Record<string, CountryTaxSummary>;
  /** Interlineable total in selling currency */
  interlineable_total: string;
  /** Non-interlineable total in selling currency */
  non_interlineable_total: string;
}

export interface CountryTaxSummary {
  /** Country code */
  country: string;
  /** Total tax amount in selling currency */
  total: string;
  /** Number of taxes applied */
  count: number;
}

export interface TaxCalculationOutput {
  /** All applied taxes */
  taxes: AppliedTax[];
  /** Total tax amount in selling currency */
  total_tax: string;
  /** Selling currency */
  currency: string;
  /** Tax breakdown */
  breakdown: TaxBreakdown;
  /** Exemptions applied */
  exemptions_applied: string[];
  /** Number of segments processed */
  segments_processed: number;
}
