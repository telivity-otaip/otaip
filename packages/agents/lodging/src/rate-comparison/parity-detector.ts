/**
 * Rate parity detection.
 *
 * Detects rate parity/disparity across sources for the same property.
 * Rate parity means consistent rates across direct website and all OTA/GDS channels.
 *
 * EU Digital Markets Act (March 2024) banned explicit contractual rate parity clauses.
 * OTAs shifted to algorithmic enforcement via ranking algorithms.
 *
 * Domain source: OTAIP Lodging Knowledge Base §3 (Rate Parity)
 */

import type { ComparedRate, ParityResult } from './types.js';

/** Parity threshold: rates within 2% spread are considered "at parity" */
const PARITY_THRESHOLD_PERCENT = 2.0;

/**
 * Detect rate parity across multiple sources for the same property.
 * Compares BAR (Best Available Rate) across sources.
 * Returns null if fewer than 2 comparable rates.
 */
export function detectParity(rates: ComparedRate[]): ParityResult | null {
  // Only compare BAR rates for parity analysis
  const barRates = rates.filter((r) => r.rateType === 'bar');

  if (barRates.length < 2) {
    return null;
  }

  const amounts = barRates.map((r) => ({
    sourceId: r.sourceId,
    total: parseFloat(r.totalCost.grandTotal.amount),
  }));

  amounts.sort((a, b) => a.total - b.total);

  const lowest = amounts[0]!;
  const highest = amounts[amounts.length - 1]!;

  const spreadPercent =
    lowest.total > 0 ? ((highest.total - lowest.total) / lowest.total) * 100 : 0;

  return {
    isAtParity: spreadPercent <= PARITY_THRESHOLD_PERCENT,
    lowestSource: lowest.sourceId,
    highestSource: highest.sourceId,
    spreadPercent: Math.round(spreadPercent * 100) / 100,
  };
}
