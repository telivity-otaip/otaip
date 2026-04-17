/**
 * Pricing calculations for SelfServiceRebookingAgent (5.5).
 *
 * Pure functions. Uses decimal.js for currency math (no float drift).
 * Given an original ticket + an alternative offer + a change fee
 * assessment, computes the delta the passenger owes (or is owed).
 */

import Decimal from 'decimal.js';
import type { SearchOffer } from '@otaip/core';
import type { ChangeAssessment, OriginalTicketSummary } from '../change-management/types.js';
import type { Money, RebookingReason } from './types.js';

/**
 * Reasons that waive voluntary change fees regardless of fare rules.
 * Voluntary changes honor ATPCO Cat 31 via ChangeManagement (5.1).
 */
export function isInvoluntary(reason: RebookingReason): boolean {
  return reason !== 'voluntary';
}

/**
 * Decompose a search offer's price into fare (base) and tax components.
 * Returns the values as decimal strings + currency.
 */
export function decomposeOfferPrice(offer: SearchOffer): { fare: string; tax: string; currency: string } {
  return {
    fare: new Decimal(offer.price.base_fare).toFixed(2),
    tax: new Decimal(offer.price.taxes).toFixed(2),
    currency: offer.price.currency,
  };
}

/**
 * Compute the fare + tax differences between original and new.
 * Currency mismatches are passed through; the caller deals with it.
 */
export function computeDifferences(
  original: OriginalTicketSummary,
  offer: SearchOffer,
): { fareDifference: Money; taxDifference: Money } {
  const decomposed = decomposeOfferPrice(offer);
  const fareDiff = new Decimal(decomposed.fare).minus(new Decimal(original.base_fare));
  const taxDiff = new Decimal(decomposed.tax).minus(new Decimal(original.total_tax));
  return {
    fareDifference: { amount: fareDiff.toFixed(2), currency: decomposed.currency },
    taxDifference: { amount: taxDiff.toFixed(2), currency: decomposed.currency },
  };
}

/**
 * Compute total cost for an alternative:
 *   totalCost = changeFee + fareDifference + taxDifference
 *
 * All three must be in the same currency — enforced by caller.
 */
export function computeTotalCost(
  changeFee: Money,
  fareDifference: Money,
  taxDifference: Money,
): Money {
  const sum = new Decimal(changeFee.amount)
    .plus(new Decimal(fareDifference.amount))
    .plus(new Decimal(taxDifference.amount));
  return { amount: sum.toFixed(2), currency: changeFee.currency };
}

/**
 * When reason is involuntary (schedule_change / missed_connection /
 * cancellation), the change fee is waived to 0.00 regardless of what
 * ChangeManagement assessed. Fare diff and tax diff still apply.
 */
export function applyInvoluntaryWaiver(
  assessment: ChangeAssessment,
  reason: RebookingReason,
): { changeFee: Money; waived: boolean } {
  if (isInvoluntary(reason)) {
    return {
      changeFee: { amount: '0.00', currency: assessment.change_fee_currency },
      waived: true,
    };
  }
  return {
    changeFee: { amount: assessment.change_fee, currency: assessment.change_fee_currency },
    waived: false,
  };
}
