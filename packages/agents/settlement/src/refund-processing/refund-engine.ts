/**
 * Refund Processing Engine — penalty calc, commission recall,
 * tax refund, conjunction handling, BSP/ARC reporting.
 *
 * No invented penalty amounts.
 *
 * - When `input.cat33_rules` is provided, the engine applies the filed
 *   rules: pattern-match the fare basis, use the rule's penalty and
 *   forfeit-base-fare flag.
 * - When `input.cat33_rules` is absent, the engine uses the ATPCO
 *   default per the project's domain spec: voluntary refunds incur NO
 *   penalty; involuntary refunds are full refunds.
 *
 * The previous "$200 default penalty" fallback was a CLAUDE.md
 * violation and has been removed.
 *
 * // DOMAIN_QUESTION: per-carrier ATPCO Cat33 data ingestion pipeline.
 */

import Decimal from 'decimal.js';
import type {
  RefundProcessingInput,
  RefundProcessingOutput,
  RefundRecord,
  RefundAuditTrail,
  RefundPenaltyRule,
  TaxItem,
  BspRefundFields,
  ArcRefundFields,
  Cat33Rules,
} from './types.js';

function sumTaxes(taxes: TaxItem[]): Decimal {
  let total = new Decimal(0);
  for (const t of taxes) {
    total = total.plus(new Decimal(t.amount));
  }
  return total;
}

function findPenaltyRule(
  rules: Cat33Rules | undefined,
  fareBasis: string,
): RefundPenaltyRule | undefined {
  if (!rules) return undefined;
  for (const rule of rules.rules) {
    if (new RegExp(rule.fare_basis_pattern).test(fareBasis)) {
      return rule;
    }
  }
  return undefined;
}

function calculateCommissionRecall(input: RefundProcessingInput, baseFareRefund: Decimal): Decimal {
  if (!input.commission) return new Decimal(0);

  const originalBase = new Decimal(input.base_fare);
  if (originalBase.equals(0)) return new Decimal(0);

  const commissionAmount = new Decimal(input.commission.amount);
  // Proportional recall: commission * (refund_base / original_base)
  return commissionAmount.times(baseFareRefund).dividedBy(originalBase).toDecimalPlaces(2);
}

function buildBspFields(
  input: RefundProcessingInput,
  totalRefund: Decimal,
  taxBreakdown: TaxItem[],
  penalty: Decimal,
): BspRefundFields {
  const currentDate = input.current_date ?? new Date().toISOString().slice(0, 10);
  return {
    original_ticket_number: input.ticket_number,
    refund_amount: totalRefund.toFixed(2),
    tax_breakdown: taxBreakdown,
    penalty_applied: penalty.toFixed(2),
    refund_indicator: 'R',
    settlement_code: `BSP-${currentDate.replace(/-/g, '')}`,
    remittance_currency: input.base_fare_currency,
  };
}

function buildArcFields(
  input: RefundProcessingInput,
  totalRefund: Decimal,
  taxBreakdown: TaxItem[],
  penalty: Decimal,
): ArcRefundFields {
  const currentDate = input.current_date ?? new Date().toISOString().slice(0, 10);
  return {
    original_document_number: input.ticket_number,
    total_refund: totalRefund.toFixed(2),
    tax_refund_breakdown: taxBreakdown,
    penalty_deducted: penalty.toFixed(2),
    refund_type_indicator: 'R',
    settlement_week: `ARC-WK${currentDate.slice(5, 7)}${currentDate.slice(8, 10)}`,
  };
}

export function processRefund(input: RefundProcessingInput): RefundProcessingOutput {
  const originalBase = new Decimal(input.base_fare);
  const originalTax = sumTaxes(input.taxes);
  const rule = findPenaltyRule(input.cat33_rules, input.fare_basis);
  const isInvoluntary = input.is_involuntary === true;

  const hasWaiver = !!input.waiver_code;

  let baseFareRefund: Decimal;
  let taxRefund: Decimal;
  let taxBreakdown: TaxItem[];
  let penalty: Decimal;
  let couponsRefunded: number[];

  switch (input.refund_type) {
    case 'FULL': {
      // Full refund — all unused coupons.
      // Penalty source-of-truth:
      //   - involuntary               → 0 (carrier-initiated)
      //   - waiver code present       → 0 (waiver bypasses penalty)
      //   - filed forfeit_base_fare   → entire base forfeited
      //   - filed penalty_amount      → that amount
      //   - no rule + voluntary       → 0 (ATPCO default, no invention)
      if (isInvoluntary || hasWaiver) {
        baseFareRefund = originalBase;
        penalty = new Decimal(0);
      } else if (rule?.forfeit_base_fare && !input.is_refundable) {
        baseFareRefund = new Decimal(0);
        penalty = new Decimal(0);
      } else if (rule) {
        const penaltyAmount = new Decimal(rule.penalty_amount);
        penalty = Decimal.min(penaltyAmount, originalBase);
        baseFareRefund = originalBase.minus(penalty);
      } else {
        // No rule supplied → ATPCO default for voluntary refund: no penalty.
        baseFareRefund = originalBase;
        penalty = new Decimal(0);
      }
      taxRefund = originalTax;
      taxBreakdown = input.taxes;
      couponsRefunded = Array.from({ length: input.total_coupons }, (_, i) => i + 1);
      break;
    }

    case 'PARTIAL': {
      // Partial refund — specific coupons only.
      const refundableCoupons = (input.coupons_to_refund ?? []).filter((c) => c.refundable);
      const couponRatio =
        input.total_coupons > 0
          ? new Decimal(refundableCoupons.length).dividedBy(input.total_coupons)
          : new Decimal(0);

      const proratedBase = originalBase.times(couponRatio).toDecimalPlaces(2);

      if (isInvoluntary || hasWaiver) {
        baseFareRefund = proratedBase;
        penalty = new Decimal(0);
      } else if (rule?.forfeit_base_fare && !input.is_refundable) {
        baseFareRefund = new Decimal(0);
        penalty = new Decimal(0);
      } else if (rule) {
        const penaltyAmount = new Decimal(rule.penalty_amount);
        penalty = Decimal.min(penaltyAmount, proratedBase);
        baseFareRefund = proratedBase.minus(penalty);
      } else {
        // No rule supplied → ATPCO default: no penalty on prorated portion.
        baseFareRefund = proratedBase;
        penalty = new Decimal(0);
      }

      // Prorate taxes
      taxRefund = originalTax.times(couponRatio).toDecimalPlaces(2);
      taxBreakdown = input.taxes.map((t) => ({
        code: t.code,
        amount: new Decimal(t.amount).times(couponRatio).toDecimalPlaces(2).toFixed(2),
        currency: t.currency,
      }));
      couponsRefunded = refundableCoupons.map((c) => c.coupon_number);
      break;
    }

    case 'TAX_ONLY': {
      // Tax-only refund — base fare forfeited (no-show on non-refundable)
      baseFareRefund = new Decimal(0);
      penalty = new Decimal(0);
      taxRefund = originalTax;
      taxBreakdown = input.taxes;
      couponsRefunded = Array.from({ length: input.total_coupons }, (_, i) => i + 1);
      break;
    }
  }

  // Commission recall
  const commissionRecalled = calculateCommissionRecall(input, baseFareRefund);

  // Total and net
  const totalRefund = baseFareRefund.plus(taxRefund);
  const netRefund = totalRefund.minus(commissionRecalled);

  // Audit trail
  const audit: RefundAuditTrail = {
    original_ticket_number: input.ticket_number,
    ...(input.conjunction_tickets !== undefined ? { conjunction_tickets: input.conjunction_tickets } : {}),
    refund_type: input.refund_type,
    original_base_fare: originalBase.toFixed(2),
    original_total_tax: originalTax.toFixed(2),
    penalty_applied: penalty.toFixed(2),
    ...(input.waiver_code !== undefined ? { waiver_code: input.waiver_code } : {}),
    base_fare_refunded: baseFareRefund.toFixed(2),
    tax_refunded: taxRefund.toFixed(2),
    commission_recalled: commissionRecalled.toFixed(2),
    coupons_refunded: couponsRefunded,
  };

  // Settlement fields
  const bspFields =
    input.settlement_system === 'BSP'
      ? buildBspFields(input, totalRefund, taxBreakdown, penalty)
      : undefined;
  const arcFields =
    input.settlement_system === 'ARC'
      ? buildArcFields(input, totalRefund, taxBreakdown, penalty)
      : undefined;

  const refund: RefundRecord = {
    ticket_number: input.ticket_number,
    refund_type: input.refund_type,
    penalty_applied: penalty.toFixed(2),
    base_fare_refund: baseFareRefund.toFixed(2),
    tax_refund: taxRefund.toFixed(2),
    tax_breakdown: taxBreakdown,
    total_refund: totalRefund.toFixed(2),
    commission_recalled: commissionRecalled.toFixed(2),
    net_refund: netRefund.toFixed(2),
    ...(input.waiver_code !== undefined ? { waiver_code: input.waiver_code } : {}),
    ...(bspFields !== undefined ? { bsp_fields: bspFields } : {}),
    ...(arcFields !== undefined ? { arc_fields: arcFields } : {}),
    audit,
  };

  return {
    refund,
    net_refund_amount: netRefund.toFixed(2),
    commission_recalled: commissionRecalled.toFixed(2),
  };
}
