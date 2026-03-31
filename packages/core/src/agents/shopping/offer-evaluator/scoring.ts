/**
 * Agent 1.9 — Scoring Functions
 *
 * All scoring functions are NON-LINEAR and implement the exact step functions,
 * band softening, and layover-aware connection scoring from the spec.
 */

import type {
  EvaluatorOffer,
  ScoringWeights,
  TravelerConstraints,
  TravelerProfile,
  TimeBufferScore,
  PriceScore,
  ConnectionQualityScore,
  JourneyDurationScore,
  BufferTier,
  ConnectionRisk,
  ScoreBreakdown,
} from './types.js';

// ---------------------------------------------------------------------------
// Weight presets
// ---------------------------------------------------------------------------

const WEIGHT_PRESETS: Record<Exclude<TravelerProfile, 'CUSTOM'>, ScoringWeights> = {
  BUSINESS_TIME_CRITICAL: { time_buffer: 0.45, price: 0.20, connection_quality: 0.25, journey_duration: 0.10 },
  BUSINESS_PRICE_CONSTRAINED: { time_buffer: 0.25, price: 0.45, connection_quality: 0.20, journey_duration: 0.10 },
  LEISURE: { time_buffer: 0.10, price: 0.50, connection_quality: 0.20, journey_duration: 0.20 },
  CORPORATE_POLICY: { time_buffer: 0.35, price: 0.35, connection_quality: 0.20, journey_duration: 0.10 },
};

export function getWeightsForProfile(profile: TravelerProfile, custom?: ScoringWeights): ScoringWeights {
  if (profile === 'CUSTOM') {
    return custom!;
  }
  return WEIGHT_PRESETS[profile];
}

// ---------------------------------------------------------------------------
// Auto-detect traveler profile
// ---------------------------------------------------------------------------

export function autoDetectProfile(
  constraints: TravelerConstraints,
  offers: EvaluatorOffer[],
): TravelerProfile {
  if (constraints.latest_arrival && constraints.prefer_direct) {
    return 'BUSINESS_TIME_CRITICAL';
  }
  if (constraints.latest_arrival) {
    return 'BUSINESS_TIME_CRITICAL';
  }
  if (constraints.price_ceiling != null && offers.length > 0) {
    const prices = offers.map((o) => o.price.total).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)]!;
    if (constraints.price_ceiling < median * 1.2) {
      return 'BUSINESS_PRICE_CONSTRAINED';
    }
  }
  return 'LEISURE';
}

// ---------------------------------------------------------------------------
// Time buffer scoring — NON-LINEAR step function
// ---------------------------------------------------------------------------

function bufferTier(minutes: number): { score: number; tier: BufferTier } {
  if (minutes < 0) return { score: 0.00, tier: 'CATASTROPHIC' };
  if (minutes <= 15) return { score: 0.05, tier: 'CATASTROPHIC' };
  if (minutes <= 30) return { score: 0.30, tier: 'HIGH_RISK' };
  if (minutes <= 45) return { score: 0.65, tier: 'MARGINAL' };
  if (minutes <= 60) return { score: 0.85, tier: 'GOOD' };
  if (minutes <= 90) return { score: 1.00, tier: 'IDEAL' };
  if (minutes <= 120) return { score: 0.90, tier: 'DIMINISHING' };
  return { score: 0.75, tier: 'VERY_EARLY' };
}

export function scoreTimeBuffer(
  offer: EvaluatorOffer,
  constraints: TravelerConstraints,
  weight: number,
): TimeBufferScore {
  if (!constraints.latest_arrival) {
    return { score: 1.0, weight: 0, weighted: 0, buffer_minutes: 0, tier: 'N/A' };
  }

  const arrivalTime = getFinalArrivalTime(offer);
  const deadline = new Date(constraints.latest_arrival).getTime();
  const arrival = new Date(arrivalTime).getTime();
  const bufferMinutes = Math.floor((deadline - arrival) / 60000);

  const { score, tier } = bufferTier(bufferMinutes);
  return {
    score,
    weight,
    weighted: round4(score * weight),
    buffer_minutes: bufferMinutes,
    tier,
  };
}

// ---------------------------------------------------------------------------
// Price scoring — with 15% band softening floor
// ---------------------------------------------------------------------------

export function scorePriceRelative(
  offerPrice: number,
  cheapestEligiblePrice: number,
  weight: number,
): PriceScore {
  if (offerPrice <= 0 || cheapestEligiblePrice <= 0) {
    return { score: 0, weight, weighted: 0, vs_cheapest_pct: 0 };
  }

  let baseScore = cheapestEligiblePrice / offerPrice;

  // 15% band softening: if within 15% of cheapest (base_score >= 0.87), floor at 0.85
  if (baseScore >= 0.87) {
    baseScore = Math.max(baseScore, 0.85);
  }

  const score = Math.min(baseScore, 1.0);
  return {
    score,
    weight,
    weighted: round4(score * weight),
    vs_cheapest_pct: round4(offerPrice / cheapestEligiblePrice),
  };
}

// ---------------------------------------------------------------------------
// Connection quality scoring — layover-aware, non-linear
// ---------------------------------------------------------------------------

function layoverScoreOneStop(layoverMinutes: number): { score: number; risk: ConnectionRisk } {
  if (layoverMinutes < 30) return { score: 0.05, risk: 'CRITICAL' };
  if (layoverMinutes < 45) return { score: 0.25, risk: 'HIGH' };
  if (layoverMinutes < 60) return { score: 0.50, risk: 'MODERATE' };
  if (layoverMinutes < 90) return { score: 0.75, risk: 'LOW' };
  if (layoverMinutes <= 120) return { score: 0.80, risk: 'LOW' };
  return { score: 0.70, risk: 'LOW' };
}

export function scoreConnectionQuality(
  offer: EvaluatorOffer,
  constraints: TravelerConstraints,
  weight: number,
): ConnectionQualityScore {
  const connectionCount = offer.itinerary.connection_count;

  if (connectionCount === 0) {
    const score = 1.0;
    return { score, weight, weighted: round4(score * weight), layover_minutes: 0, risk: 'NONE' };
  }

  // Calculate tightest layover across all connections
  const layovers = getLayoverMinutes(offer);
  const tightestLayover = layovers.length > 0 ? Math.min(...layovers) : 0;

  let score: number;
  let risk: ConnectionRisk;

  if (connectionCount === 1) {
    const result = layoverScoreOneStop(tightestLayover);
    score = result.score;
    risk = result.risk;
  } else {
    // 2+ stops: base 0.30, apply tightest layover penalty
    const layoverResult = layoverScoreOneStop(tightestLayover);
    score = 0.30 * (layoverResult.score / 1.0); // scale by tightest layover quality
    risk = layoverResult.risk;
  }

  // Apply prefer_direct penalty (soft — ×0.80 multiplier)
  if (constraints.prefer_direct && connectionCount > 0) {
    score *= 0.80;
  }

  return {
    score: round4(score),
    weight,
    weighted: round4(score * weight),
    layover_minutes: tightestLayover,
    risk,
  };
}

// ---------------------------------------------------------------------------
// Journey duration scoring — relative to fastest eligible
// ---------------------------------------------------------------------------

export function scoreJourneyDuration(
  offerDuration: number,
  fastestEligibleDuration: number,
  weight: number,
): JourneyDurationScore {
  if (offerDuration <= 0 || fastestEligibleDuration <= 0) {
    return { score: 0, weight, weighted: 0, vs_fastest_pct: 0 };
  }

  const score = Math.min(fastestEligibleDuration / offerDuration, 1.0);
  return {
    score: round4(score),
    weight,
    weighted: round4(score * weight),
    vs_fastest_pct: round4(offerDuration / fastestEligibleDuration),
  };
}

// ---------------------------------------------------------------------------
// Composite scoring with weight redistribution
// ---------------------------------------------------------------------------

export function scoreOffer(
  offer: EvaluatorOffer,
  constraints: TravelerConstraints,
  weights: ScoringWeights,
  cheapestEligiblePrice: number,
  fastestEligibleDuration: number,
): ScoreBreakdown {
  const timeBufferApplies = !!constraints.latest_arrival;

  // Redistribute time_buffer weight if not applicable
  let effectiveWeights: ScoringWeights;
  if (!timeBufferApplies) {
    const redistributable = weights.time_buffer;
    const remainingTotal = weights.price + weights.connection_quality + weights.journey_duration;
    effectiveWeights = {
      time_buffer: 0,
      price: weights.price + redistributable * (weights.price / remainingTotal),
      connection_quality: weights.connection_quality + redistributable * (weights.connection_quality / remainingTotal),
      journey_duration: weights.journey_duration + redistributable * (weights.journey_duration / remainingTotal),
    };
  } else {
    effectiveWeights = weights;
  }

  const time_buffer = scoreTimeBuffer(offer, constraints, effectiveWeights.time_buffer);
  const price = scorePriceRelative(offer.price.total, cheapestEligiblePrice, effectiveWeights.price);
  const connection_quality = scoreConnectionQuality(offer, constraints, effectiveWeights.connection_quality);
  const journey_duration = scoreJourneyDuration(
    offer.itinerary.total_duration_minutes,
    fastestEligibleDuration,
    effectiveWeights.journey_duration,
  );

  return { time_buffer, price, connection_quality, journey_duration };
}

export function compositeScore(breakdown: ScoreBreakdown): number {
  const raw =
    breakdown.time_buffer.weighted +
    breakdown.price.weighted +
    breakdown.connection_quality.weighted +
    breakdown.journey_duration.weighted;
  return round4(raw);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getFinalArrivalTime(offer: EvaluatorOffer): string {
  const segments = offer.itinerary.segments;
  return segments[segments.length - 1]!.arrival_time;
}

export function getLayoverMinutes(offer: EvaluatorOffer): number[] {
  const segments = offer.itinerary.segments;
  const layovers: number[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const arrival = new Date(segments[i]!.arrival_time).getTime();
    const nextDeparture = new Date(segments[i + 1]!.departure_time).getTime();
    layovers.push(Math.floor((nextDeparture - arrival) / 60000));
  }
  return layovers;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
