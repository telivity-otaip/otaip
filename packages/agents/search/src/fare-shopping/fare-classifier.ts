/**
 * Fare family classification and fare basis decoding helpers.
 *
 * Classifies fares into branded families based on fare basis code patterns
 * and booking class rules.
 *
 * TODO: [FUTURE] Load per-airline fare family configs from data/reference/fare-families/.
 * TODO: [NEEDS DOMAIN INPUT] Airline-specific branded fare family mappings.
 */

import type {
  FareFamily,
  DecodedFareBasisInfo,
  ClassOfServiceInfo,
  PassengerPricing,
} from './types.js';
import type { SearchOffer, PassengerCount } from '@otaip/core';

// ---------------------------------------------------------------------------
// Fare basis → fare family mapping
// ---------------------------------------------------------------------------

/** Primary code to cabin class */
const CABIN_MAP: Record<string, string> = {
  F: 'first', P: 'first', A: 'first',
  J: 'business', C: 'business', D: 'business', I: 'business', Z: 'business',
  W: 'premium_economy', R: 'premium_economy',
  Y: 'economy', B: 'economy', M: 'economy', H: 'economy',
  Q: 'economy', V: 'economy', K: 'economy', L: 'economy',
  S: 'economy', N: 'economy', T: 'economy',
};

/** Booking class to fare tier */
const TIER_MAP: Record<string, string> = {
  F: 'full', P: 'premium', A: 'discount-first',
  J: 'full', C: 'full', D: 'discount', I: 'deep-discount', Z: 'deep-discount',
  W: 'full', R: 'discount',
  Y: 'full', B: 'standard', M: 'standard', H: 'discount',
  Q: 'discount', V: 'deep-discount', K: 'deep-discount', L: 'deep-discount',
  S: 'deep-discount', N: 'deep-discount', T: 'deep-discount',
};

/**
 * Classify a fare basis code into a fare family.
 *
 * Heuristic rules:
 * - Full fare (Y, J, C, F) → 'premium' or 'flex'
 * - NR (non-refundable) → 'basic' or 'standard'
 * - Advance purchase → 'basic'
 * - Deep discount classes (V, K, L, N, S, T) → 'basic'
 * - Everything else → 'standard'
 */
export function classifyFareFamily(fareBasis: string, bookingClass?: string): FareFamily {
  if (!fareBasis || fareBasis.length === 0) return 'unknown';

  const primary = fareBasis[0]!.toUpperCase();
  const upper = fareBasis.toUpperCase();

  // Full-fare one-letter codes are premium
  if (fareBasis.length === 1) {
    if ('FJCP'.includes(primary)) return 'premium';
    if (primary === 'Y' || primary === 'W') return 'flex';
    return 'standard';
  }

  // Non-refundable fares
  const hasNR = upper.includes('NR');
  const hasAP = /\d+/.test(upper); // advance purchase days

  // Deep discount booking classes
  const deepDiscount = new Set(['V', 'K', 'L', 'N', 'S', 'T']);
  const isDeepDiscount = deepDiscount.has(primary) || (bookingClass && deepDiscount.has(bookingClass));

  if (isDeepDiscount || (hasNR && hasAP)) return 'basic';
  if (hasNR) return 'standard';
  if ('FJCP'.includes(primary)) return 'premium';
  if (primary === 'Y' || primary === 'W') return 'flex';

  return 'standard';
}

/**
 * Decode a fare basis code into structured info.
 */
export function decodeFareBasis(fareBasis: string): DecodedFareBasisInfo {
  const upper = fareBasis.toUpperCase().trim();
  const primary = upper[0] ?? '';
  const cabinClass = CABIN_MAP[primary] ?? 'economy';
  const hasNR = upper.includes('NR');

  // Extract advance purchase days
  const apMatch = upper.match(/(\d{1,3})/);
  const apDays = apMatch ? parseInt(apMatch[1]!, 10) : null;

  const family = classifyFareFamily(upper);

  return {
    fare_basis: upper,
    cabin_class: cabinClass,
    refundable: !hasNR,
    advance_purchase_days: apDays,
    fare_family: family,
  };
}

/**
 * Map booking class to class of service info.
 */
export function mapClassOfService(bookingClass: string): ClassOfServiceInfo {
  const upper = bookingClass.toUpperCase();
  return {
    booking_class: upper,
    cabin_class: CABIN_MAP[upper] ?? 'economy',
    tier: TIER_MAP[upper] ?? 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Passenger pricing
// ---------------------------------------------------------------------------

const CHILD_DISCOUNT = 0.75;
const INFANT_DISCOUNT = 0.10;

export function calculatePassengerPricing(
  offer: SearchOffer,
  passengers: PassengerCount[],
): PassengerPricing[] {
  const adultPrice = offer.price.total;
  const result: PassengerPricing[] = [];

  for (const pax of passengers) {
    let perPerson: number;
    switch (pax.type) {
      case 'CHD':
        perPerson = Math.round(adultPrice * CHILD_DISCOUNT * 100) / 100;
        break;
      case 'INF':
        perPerson = Math.round(adultPrice * INFANT_DISCOUNT * 100) / 100;
        break;
      default:
        perPerson = adultPrice;
        break;
    }

    result.push({
      type: pax.type as 'ADT' | 'CHD' | 'INF',
      count: pax.count,
      per_person_total: perPerson,
      subtotal: Math.round(perPerson * pax.count * 100) / 100,
    });
  }

  return result;
}
