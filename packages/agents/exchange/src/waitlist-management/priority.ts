/**
 * Waitlist priority scoring for Agent 5.6.
 *
 * Pure, deterministic. Tested independently of the stateful agent.
 *
 * Formula:
 *   score = statusWeight + classWeight + recencyBonus
 *
 * statusWeight   platinum 400, gold 300, silver 200, general 100
 * classWeight    full_fare 50, discount 20
 * recencyBonus   max(0, 50 - hoursSinceRequest)   (caps at 50 for fresh requests)
 *
 * Higher score = higher priority. Ties broken by earlier requestedAt
 * by the agent at queue insertion.
 */

import type { ClearanceRateMap, FareClassType, StatusTier, WaitlistSegment } from './types.js';

const STATUS_WEIGHT: Record<StatusTier, number> = {
  platinum: 400,
  gold: 300,
  silver: 200,
  general: 100,
};

const CLASS_WEIGHT: Record<FareClassType, number> = {
  full_fare: 50,
  discount: 20,
};

/**
 * Default clearance probability by booking class. Applied when no
 * override is supplied to queryStatus.
 *
 * Business class (C/D/I/J): 0.6
 * Economy full fare (Y):    0.5
 * Discount (everything else): 0.4
 */
export const DEFAULT_CLEARANCE_RATES: ClearanceRateMap = {
  // Business
  C: 0.6,
  D: 0.6,
  I: 0.6,
  J: 0.6,
  // Economy full fare
  Y: 0.5,
};

export function computePriorityScore(args: {
  statusTier: StatusTier;
  fareClassType: FareClassType;
  requestedAt: string;
  now: Date;
}): number {
  const base = STATUS_WEIGHT[args.statusTier] + CLASS_WEIGHT[args.fareClassType];
  const requestedMs = Date.parse(args.requestedAt);
  if (Number.isNaN(requestedMs)) return base;
  const hoursSince = Math.max(0, (args.now.getTime() - requestedMs) / (1000 * 60 * 60));
  const recencyBonus = Math.max(0, 50 - hoursSince);
  return base + recencyBonus;
}

/**
 * Canonical key for a waitlist segment: same flight on same date with
 * the same cabin class share the same queue.
 */
export function segmentKey(segment: WaitlistSegment): string {
  return `${segment.carrier}-${segment.flightNumber}-${segment.departureDate}-${segment.bookingClass}`;
}

/**
 * Clearance probability lookup. Falls back to 0.4 (discount default)
 * when no explicit rate is configured.
 */
export function resolveClearanceRate(
  bookingClass: string,
  overrides?: ClearanceRateMap,
): number {
  if (overrides && bookingClass in overrides) return overrides[bookingClass]!;
  if (bookingClass in DEFAULT_CLEARANCE_RATES) {
    return DEFAULT_CLEARANCE_RATES[bookingClass]!;
  }
  return 0.4;
}

/**
 * When is an entry's expiry time, given segment departure + cutoff
 * hours? Assumes departure occurs at 00:00 UTC on the departure date
 * for simplicity — the waitlist cutoff is always relative to the
 * flight's posted departure day, not the airline's local time.
 */
export function computeExpiryAt(
  departureDate: string,
  cutoffBeforeDepartureHours: number,
): string {
  const departureMs = Date.parse(`${departureDate}T00:00:00Z`);
  if (Number.isNaN(departureMs)) return `${departureDate}T00:00:00Z`;
  const expiryMs = departureMs - cutoffBeforeDepartureHours * 60 * 60 * 1000;
  return new Date(expiryMs).toISOString();
}
