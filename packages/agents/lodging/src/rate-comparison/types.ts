/**
 * Rate Comparison Agent — Input/Output types
 *
 * Agent 4.4: Compares rates for the same canonical property across all sources,
 * identifies best available rate per rate type, detects rate parity violations.
 *
 * Domain source: OTAIP Lodging Knowledge Base §3 (Rate Types and Pricing)
 */

import type {
  CanonicalProperty,
  RawRate,
  MonetaryAmount,
  RateType,
  CancellationPolicy,
  PaymentModel,
} from '../types/hotel-common.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface RateCompInput {
  /** Canonical properties with source results containing rates */
  properties: CanonicalProperty[];
  /** Preferred currency for display (default: USD) */
  currency?: string;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface TotalCostBreakdown {
  /** Base room charges for entire stay */
  roomCharges: MonetaryAmount;
  /** Total mandatory fees (resort fees, destination fees, etc.) */
  mandatoryFees: MonetaryAmount;
  /** Total taxes */
  taxes: MonetaryAmount;
  /** Grand total = roomCharges + mandatoryFees + taxes */
  grandTotal: MonetaryAmount;
}

export interface ComparedRate {
  /** Source this rate came from */
  sourceId: string;
  sourcePropertyId: string;
  /** Original rate details */
  rateId: string;
  roomTypeId: string;
  rateType: RateType;
  paymentModel: PaymentModel;
  /** Total cost breakdown including ALL mandatory fees */
  totalCost: TotalCostBreakdown;
  /** Cancellation policy for this rate */
  cancellationPolicy: CancellationPolicy;
  /** Meal plan if included */
  mealPlan?: string;
  /** Original rate for reference */
  originalRate: RawRate;
}

export interface ParityResult {
  /** Whether rates are at parity (within 2% spread) */
  isAtParity: boolean;
  /** Source with the lowest total cost */
  lowestSource: string;
  /** Source with the highest total cost */
  highestSource: string;
  /** Percentage spread between lowest and highest */
  spreadPercent: number;
}

export interface PropertyRateComparison {
  /** Canonical property ID */
  canonicalId: string;
  propertyName: string;
  /** All rates sorted by total cost (lowest first) */
  rates: ComparedRate[];
  /** Best rate per rate type */
  bestByRateType: Record<string, ComparedRate>;
  /** Rate parity analysis */
  parity: ParityResult | null;
}

export interface RateCompOutput {
  /** Rate comparisons per property */
  comparisons: PropertyRateComparison[];
  /** Total properties compared */
  totalProperties: number;
  /** Properties with rate parity violations */
  parityViolations: number;
}
