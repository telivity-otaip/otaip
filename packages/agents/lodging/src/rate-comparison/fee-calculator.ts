/**
 * Fee calculator — computes total cost including ALL mandatory fees.
 *
 * Must include resort fees, facility fees, destination fees, tourism taxes,
 * and all other mandatory charges that are often excluded from the advertised rate.
 *
 * Uses string-based arithmetic to avoid floating-point precision errors for money.
 *
 * Domain source: OTAIP Lodging Knowledge Base §3 (Rate Types), §4 (Payment Models)
 */

import type { RawRate, MandatoryFee } from '../types/hotel-common.js';
import type { TotalCostBreakdown } from './types.js';

/**
 * Simple decimal arithmetic using strings.
 * Converts to integer cents for calculation, then back to string.
 * This avoids floating-point errors without requiring decimal.js for v0.1.0.
 */
function toCents(amount: string): number {
  const parts = amount.split('.');
  const whole = parseInt(parts[0] ?? '0', 10);
  const frac = parts[1] ?? '0';
  const fracPadded = (frac + '00').substring(0, 2);
  return whole * 100 + parseInt(fracPadded, 10);
}

function fromCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return `${whole}.${frac.toString().padStart(2, '0')}`;
}

function addAmounts(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}

/**
 * Calculate total mandatory fees for a stay.
 *
 * Fee structures from knowledge base:
 * - per_night: fee × number of nights
 * - per_stay: flat fee for entire stay
 * - per_person: fee × number of guests
 * - per_person_per_night: fee × guests × nights
 */
export function calculateMandatoryFees(
  fees: MandatoryFee[],
  nights: number,
  guests: number = 2,
): string {
  let totalCents = 0;

  for (const fee of fees) {
    const feeCents = toCents(fee.amount);

    switch (fee.perUnit) {
      case 'per_night':
        totalCents += feeCents * nights;
        break;
      case 'per_stay':
        totalCents += feeCents;
        break;
      case 'per_person':
        totalCents += feeCents * guests;
        break;
      case 'per_person_per_night':
        totalCents += feeCents * guests * nights;
        break;
    }
  }

  return fromCents(totalCents);
}

/**
 * Calculate total cost breakdown for a rate.
 * Grand total = room charges + mandatory fees + taxes
 */
export function calculateTotalCost(
  rate: RawRate,
  nights: number,
  guests: number = 2,
): TotalCostBreakdown {
  const roomCharges = rate.totalRate;
  const mandatoryFees = calculateMandatoryFees(rate.mandatoryFees ?? [], nights, guests);
  const taxes = rate.taxAmount ?? '0.00';

  const grandTotal = addAmounts(addAmounts(roomCharges, mandatoryFees), taxes);

  return {
    roomCharges: { amount: roomCharges, currency: rate.currency },
    mandatoryFees: { amount: mandatoryFees, currency: rate.currency },
    taxes: { amount: taxes, currency: rate.currency },
    grandTotal: { amount: grandTotal, currency: rate.currency },
  };
}

/**
 * Calculate number of nights from check-in/check-out dates.
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  const diffMs = outDate.getTime() - inDate.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
