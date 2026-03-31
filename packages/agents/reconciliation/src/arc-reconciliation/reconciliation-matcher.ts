/**
 * ARC Reconciliation Matcher
 *
 * Matches agency records against IAR records, validates commission
 * against contracts, manages ADM dispute windows.
 */

import Decimal from 'decimal.js';
import type {
  ARCAgencyRecord,
  IARRecord,
  ARCReconciliationInput,
  ARCReconciliationOutput,
  ARCDiscrepancy,
  ARCDiscrepancySeverity,
  ARCReconciliationSummary,
  ARCPatternDetection,
  AirlineContract,
} from './types.js';

const DEFAULT_THRESHOLD = '10.00';
const DEFAULT_ADM_DISPUTE_DAYS = 15;

function severity(type: string, amount: Decimal): ARCDiscrepancySeverity {
  if (type === 'MISSING_IN_IAR' || type === 'MISSING_IN_AGENCY') return 'critical';
  if (type === 'UNMATCHED_ADM' || type === 'ADM_DISPUTE_WINDOW_EXPIRING') return 'high';
  if (amount.abs().greaterThan(100)) return 'high';
  if (amount.abs().greaterThan(50)) return 'medium';
  return 'low';
}

function findContract(contracts: AirlineContract[], airlineCode: string, issueDate: string): AirlineContract | undefined {
  return contracts.find((c) => {
    if (c.airline_code !== airlineCode) return false;
    if (issueDate < c.effective_from) return false;
    if (c.effective_to && issueDate > c.effective_to) return false;
    return true;
  });
}

function matchRecords(input: ARCReconciliationInput): ARCReconciliationOutput {
  const threshold = new Decimal(input.min_threshold ?? DEFAULT_THRESHOLD);
  const disputeWindowDays = input.adm_dispute_window_days ?? DEFAULT_ADM_DISPUTE_DAYS;
  const now = input.current_datetime ? new Date(input.current_datetime) : new Date();
  const discrepancies: ARCDiscrepancy[] = [];
  const contracts = input.contracts ?? [];

  // Index IAR by document number
  const iarByDoc = new Map<string, IARRecord[]>();
  for (const iar of input.iar_records) {
    const existing = iarByDoc.get(iar.document_number) ?? [];
    existing.push(iar);
    iarByDoc.set(iar.document_number, existing);
  }

  // Index agency by ticket number
  const agencyByTicket = new Map<string, ARCAgencyRecord[]>();
  for (const ar of input.agency_records) {
    const existing = agencyByTicket.get(ar.ticket_number) ?? [];
    existing.push(ar);
    agencyByTicket.set(ar.ticket_number, existing);
  }

  let matchedCount = 0;
  let totalAdm = 0;
  let totalAcm = 0;
  let admDisputeExpiring = 0;

  // Count ADMs/ACMs and check dispute windows
  for (const iar of input.iar_records) {
    if (iar.transaction_type === 'ADM') {
      totalAdm++;
      if (iar.adm_issue_date) {
        const issueDate = new Date(iar.adm_issue_date);
        const daysSinceIssue = Math.floor((now.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysRemaining = disputeWindowDays - daysSinceIssue;
        if (daysRemaining > 0 && daysRemaining <= 5) {
          admDisputeExpiring++;
          discrepancies.push({
            type: 'ADM_DISPUTE_WINDOW_EXPIRING',
            severity: 'high',
            document_number: iar.document_number,
            airline_code: iar.airline_code,
            iar_amount: iar.total_amount,
            currency: iar.currency,
            dispute_days_remaining: daysRemaining,
            description: `ADM ${iar.document_number} dispute window expires in ${daysRemaining} day(s).`,
          });
        }
      }
    }
    if (iar.transaction_type === 'ACM') totalAcm++;
  }

  // Match agency records to IAR
  for (const [ticketNum, agencyRecs] of agencyByTicket) {
    const iarRecs = iarByDoc.get(ticketNum);

    if (!iarRecs || iarRecs.length === 0) {
      for (const ar of agencyRecs) {
        const amount = new Decimal(ar.total_amount);
        if (amount.abs().greaterThanOrEqualTo(threshold)) {
          discrepancies.push({
            type: 'MISSING_IN_IAR',
            severity: 'critical',
            document_number: ticketNum,
            airline_code: ar.airline_code,
            agency_amount: ar.total_amount,
            currency: ar.currency,
            description: `Ticket ${ticketNum} in agency records but not in ARC IAR.`,
          });
        }
      }
      continue;
    }

    for (const ar of agencyRecs) {
      const matchingIar = iarRecs.find((r) => r.transaction_type === ar.transaction_type);

      if (!matchingIar) {
        discrepancies.push({
          type: 'MISSING_IN_IAR',
          severity: 'critical',
          document_number: ticketNum,
          airline_code: ar.airline_code,
          agency_amount: ar.total_amount,
          currency: ar.currency,
          description: `Ticket ${ticketNum} ${ar.transaction_type} not in IAR.`,
        });
        continue;
      }

      matchedCount++;

      // Currency mismatch
      if (ar.currency !== matchingIar.currency) {
        discrepancies.push({
          type: 'CURRENCY_MISMATCH',
          severity: 'high',
          document_number: ticketNum,
          airline_code: ar.airline_code,
          currency: ar.currency,
          description: `Currency mismatch on ${ticketNum}: agency ${ar.currency}, IAR ${matchingIar.currency}.`,
        });
        continue;
      }

      // Amount mismatch
      const agencyAmt = new Decimal(ar.total_amount);
      const iarAmt = new Decimal(matchingIar.total_amount);
      const amtDiff = agencyAmt.minus(iarAmt).abs();

      if (amtDiff.greaterThanOrEqualTo(threshold)) {
        discrepancies.push({
          type: 'AMOUNT_MISMATCH',
          severity: severity('AMOUNT_MISMATCH', amtDiff),
          document_number: ticketNum,
          airline_code: ar.airline_code,
          agency_amount: ar.total_amount,
          iar_amount: matchingIar.total_amount,
          difference: amtDiff.toFixed(2),
          currency: ar.currency,
          description: `Amount mismatch on ${ticketNum}: agency ${ar.total_amount}, IAR ${matchingIar.total_amount}.`,
        });
      }

      // Commission mismatch
      const agencyComm = new Decimal(ar.commission_amount);
      const iarComm = new Decimal(matchingIar.commission_amount);
      const commDiff = agencyComm.minus(iarComm).abs();

      if (commDiff.greaterThanOrEqualTo(threshold)) {
        discrepancies.push({
          type: 'COMMISSION_MISMATCH',
          severity: severity('COMMISSION_MISMATCH', commDiff),
          document_number: ticketNum,
          airline_code: ar.airline_code,
          agency_amount: ar.commission_amount,
          iar_amount: matchingIar.commission_amount,
          difference: commDiff.toFixed(2),
          currency: ar.currency,
          description: `Commission mismatch on ${ticketNum}: agency ${ar.commission_amount}, IAR ${matchingIar.commission_amount}.`,
        });
      }

      // Contract commission validation
      if (contracts.length > 0 && matchingIar.commission_rate != null) {
        const contract = findContract(contracts, ar.airline_code, ar.issue_date);
        if (contract && matchingIar.commission_rate > contract.contracted_rate) {
          discrepancies.push({
            type: 'COMMISSION_MISMATCH',
            severity: 'high',
            document_number: ticketNum,
            airline_code: ar.airline_code,
            agency_amount: `${matchingIar.commission_rate}%`,
            iar_amount: `${contract.contracted_rate}%`,
            currency: ar.currency,
            description: `Commission rate ${matchingIar.commission_rate}% on ${ticketNum} exceeds contracted rate ${contract.contracted_rate}% for ${ar.airline_code}.`,
          });
        }
      }
    }
  }

  // IAR records missing in agency
  for (const [docNum, iarRecs] of iarByDoc) {
    if (!agencyByTicket.has(docNum)) {
      for (const iar of iarRecs) {
        const amount = new Decimal(iar.total_amount);
        if (amount.abs().greaterThanOrEqualTo(threshold)) {
          if (iar.transaction_type === 'ADM') {
            discrepancies.push({
              type: 'UNMATCHED_ADM',
              severity: 'high',
              document_number: docNum,
              airline_code: iar.airline_code,
              iar_amount: iar.total_amount,
              currency: iar.currency,
              description: `ADM ${docNum} in IAR not matched in agency records.`,
            });
          } else if (iar.transaction_type === 'ACM') {
            discrepancies.push({
              type: 'UNMATCHED_ACM',
              severity: 'medium',
              document_number: docNum,
              airline_code: iar.airline_code,
              iar_amount: iar.total_amount,
              currency: iar.currency,
              description: `ACM ${docNum} in IAR not matched in agency records.`,
            });
          } else {
            discrepancies.push({
              type: 'MISSING_IN_AGENCY',
              severity: 'critical',
              document_number: docNum,
              airline_code: iar.airline_code,
              iar_amount: iar.total_amount,
              currency: iar.currency,
              description: `Document ${docNum} in IAR but not in agency records.`,
            });
          }
        }
      }
    }
  }

  // Duplicate detection
  for (const [docNum, iarRecs] of iarByDoc) {
    const sales = iarRecs.filter((r) => r.transaction_type === 'SALE');
    if (sales.length > 1) {
      discrepancies.push({
        type: 'DUPLICATE_TRANSACTION',
        severity: 'high',
        document_number: docNum,
        airline_code: sales[0]!.airline_code,
        iar_amount: sales[0]!.total_amount,
        currency: sales[0]!.currency,
        description: `Duplicate SALE for ${docNum} in IAR (${sales.length} occurrences).`,
      });
    }
  }

  // Net remittance calculation
  let netRemittance = new Decimal(0);
  for (const iar of input.iar_records) {
    if (iar.net_remittance) {
      netRemittance = netRemittance.plus(new Decimal(iar.net_remittance));
    } else {
      const amount = new Decimal(iar.total_amount);
      const commission = new Decimal(iar.commission_amount);
      if (iar.transaction_type === 'SALE') {
        netRemittance = netRemittance.plus(amount.minus(commission));
      } else if (iar.transaction_type === 'REFUND') {
        netRemittance = netRemittance.minus(amount.minus(commission));
      } else if (iar.transaction_type === 'ADM') {
        netRemittance = netRemittance.plus(amount);
      } else if (iar.transaction_type === 'ACM') {
        netRemittance = netRemittance.minus(amount);
      }
    }
  }

  // Pattern detection
  const patterns = detectPatterns(discrepancies, input);

  const totalDiscrepancyAmount = discrepancies.reduce(
    (sum, d) => {
      const raw = d.difference ?? d.agency_amount ?? d.iar_amount ?? '0';
      // Skip non-numeric values (e.g., "7%" from commission rate checks)
      if (isNaN(Number(raw))) return sum;
      return sum.plus(new Decimal(raw));
    },
    new Decimal(0),
  );

  const summary: ARCReconciliationSummary = {
    total_agency_records: input.agency_records.length,
    total_iar_records: input.iar_records.length,
    matched_count: matchedCount,
    discrepancy_count: discrepancies.length,
    critical_count: discrepancies.filter((d) => d.severity === 'critical').length,
    total_discrepancy_amount: totalDiscrepancyAmount.toFixed(2),
    net_remittance: netRemittance.toFixed(2),
    currency: input.threshold_currency ?? 'USD',
    adm_count: totalAdm,
    acm_count: totalAcm,
    adm_dispute_expiring_count: admDisputeExpiring,
    patterns,
  };

  const passed = discrepancies.filter((d) => d.severity === 'critical').length === 0;

  return { discrepancies, summary, passed };
}

function detectPatterns(discrepancies: ARCDiscrepancy[], input: ARCReconciliationInput): ARCPatternDetection[] {
  const patterns: ARCPatternDetection[] = [];
  if (discrepancies.length < 10) return patterns;

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
        description: `Recurring commission mismatch for ${airline}: ${data.count} documents.`,
      });
    }
  }

  const admByAirline = new Map<string, number>();
  for (const d of discrepancies) {
    if (d.type === 'UNMATCHED_ADM' && d.airline_code) {
      admByAirline.set(d.airline_code, (admByAirline.get(d.airline_code) ?? 0) + 1);
    }
  }
  for (const [airline, count] of admByAirline) {
    if (count >= 3) {
      patterns.push({
        pattern: 'RECURRING_UNMATCHED_ADM',
        count,
        total_amount: '0.00',
        currency: input.threshold_currency ?? 'USD',
        description: `Recurring unmatched ADMs from ${airline}: ${count} items.`,
      });
    }
  }

  return patterns;
}

export { matchRecords };
