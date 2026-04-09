/**
 * Agent 1.9 — Hard Filters
 *
 * Applied before scoring. Any match eliminates the offer.
 * Order matters — stop at first match per the spec.
 */

import type {
  EvaluatorOffer,
  TravelerConstraints,
  HardRejectionCode,
  RejectedOffer,
} from './types.js';
import { getFinalArrivalTime, getLayoverMinutes } from './scoring.js';

interface FilterResult {
  eligible: EvaluatorOffer[];
  rejected: RejectedOffer[];
  breakdown: Partial<Record<HardRejectionCode, number>>;
}

export function applyHardFilters(
  offers: EvaluatorOffer[],
  constraints: TravelerConstraints,
  evaluationTime: Date,
): FilterResult {
  const eligible: EvaluatorOffer[] = [];
  const rejected: RejectedOffer[] = [];
  const breakdown: Partial<Record<HardRejectionCode, number>> = {};

  for (const offer of offers) {
    const rejection = checkHardFilters(offer, constraints, evaluationTime);
    if (rejection) {
      rejected.push(rejection);
      breakdown[rejection.reason as HardRejectionCode] =
        (breakdown[rejection.reason as HardRejectionCode] ?? 0) + 1;
    } else {
      eligible.push(offer);
    }
  }

  return { eligible, rejected, breakdown };
}

/**
 * Checks a single offer against all hard filters in spec order.
 * Returns the FIRST matching rejection, or null if the offer passes.
 */
function checkHardFilters(
  offer: EvaluatorOffer,
  constraints: TravelerConstraints,
  evaluationTime: Date,
): RejectedOffer | null {
  // 1. MISSING_CRITICAL_DATA
  if (!offer.offer_id || !offer.itinerary.segments.length) {
    return {
      offer_id: offer.offer_id ?? 'unknown',
      rejection_type: 'HARD',
      reason: 'MISSING_CRITICAL_DATA',
      note: 'Missing offer_id or empty segments.',
    };
  }
  const finalSegment = offer.itinerary.segments[offer.itinerary.segments.length - 1]!;
  if (!finalSegment.arrival_time) {
    return {
      offer_id: offer.offer_id,
      rejection_type: 'HARD',
      reason: 'MISSING_CRITICAL_DATA',
      note: 'Final segment missing arrival_time.',
    };
  }

  // 2. OFFER_EXPIRED
  if (offer.expires_at) {
    const expiresAt = new Date(offer.expires_at).getTime();
    if (expiresAt < evaluationTime.getTime()) {
      return {
        offer_id: offer.offer_id,
        rejection_type: 'HARD',
        reason: 'OFFER_EXPIRED',
        expires_at: offer.expires_at,
      };
    }
  }

  // 3. ARRIVES_TOO_LATE
  if (constraints.latest_arrival) {
    const arrivalTime = new Date(getFinalArrivalTime(offer)).getTime();
    const deadline = new Date(constraints.latest_arrival).getTime();
    if (arrivalTime > deadline) {
      return {
        offer_id: offer.offer_id,
        rejection_type: 'HARD',
        reason: 'ARRIVES_TOO_LATE',
        arrival_time: getFinalArrivalTime(offer),
        deadline: constraints.latest_arrival,
      };
    }
  }

  // 4. EXCEEDS_MAX_CONNECTIONS
  if (
    constraints.max_connections != null &&
    offer.itinerary.connection_count > constraints.max_connections
  ) {
    return {
      offer_id: offer.offer_id,
      rejection_type: 'HARD',
      reason: 'EXCEEDS_MAX_CONNECTIONS',
      note: `${offer.itinerary.connection_count} connections exceeds max ${constraints.max_connections}.`,
    };
  }

  // 5. EXCEEDS_PRICE_CEILING
  if (constraints.price_ceiling != null && offer.price.total > constraints.price_ceiling) {
    return {
      offer_id: offer.offer_id,
      rejection_type: 'HARD',
      reason: 'EXCEEDS_PRICE_CEILING',
      note: `${offer.price.total} ${offer.price.currency} exceeds ceiling ${constraints.price_ceiling}.`,
    };
  }

  // 6. BLACKLISTED_CARRIER
  if (constraints.blacklisted_carriers && constraints.blacklisted_carriers.length > 0) {
    for (const seg of offer.itinerary.segments) {
      if (constraints.blacklisted_carriers.includes(seg.carrier)) {
        return {
          offer_id: offer.offer_id,
          rejection_type: 'HARD',
          reason: 'BLACKLISTED_CARRIER',
          note: `Carrier ${seg.carrier} is blacklisted.`,
        };
      }
    }
  }

  // 7. TIGHT_CONNECTION_BELOW_MINIMUM
  if (constraints.min_connection_minutes != null) {
    const layovers = getLayoverMinutes(offer);
    for (const layover of layovers) {
      if (layover < constraints.min_connection_minutes) {
        return {
          offer_id: offer.offer_id,
          rejection_type: 'HARD',
          reason: 'TIGHT_CONNECTION_BELOW_MINIMUM',
          note: `${layover}min layover below minimum ${constraints.min_connection_minutes}min.`,
        };
      }
    }
  }

  return null;
}
