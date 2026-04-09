/**
 * Agent 1.9 — Offer Evaluator
 *
 * Stateless, deterministic scoring engine. Receives raw flight offers and
 * structured traveler constraints, applies multi-dimensional scoring with
 * hard filtering, returns a ranked selection decision with full audit trail.
 *
 * The LLM translates the structured_explanation — it does not originate
 * the selection decision.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '../../../types/agent.js';
import { AgentNotInitializedError } from '../../../errors/agent-errors.js';
import type {
  OfferEvaluatorRequest,
  OfferEvaluatorResponse,
  EvaluatorResult,
  EvaluatorOffer,
  TravelerConstraints,
  TravelerProfile,
  ScoringWeights,
  SelectedOffer,
  RejectedOffer,
  EvaluationSummary,
  ChainConfidence,
  ConfidenceBasis,
  ConfidenceResult,
  ScoreBreakdown,
  StructuredExplanation,
  TopRejected,
} from './types.js';
import { applyHardFilters } from './filters.js';
import {
  autoDetectProfile,
  getWeightsForProfile,
  scoreOffer,
  compositeScore,
  getFinalArrivalTime,
} from './scoring.js';

export type {
  OfferEvaluatorRequest,
  OfferEvaluatorResponse,
  EvaluatorResult,
  EvaluatorOffer,
  TravelerConstraints,
  TravelerProfile,
  ScoringWeights,
  SelectedOffer,
  RejectedOffer,
  EvaluationSummary,
  ChainConfidence,
  ConfidenceBasis,
  ConfidenceResult,
  ScoreBreakdown,
  StructuredExplanation,
};

const AGENT_VERSION = '1.9@0.1.0';
const AUTO_EXECUTE_THRESHOLD = 0.65;

// ---------------------------------------------------------------------------
// Core evaluation function — never throws
// ---------------------------------------------------------------------------

export function evaluateOffers(request: OfferEvaluatorRequest): EvaluatorResult {
  const startTime = performance.now();
  const evaluationTime = new Date();

  // Step 1: Validate inputs
  const validationError = validateInputs(request);
  if (validationError) return validationError;

  // Step 2: Detect traveler profile
  const { profile, profileSource, weights } = resolveProfileAndWeights(request);

  // Step 3: Currency check (normalization placeholder)
  const currencies = new Set(request.offers.map((o) => o.price.currency));
  const targetCurrency = request.constraints.currency ?? request.offers[0]!.price.currency;
  if (currencies.size > 1) {
    // Mixed currencies without normalization = error
    return {
      ok: false,
      error: {
        error: 'CURRENCY_NORMALIZATION_FAILED',
        currencies_found: [...currencies],
        details: `Mixed currencies found: ${[...currencies].join(', ')}. Normalization to ${targetCurrency} is required but no exchange rates available.`,
      },
    };
  }

  // Step 4: Apply hard filters
  const {
    eligible,
    rejected: hardRejected,
    breakdown,
  } = applyHardFilters(request.offers, request.constraints, evaluationTime);

  // Step 5: Check eligible set
  if (eligible.length === 0) {
    return {
      ok: false,
      error: {
        error: 'NO_ELIGIBLE_OFFERS',
        rejection_breakdown: breakdown,
        full_rejected: hardRejected,
        details: `All ${request.offers.length} offers eliminated by hard filters.`,
      },
    };
  }

  // Step 6: Pre-scoring metrics
  const cheapestPrice = Math.min(...eligible.map((o) => o.price.total));
  const fastestDuration = Math.min(...eligible.map((o) => o.itinerary.total_duration_minutes));

  // Step 7: Score all eligible offers
  const scored = eligible.map((offer) => {
    const bd = scoreOffer(offer, request.constraints, weights, cheapestPrice, fastestDuration);
    const composite = compositeScore(bd);
    return { offer, breakdown: bd, composite };
  });

  // Step 8: Rank and select with tiebreaking
  scored.sort((a, b) => {
    const diff = b.composite - a.composite;
    if (Math.abs(diff) > 0.001) return diff;
    // Tiebreak 1: lower price
    const priceDiff = a.offer.price.total - b.offer.price.total;
    if (Math.abs(priceDiff) > 0.01) return priceDiff;
    // Tiebreak 2: shorter duration
    const durDiff =
      a.offer.itinerary.total_duration_minutes - b.offer.itinerary.total_duration_minutes;
    if (durDiff !== 0) return durDiff;
    // Tiebreak 3: input order (stable sort handles this)
    return 0;
  });

  const rank1 = scored[0]!;
  const rank2 = scored.length > 1 ? scored[1]! : null;

  // Step 9: Confidence
  const margin = rank2 ? round4(rank1.composite - rank2.composite) : 0;
  const missingInputs: string[] = [];
  if (!request.scoring_weights && request.traveler_profile === undefined) {
    missingInputs.push('scoring_weights');
  }

  const confidence = computeConfidence(margin, eligible.length, missingInputs, currencies.size > 1);
  const loadBearingFloor = computeLoadBearingFloor(request.chain_confidence);
  const effectiveConfidence =
    loadBearingFloor !== null
      ? round4(Math.min(confidence.score, loadBearingFloor))
      : confidence.score;
  const autoExecutable = effectiveConfidence >= AUTO_EXECUTE_THRESHOLD;

  // Build soft rejections
  const softRejected: RejectedOffer[] = scored.slice(1).map((s, i) => ({
    offer_id: s.offer.offer_id,
    rejection_type: 'SOFT' as const,
    reason: 'LOWER_SCORE' as const,
    composite_score: s.composite,
    score_delta: round4(s.composite - rank1.composite),
    arrival_time: getFinalArrivalTime(s.offer),
    note: `Rank ${i + 2}. Score delta: ${round4(rank1.composite - s.composite).toFixed(4)}.`,
  }));

  // Step 10: structured_explanation
  const explanation = buildStructuredExplanation(
    rank1,
    hardRejected,
    softRejected,
    request.constraints,
    request.offers.length,
    eligible.length,
    confidence,
    margin,
  );

  // Step 11: Assemble outputs
  const arrivalTime = getFinalArrivalTime(rank1.offer);
  const bufferMinutes = request.constraints.latest_arrival
    ? Math.floor(
        (new Date(request.constraints.latest_arrival).getTime() - new Date(arrivalTime).getTime()) /
          60000,
      )
    : 0;

  const selected: SelectedOffer = {
    offer_id: rank1.offer.offer_id,
    composite_score: rank1.composite,
    rank: 1,
    confidence,
    effective_confidence: effectiveConfidence,
    auto_executable: autoExecutable,
    price: { total: rank1.offer.price.total, currency: rank1.offer.price.currency },
    arrival_time: arrivalTime,
    buffer_minutes: bufferMinutes,
    connection_count: rank1.offer.itinerary.connection_count,
    total_duration_minutes: rank1.offer.itinerary.total_duration_minutes,
    score_breakdown: rank1.breakdown,
    structured_explanation: explanation,
  };

  const allRejected: RejectedOffer[] = [...hardRejected, ...softRejected];

  const durationMs = Math.round(performance.now() - startTime);
  const summary: EvaluationSummary = {
    total_offers: request.offers.length,
    eligible: eligible.length,
    rejected_hard: hardRejected.length,
    rejected_hard_breakdown: breakdown,
    rejected_soft: softRejected.length,
    traveler_profile_used: profile,
    profile_source: profileSource,
    scoring_weights_used: weights,
    selected_offer_id: rank1.offer.offer_id,
    confidence: { score: confidence.score, basis: confidence.basis },
    effective_confidence: effectiveConfidence,
    score_margin_to_rank2: margin,
    currency_normalized: currencies.size > 1,
    time_buffer_skipped: !request.constraints.latest_arrival || undefined,
    evaluated_at: evaluationTime.toISOString(),
    duration_ms: durationMs,
    agent_version: AGENT_VERSION,
  };

  const chainOut: ChainConfidence = {
    upstream: {
      ...(request.chain_confidence?.upstream ?? {}),
      [AGENT_VERSION]: { score: confidence.score, basis: confidence.basis, load_bearing: true },
    },
  };

  return {
    ok: true,
    data: {
      selected,
      rejected: allRejected,
      evaluation_summary: summary,
      chain_confidence_out: chainOut,
    },
  };
}

// ---------------------------------------------------------------------------
// Input validation — returns structured error, never throws
// ---------------------------------------------------------------------------

function validateInputs(request: OfferEvaluatorRequest): EvaluatorResult | null {
  if (!request.offers || request.offers.length === 0) {
    return {
      ok: false,
      error: { error: 'NO_OFFERS_PROVIDED', details: 'Offers array is empty or missing.' },
    };
  }

  if (!request.constraints || !hasAnyConstraint(request.constraints)) {
    return {
      ok: false,
      error: {
        error: 'NO_CONSTRAINTS_PROVIDED',
        details: 'At least one constraint field must be non-null.',
      },
    };
  }

  if (request.constraints.latest_arrival) {
    const parsed = new Date(request.constraints.latest_arrival);
    if (isNaN(parsed.getTime())) {
      return {
        ok: false,
        error: {
          error: 'INVALID_CONSTRAINTS',
          details: `latest_arrival is not valid ISO 8601: ${request.constraints.latest_arrival}`,
        },
      };
    }
  }

  if (request.scoring_weights) {
    const sum =
      request.scoring_weights.time_buffer +
      request.scoring_weights.price +
      request.scoring_weights.connection_quality +
      request.scoring_weights.journey_duration;
    if (Math.abs(sum - 1.0) > 0.001) {
      return {
        ok: false,
        error: {
          error: 'INVALID_SCORING_WEIGHTS',
          sum,
          details: `Weights sum to ${sum}, must be 1.0 (+-0.001).`,
        },
      };
    }
  }

  if (request.traveler_profile === 'CUSTOM' && !request.scoring_weights) {
    return {
      ok: false,
      error: {
        error: 'INVALID_SCORING_WEIGHTS',
        details: 'CUSTOM profile requires scoring_weights to be provided.',
      },
    };
  }

  return null;
}

function hasAnyConstraint(c: TravelerConstraints): boolean {
  return (
    c.latest_arrival != null ||
    c.prefer_direct != null ||
    c.max_connections != null ||
    c.price_ceiling != null ||
    (c.preferred_carriers != null && c.preferred_carriers.length > 0) ||
    (c.blacklisted_carriers != null && c.blacklisted_carriers.length > 0) ||
    c.cabin_class != null ||
    c.currency != null ||
    c.min_connection_minutes != null
  );
}

// ---------------------------------------------------------------------------
// Profile and weight resolution
// ---------------------------------------------------------------------------

function resolveProfileAndWeights(request: OfferEvaluatorRequest): {
  profile: TravelerProfile;
  profileSource: 'EXPLICIT' | 'AUTO_DETECTED';
  weights: ScoringWeights;
} {
  if (request.traveler_profile && request.traveler_profile !== 'CUSTOM') {
    return {
      profile: request.traveler_profile,
      profileSource: 'EXPLICIT',
      weights: getWeightsForProfile(request.traveler_profile),
    };
  }

  if (request.traveler_profile === 'CUSTOM' && request.scoring_weights) {
    return {
      profile: 'CUSTOM',
      profileSource: 'EXPLICIT',
      weights: request.scoring_weights,
    };
  }

  const detected = autoDetectProfile(request.constraints, request.offers);
  return {
    profile: detected,
    profileSource: 'AUTO_DETECTED',
    weights: getWeightsForProfile(detected),
  };
}

// ---------------------------------------------------------------------------
// Confidence computation
// ---------------------------------------------------------------------------

function computeConfidence(
  margin: number,
  eligibleCount: number,
  missingInputs: string[],
  currencyNormalized: boolean,
): ConfidenceResult {
  // Score from margin
  let score: number;
  if (margin > 0.15) score = 0.9;
  else if (margin >= 0.08) score = 0.8;
  else if (margin >= 0.03) score = 0.7;
  else score = 0.5;

  // Basis determination
  let basis: ConfidenceBasis;
  if (margin > 0.15 && eligibleCount >= 5 && missingInputs.length === 0) {
    basis = 'HIGH_DATA';
  } else if (margin < 0.03 || eligibleCount === 1 || currencyNormalized) {
    basis = 'LOW_DATA';
  } else {
    basis = 'MEDIUM_DATA';
  }

  return { score, basis, missing_inputs: missingInputs };
}

function computeLoadBearingFloor(chain?: ChainConfidence): number | null {
  if (!chain?.upstream) return null;
  const entries = Object.values(chain.upstream);
  const loadBearing = entries.filter((e) => e.load_bearing);
  if (loadBearing.length === 0) return null;
  return Math.min(...loadBearing.map((e) => e.score));
}

// ---------------------------------------------------------------------------
// Structured explanation builder
// ---------------------------------------------------------------------------

function buildStructuredExplanation(
  winner: { offer: EvaluatorOffer; breakdown: ScoreBreakdown; composite: number },
  hardRejected: RejectedOffer[],
  softRejected: RejectedOffer[],
  constraints: TravelerConstraints,
  totalOffers: number,
  eligibleCount: number,
  confidence: ConfidenceResult,
  margin: number,
): StructuredExplanation {
  const offer = winner.offer;
  const segments = offer.itinerary.segments;
  const firstSeg = segments[0]!;
  const lastSeg = segments[segments.length - 1]!;

  // Build flight descriptor
  const flightCodes = segments.map((s) => `${s.carrier}${s.flight_number}`).join('+');
  const route =
    segments.length === 1
      ? `${firstSeg.origin}-${lastSeg.destination}`
      : `${firstSeg.origin}-${segments.map((s) => s.destination).join('-')}`;
  const stops =
    offer.itinerary.connection_count === 0
      ? 'Direct'
      : `${offer.itinerary.connection_count} stop${offer.itinerary.connection_count > 1 ? 's' : ''}`;
  const departs = firstSeg.departure_time.slice(11, 16);
  const arrives = lastSeg.arrival_time.slice(11, 16);

  const selectedSummary = `${flightCodes} (${route}) | Departs ${departs} | Arrives ${arrives} | ${stops} | ${offer.price.total} ${offer.price.currency}`;

  // Buffer statement
  let bufferStatement: string | undefined;
  if (constraints.latest_arrival) {
    const bufferMin = Math.floor(
      (new Date(constraints.latest_arrival).getTime() - new Date(lastSeg.arrival_time).getTime()) /
        60000,
    );
    bufferStatement = `Arrives ${bufferMin} minutes before your deadline. ${bufferMin >= 45 ? 'This meets the required buffer.' : bufferMin >= 30 ? 'This is a tight margin.' : 'This leaves very little buffer.'}`;
  }

  // Direct availability
  let directAvailability: string | undefined;
  if (constraints.prefer_direct) {
    if (offer.itinerary.connection_count === 0) {
      directAvailability = 'Direct flight selected as preferred.';
    } else {
      directAvailability =
        'No direct flights available within your constraints. Best connecting option selected.';
    }
  }

  // Alternatives summary
  const rejectedHardCount = hardRejected.length;
  const alternativesSummary = constraints.latest_arrival
    ? `${eligibleCount} of ${totalOffers} offers met your arrival deadline. ${rejectedHardCount} were eliminated.`
    : `${eligibleCount} of ${totalOffers} offers passed constraint filters.`;

  // Top rejected
  const topRejected: TopRejected[] = [];
  // Top 2-3 hard rejections (by most common reason)
  const hardByReason = new Map<string, RejectedOffer[]>();
  for (const r of hardRejected) {
    const existing = hardByReason.get(r.reason) ?? [];
    existing.push(r);
    hardByReason.set(r.reason, existing);
  }
  const sortedHardReasons = [...hardByReason.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3);
  for (const [reason, offers] of sortedHardReasons) {
    const example = offers[0]!;
    topRejected.push({
      offer_id: example.offer_id,
      rejection_type: 'HARD',
      reason,
      arrival: example.arrival_time,
      note: `${offers.length} offer${offers.length > 1 ? 's' : ''} rejected: ${reason}.`,
    });
  }
  // Top 1-2 soft rejections
  for (const sr of softRejected.slice(0, 2)) {
    topRejected.push({
      offer_id: sr.offer_id,
      rejection_type: 'SOFT',
      reason: 'LOWER_SCORE',
      composite_score: sr.composite_score,
      score_delta: sr.score_delta,
      note: sr.note,
    });
  }

  // Confidence note
  let confidenceNote: string | undefined;
  if (confidence.basis === 'LOW_DATA') {
    confidenceNote =
      eligibleCount === 1
        ? 'LOW_DATA - only one eligible offer after constraint filtering.'
        : `LOW_DATA - margin between top two offers is ${margin.toFixed(4)}. Near-tie — selection is not definitive.`;
  } else if (confidence.basis === 'MEDIUM_DATA') {
    confidenceNote = `MEDIUM_DATA - margin between top two offers is ${margin.toFixed(4)}.`;
  }

  return {
    selected_summary: selectedSummary,
    buffer_statement: bufferStatement,
    direct_availability: directAvailability,
    alternatives_summary: alternativesSummary,
    top_rejected: topRejected,
    confidence_note: confidenceNote,
  };
}

// ---------------------------------------------------------------------------
// Agent wrapper (implements OTAIP Agent interface)
// ---------------------------------------------------------------------------

export class OfferEvaluatorAgent implements Agent<OfferEvaluatorRequest, OfferEvaluatorResponse> {
  readonly id = '1.9';
  readonly name = 'Offer Evaluator';
  readonly version = '0.1.0';
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<OfferEvaluatorRequest>,
  ): Promise<AgentOutput<OfferEvaluatorResponse>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const result = evaluateOffers(input.data);

    if (!result.ok) {
      // Return as agent output with confidence 0 and the error in warnings
      return {
        data: undefined as unknown as OfferEvaluatorResponse,
        confidence: 0,
        warnings: [`Evaluation failed: ${result.error.error} — ${result.error.details ?? ''}`],
        metadata: { error: result.error },
      };
    }

    return {
      data: result.data,
      confidence: result.data.evaluation_summary.effective_confidence,
      metadata: {
        agent_version: AGENT_VERSION,
        duration_ms: result.data.evaluation_summary.duration_ms,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    return { status: 'healthy', details: 'Stateless scoring engine — always available.' };
  }

  destroy(): void {
    this.initialized = false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
