/**
 * Rate comparator — core comparison logic.
 *
 * Sorts rates by total cost, identifies best value per rate type,
 * and provides currency normalization (mock exchange rates for v0.1.0).
 *
 * Domain source: OTAIP Lodging Knowledge Base §3 (Rate Types and Pricing)
 */

import type { CanonicalProperty } from '../types/hotel-common.js';
import type { ComparedRate, PropertyRateComparison } from './types.js';
import { calculateTotalCost } from './fee-calculator.js';
import { detectParity } from './parity-detector.js';

/**
 * Compare all rates for a canonical property across sources.
 * Returns rates sorted by total cost (lowest first) with parity analysis.
 */
export function comparePropertyRates(
  property: CanonicalProperty,
  nights: number,
  guests: number = 2,
): PropertyRateComparison {
  const allRates: ComparedRate[] = [];

  for (const sourceResult of property.sourceResults) {
    for (const rate of sourceResult.rates) {
      const totalCost = calculateTotalCost(rate, nights, guests);

      allRates.push({
        sourceId: sourceResult.source.sourceId,
        sourcePropertyId: sourceResult.source.sourcePropertyId,
        rateId: rate.rateId,
        roomTypeId: rate.roomTypeId,
        rateType: rate.rateType,
        paymentModel: rate.paymentModel,
        totalCost,
        cancellationPolicy: rate.cancellationPolicy,
        mealPlan: rate.mealPlan,
        originalRate: rate,
      });
    }
  }

  // Sort by grand total (lowest first)
  allRates.sort(
    (a, b) => parseFloat(a.totalCost.grandTotal.amount) - parseFloat(b.totalCost.grandTotal.amount),
  );

  // Best rate per rate type
  const bestByRateType: Record<string, ComparedRate> = {};
  for (const rate of allRates) {
    if (!bestByRateType[rate.rateType]) {
      bestByRateType[rate.rateType] = rate;
    }
  }

  // Parity analysis
  const parity = detectParity(allRates);

  return {
    canonicalId: property.canonicalId,
    propertyName: property.propertyName,
    rates: allRates,
    bestByRateType,
    parity,
  };
}
