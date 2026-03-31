/**
 * Exchange/Reissue Engine — residual value, tax carryforward, GDS commands.
 */

import Decimal from 'decimal.js';
import type {
  ExchangeReissueInput,
  ExchangeReissueOutput,
  ReissueRecord,
  ReissuedCoupon,
  TaxItem,
  ExchangeCommand,
  ExchangeAuditTrail,
} from './types.js';

const airlinePrefixes: Record<string, string> = {
  AA: '001', BA: '125', LH: '220', AF: '057', KL: '074',
  UA: '016', DL: '006', SQ: '618', CX: '160', QF: '081',
  EK: '176', QR: '157', TK: '235', NH: '205', JL: '131',
  AC: '014', IB: '075', SK: '117', LX: '724', OS: '257',
};

function generateSerial(recordLocator: string, salt: string): string {
  let hash = 0;
  const seed = `REISSUE-${recordLocator}-${salt}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString().padStart(10, '0').slice(0, 10);
}

function resolvePrefix(input: ExchangeReissueInput): string {
  if (input.ticket_number_prefix) return input.ticket_number_prefix;
  return airlinePrefixes[input.issuing_carrier] ?? '999';
}

function sumTaxes(taxes: TaxItem[]): Decimal {
  let total = new Decimal(0);
  for (const t of taxes) {
    total = total.plus(new Decimal(t.amount));
  }
  return total;
}

// ---------------------------------------------------------------------------
// Tax carryforward logic
// ---------------------------------------------------------------------------

function computeTaxes(
  input: ExchangeReissueInput,
): { taxes: TaxItem[]; carriedForward: TaxItem[]; newTaxes: TaxItem[]; totalTax: Decimal } {
  if (input.same_origin_destination) {
    // Carry forward: for matching tax codes, use the max of original and new
    // For new codes not in original, collect the new amount
    // For original codes not in new, carry forward (already paid)
    const origMap = new Map<string, TaxItem>();
    for (const t of input.original_taxes) {
      origMap.set(t.code, t);
    }

    const carriedForward: TaxItem[] = [];
    const newTaxes: TaxItem[] = [];
    const finalTaxes: TaxItem[] = [];

    for (const nt of input.new_taxes) {
      const orig = origMap.get(nt.code);
      if (orig) {
        const origAmt = new Decimal(orig.amount);
        const newAmt = new Decimal(nt.amount);
        // Carry forward the original amount
        carriedForward.push(orig);
        if (newAmt.greaterThan(origAmt)) {
          // Collect the delta
          const delta = newAmt.minus(origAmt);
          newTaxes.push({ code: nt.code, amount: delta.toFixed(2), currency: nt.currency });
          finalTaxes.push({ code: nt.code, amount: newAmt.toFixed(2), currency: nt.currency });
        } else {
          // Already paid enough
          finalTaxes.push({ code: nt.code, amount: origAmt.toFixed(2), currency: nt.currency });
        }
        origMap.delete(nt.code);
      } else {
        // New tax code — collect fully
        newTaxes.push(nt);
        finalTaxes.push(nt);
      }
    }

    // Original taxes not in new itinerary — still show on ticket (carried forward)
    for (const [, orig] of origMap) {
      carriedForward.push(orig);
      finalTaxes.push(orig);
    }

    return {
      taxes: finalTaxes,
      carriedForward,
      newTaxes,
      totalTax: sumTaxes(finalTaxes),
    };
  }

  // Different O/D: use new taxes entirely
  return {
    taxes: input.new_taxes,
    carriedForward: [],
    newTaxes: input.new_taxes,
    totalTax: sumTaxes(input.new_taxes),
  };
}

// ---------------------------------------------------------------------------
// GDS exchange commands
// ---------------------------------------------------------------------------

function buildExchangeCommands(input: ExchangeReissueInput, additionalCollection: string): ExchangeCommand[] {
  if (!input.gds) return [];

  const commands: ExchangeCommand[] = [];

  switch (input.gds) {
    case 'AMADEUS':
      commands.push({
        gds: 'AMADEUS',
        command_name: 'TKTXCH',
        fields: {
          original_ticket: input.original_ticket_number,
          new_fare: input.new_fare,
          change_fee: input.change_fee,
          additional_collection: additionalCollection,
          waiver_code: input.waiver_code ?? '',
          fare_calculation: input.fare_calculation,
        },
        description: 'Amadeus ticket exchange transaction',
      });
      break;

    case 'SABRE':
      commands.push({
        gds: 'SABRE',
        command_name: 'EXCHANGE_PNR',
        fields: {
          original_ticket_number: input.original_ticket_number,
          exchange_fare: input.new_fare,
          penalty_amount: input.change_fee,
          add_collect: additionalCollection,
          waiver: input.waiver_code ?? '',
          fare_calc: input.fare_calculation,
          original_issue_date: input.original_issue_date,
        },
        description: 'Sabre exchange PNR fields',
      });
      break;

    case 'TRAVELPORT':
      commands.push({
        gds: 'TRAVELPORT',
        command_name: 'UNIVERSAL_RECORD_EXCHANGE',
        fields: {
          original_document: input.original_ticket_number,
          new_fare_amount: input.new_fare,
          change_penalty: input.change_fee,
          additional_payment: additionalCollection,
          waiver_code: input.waiver_code ?? '',
          fare_calculation_line: input.fare_calculation,
        },
        description: 'Travelport Universal Record exchange',
      });
      break;
  }

  // Conjunction ticket reference
  if (input.conjunction_originals && input.conjunction_originals.length > 0) {
    commands.push({
      gds: input.gds,
      command_name: 'CONJUNCTION_REFERENCE',
      fields: {
        tickets: [input.original_ticket_number, ...input.conjunction_originals].join(','),
        note: 'All conjunction tickets in set must be referenced for exchange',
      },
      description: 'Reference all conjunction tickets in exchange set',
    });
  }

  return commands;
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

export function processReissue(input: ExchangeReissueInput): ExchangeReissueOutput {
  const prefix = resolvePrefix(input);
  const issueDate = input.issue_date ?? new Date().toISOString().slice(0, 10);
  const serial = generateSerial(input.record_locator, input.passenger_name);
  const newTicketNumber = `${prefix}${serial}`;

  const newFare = new Decimal(input.new_fare);
  const residualValue = new Decimal(input.residual_value);
  const changeFee = new Decimal(input.change_fee);

  // Apply residual value first
  const afterResidual = newFare.minus(residualValue);
  let additionalCollection = new Decimal(0);
  let creditAmount = new Decimal(0);

  if (afterResidual.greaterThan(0)) {
    additionalCollection = afterResidual.plus(changeFee);
  } else {
    // Residual covers the new fare — potential credit
    creditAmount = afterResidual.abs();
    additionalCollection = changeFee; // Still owe the change fee
  }

  // Tax computation
  const { taxes, carriedForward, newTaxes, totalTax } = computeTaxes(input);

  // Add new tax collection to additional collection
  const newTaxTotal = sumTaxes(newTaxes);
  additionalCollection = additionalCollection.plus(newTaxTotal);

  const totalAmount = newFare.plus(totalTax);

  // Build coupons
  const coupons: ReissuedCoupon[] = input.new_segments.map((seg, idx) => ({
    coupon_number: idx + 1,
    carrier: seg.carrier,
    flight_number: seg.flight_number,
    origin: seg.origin,
    destination: seg.destination,
    departure_date: seg.departure_date,
    departure_time: seg.departure_time,
    booking_class: seg.booking_class,
    fare_basis: seg.fare_basis,
    baggage_allowance: seg.baggage_allowance,
    status: 'O' as const,
  }));

  // Audit trail
  const exchangeAudit: ExchangeAuditTrail = {
    original_ticket_number: input.original_ticket_number,
    conjunction_originals: input.conjunction_originals,
    original_issue_date: input.original_issue_date,
    exchange_indicator: 'E',
    change_fee_paid: changeFee.toFixed(2),
    residual_applied: residualValue.toFixed(2),
    additional_collection: additionalCollection.toFixed(2),
    taxes_carried_forward: carriedForward,
    taxes_new: newTaxes,
    waiver_code: input.waiver_code,
  };

  // GDS commands
  const exchangeCommands = buildExchangeCommands(input, additionalCollection.toFixed(2));

  const reissue: ReissueRecord = {
    ticket_number: newTicketNumber,
    record_locator: input.record_locator,
    issuing_carrier: input.issuing_carrier,
    issue_date: issueDate,
    passenger_name: input.passenger_name,
    coupons,
    base_fare: newFare.toFixed(2),
    base_fare_currency: input.new_fare_currency,
    total_tax: totalTax.toFixed(2),
    taxes,
    total_amount: totalAmount.toFixed(2),
    fare_calculation: input.fare_calculation,
    form_of_payment: input.form_of_payment,
    exchange_audit: exchangeAudit,
    exchange_commands: exchangeCommands.length > 0 ? exchangeCommands : undefined,
  };

  return {
    reissue,
    additional_collection: additionalCollection.toFixed(2),
    credit_amount: creditAmount.toFixed(2),
  };
}
