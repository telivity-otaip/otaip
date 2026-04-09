/**
 * BSP Reconciliation Matcher
 *
 * Matches agency records against HOT file records, detects discrepancies.
 */

import Decimal from 'decimal.js';
import type {
  AgencyRecord,
  HOTFileRecord,
  BSPReconciliationInput,
  BSPReconciliationOutput,
  Discrepancy,
  DiscrepancySeverity,
  ReconciliationSummary,
  PatternDetection,
} from './types.js';

const DEFAULT_THRESHOLD = '10.00';

function severity(type: string, amount: Decimal): DiscrepancySeverity {
  if (type === 'MISSING_IN_HOT' || type === 'MISSING_IN_AGENCY') return 'critical';
  if (type === 'UNMATCHED_ADM') return 'high';
  if (amount.abs().greaterThan(100)) return 'high';
  if (amount.abs().greaterThan(50)) return 'medium';
  return 'low';
}

function matchRecords(input: BSPReconciliationInput): BSPReconciliationOutput {
  const threshold = new Decimal(input.min_threshold ?? DEFAULT_THRESHOLD);
  const discrepancies: Discrepancy[] = [];

  // Index HOT records by ticket number
  const hotByTicket = new Map<string, HOTFileRecord[]>();
  for (const hot of input.hot_records) {
    const existing = hotByTicket.get(hot.ticket_number) ?? [];
    existing.push(hot);
    hotByTicket.set(hot.ticket_number, existing);
  }

  // Index agency records by ticket number
  const agencyByTicket = new Map<string, AgencyRecord[]>();
  for (const ar of input.agency_records) {
    const existing = agencyByTicket.get(ar.ticket_number) ?? [];
    existing.push(ar);
    agencyByTicket.set(ar.ticket_number, existing);
  }

  let matchedCount = 0;

  // Check each agency record against HOT
  for (const [ticketNum, agencyRecs] of agencyByTicket) {
    const hotRecs = hotByTicket.get(ticketNum);

    if (!hotRecs || hotRecs.length === 0) {
      // Missing in HOT
      for (const ar of agencyRecs) {
        const amount = new Decimal(ar.ticket_amount);
        if (amount.abs().greaterThanOrEqualTo(threshold)) {
          discrepancies.push({
            type: 'MISSING_IN_HOT',
            severity: 'critical',
            ticket_number: ticketNum,
            airline_code: ar.airline_code,
            agency_amount: ar.ticket_amount,
            currency: ar.currency,
            description: `Ticket ${ticketNum} exists in agency records but not in BSP HOT file.`,
          });
        }
      }
      continue;
    }

    // Match each agency record to a HOT record
    for (const ar of agencyRecs) {
      const matchingHot = hotRecs.find((h) => h.transaction_type === ar.transaction_type);

      if (!matchingHot) {
        discrepancies.push({
          type: 'MISSING_IN_HOT',
          severity: 'critical',
          ticket_number: ticketNum,
          airline_code: ar.airline_code,
          agency_amount: ar.ticket_amount,
          currency: ar.currency,
          description: `Ticket ${ticketNum} ${ar.transaction_type} not found in HOT file.`,
        });
        continue;
      }

      matchedCount++;

      // Currency mismatch
      if (ar.currency !== matchingHot.currency) {
        discrepancies.push({
          type: 'CURRENCY_MISMATCH',
          severity: 'high',
          ticket_number: ticketNum,
          airline_code: ar.airline_code,
          currency: ar.currency,
          description: `Currency mismatch on ${ticketNum}: agency ${ar.currency}, BSP ${matchingHot.currency}.`,
        });
        continue;
      }

      // Amount mismatch
      const agencyAmt = new Decimal(ar.ticket_amount);
      const hotAmt = new Decimal(matchingHot.ticket_amount);
      const amtDiff = agencyAmt.minus(hotAmt).abs();

      if (amtDiff.greaterThanOrEqualTo(threshold)) {
        discrepancies.push({
          type: 'AMOUNT_MISMATCH',
          severity: severity('AMOUNT_MISMATCH', amtDiff),
          ticket_number: ticketNum,
          airline_code: ar.airline_code,
          agency_amount: ar.ticket_amount,
          bsp_amount: matchingHot.ticket_amount,
          difference: amtDiff.toFixed(2),
          currency: ar.currency,
          description: `Amount mismatch on ${ticketNum}: agency ${ar.ticket_amount}, BSP ${matchingHot.ticket_amount} (diff ${amtDiff.toFixed(2)} ${ar.currency}).`,
        });
      }

      // Commission mismatch
      const agencyComm = new Decimal(ar.commission_amount);
      const hotComm = new Decimal(matchingHot.commission_amount);
      const commDiff = agencyComm.minus(hotComm).abs();

      if (commDiff.greaterThanOrEqualTo(threshold)) {
        discrepancies.push({
          type: 'COMMISSION_MISMATCH',
          severity: severity('COMMISSION_MISMATCH', commDiff),
          ticket_number: ticketNum,
          airline_code: ar.airline_code,
          agency_amount: ar.commission_amount,
          bsp_amount: matchingHot.commission_amount,
          difference: commDiff.toFixed(2),
          currency: ar.currency,
          description: `Commission mismatch on ${ticketNum}: agency ${ar.commission_amount}, BSP ${matchingHot.commission_amount} (diff ${commDiff.toFixed(2)} ${ar.currency}).`,
        });
      }
    }
  }

  // Check for HOT records missing in agency
  for (const [ticketNum, hotRecs] of hotByTicket) {
    if (!agencyByTicket.has(ticketNum)) {
      for (const hot of hotRecs) {
        const amount = new Decimal(hot.ticket_amount);
        if (amount.abs().greaterThanOrEqualTo(threshold)) {
          if (hot.transaction_type === 'ADM') {
            discrepancies.push({
              type: 'UNMATCHED_ADM',
              severity: 'high',
              ticket_number: ticketNum,
              airline_code: hot.airline_code,
              bsp_amount: hot.ticket_amount,
              currency: hot.currency,
              description: `ADM ${ticketNum} in BSP HOT file not matched in agency records.`,
            });
          } else if (hot.transaction_type === 'ACM') {
            discrepancies.push({
              type: 'UNMATCHED_ACM',
              severity: 'medium',
              ticket_number: ticketNum,
              airline_code: hot.airline_code,
              bsp_amount: hot.ticket_amount,
              currency: hot.currency,
              description: `ACM ${ticketNum} in BSP HOT file not matched in agency records.`,
            });
          } else {
            discrepancies.push({
              type: 'MISSING_IN_AGENCY',
              severity: 'critical',
              ticket_number: ticketNum,
              airline_code: hot.airline_code,
              bsp_amount: hot.ticket_amount,
              currency: hot.currency,
              description: `Ticket ${ticketNum} in BSP HOT file but not in agency records.`,
            });
          }
        }
      }
    }
  }

  // Duplicate detection within HOT
  for (const [ticketNum, hotRecs] of hotByTicket) {
    const sales = hotRecs.filter((r) => r.transaction_type === 'SALE');
    if (sales.length > 1) {
      discrepancies.push({
        type: 'DUPLICATE_TRANSACTION',
        severity: 'high',
        ticket_number: ticketNum,
        airline_code: sales[0]!.airline_code,
        bsp_amount: sales[0]!.ticket_amount,
        currency: sales[0]!.currency,
        description: `Duplicate SALE for ${ticketNum} in HOT file (${sales.length} occurrences).`,
      });
    }
  }

  // Pattern detection
  const patterns = detectPatterns(discrepancies, input);

  // Summary
  const totalDiscrepancyAmount = discrepancies.reduce(
    (sum, d) => sum.plus(new Decimal(d.difference ?? d.agency_amount ?? d.bsp_amount ?? '0')),
    new Decimal(0),
  );

  const summary: ReconciliationSummary = {
    total_agency_records: input.agency_records.length,
    total_hot_records: input.hot_records.length,
    matched_count: matchedCount,
    discrepancy_count: discrepancies.length,
    critical_count: discrepancies.filter((d) => d.severity === 'critical').length,
    total_discrepancy_amount: totalDiscrepancyAmount.toFixed(2),
    currency: input.threshold_currency ?? 'USD',
    patterns,
  };

  const passed = discrepancies.filter((d) => d.severity === 'critical').length === 0;

  return { discrepancies, summary, passed };
}

function detectPatterns(
  discrepancies: Discrepancy[],
  input: BSPReconciliationInput,
): PatternDetection[] {
  const patterns: PatternDetection[] = [];

  // Only detect patterns with sample size >= 10
  if (discrepancies.length < 10) return patterns;

  // Pattern: commission mismatches by airline
  const commByAirline = new Map<string, { count: number; total: Decimal }>();
  for (const d of discrepancies) {
    if (d.type === 'COMMISSION_MISMATCH' && d.airline_code) {
      const existing = commByAirline.get(d.airline_code) ?? { count: 0, total: new Decimal(0) };
      existing.count++;
      existing.total = existing.total.plus(new Decimal(d.difference ?? '0'));
      commByAirline.set(d.airline_code, existing);
    }
  }
  for (const [airline, data] of commByAirline) {
    if (data.count >= 3) {
      patterns.push({
        pattern: 'RECURRING_COMMISSION_MISMATCH',
        count: data.count,
        total_amount: data.total.toFixed(2),
        currency: input.threshold_currency ?? 'USD',
        description: `Recurring commission mismatch for airline ${airline}: ${data.count} tickets, total ${data.total.toFixed(2)}.`,
      });
    }
  }

  // Pattern: missing transactions by airline
  const missingByAirline = new Map<string, number>();
  for (const d of discrepancies) {
    if ((d.type === 'MISSING_IN_HOT' || d.type === 'MISSING_IN_AGENCY') && d.airline_code) {
      missingByAirline.set(d.airline_code, (missingByAirline.get(d.airline_code) ?? 0) + 1);
    }
  }
  for (const [airline, count] of missingByAirline) {
    if (count >= 3) {
      patterns.push({
        pattern: 'RECURRING_MISSING_TRANSACTIONS',
        count,
        total_amount: '0.00',
        currency: input.threshold_currency ?? 'USD',
        description: `Recurring missing transactions for airline ${airline}: ${count} tickets unmatched.`,
      });
    }
  }

  return patterns;
}

export { matchRecords };
