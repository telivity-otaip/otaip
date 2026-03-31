/**
 * Agent 1.9 — Offer Evaluator Types
 *
 * All input/output types for the deterministic offer evaluation engine.
 * The LLM receives structured_explanation and translates it — it does not
 * originate the selection decision.
 */

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface EvaluatorOffer {
  offer_id: string;
  price: { total: number; currency: string };
  itinerary: {
    segments: EvaluatorSegment[];
    total_duration_minutes: number;
    connection_count: number;
  };
  expires_at?: string;
}

export interface EvaluatorSegment {
  carrier: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_time: string;
  arrival_time: string;
  duration_minutes?: number;
  cabin_class?: string;
  operating_carrier?: string;
  aircraft?: string;
}

export interface TravelerConstraints {
  latest_arrival?: string;
  prefer_direct?: boolean;
  max_connections?: number;
  price_ceiling?: number;
  preferred_carriers?: string[];
  blacklisted_carriers?: string[];
  cabin_class?: string;
  currency?: string;
  min_connection_minutes?: number;
}

export type TravelerProfile =
  | 'BUSINESS_TIME_CRITICAL'
  | 'BUSINESS_PRICE_CONSTRAINED'
  | 'LEISURE'
  | 'CORPORATE_POLICY'
  | 'CUSTOM';

export interface ScoringWeights {
  time_buffer: number;
  price: number;
  connection_quality: number;
  journey_duration: number;
}

export interface ChainConfidenceEntry {
  score: number;
  basis: ConfidenceBasis;
  load_bearing: boolean;
}

export interface ChainConfidence {
  upstream: Record<string, ChainConfidenceEntry>;
}

export interface OfferEvaluatorRequest {
  offers: EvaluatorOffer[];
  constraints: TravelerConstraints;
  traveler_profile?: TravelerProfile;
  scoring_weights?: ScoringWeights;
  chain_confidence?: ChainConfidence;
}

// ---------------------------------------------------------------------------
// Scoring dimension outputs
// ---------------------------------------------------------------------------

export type BufferTier =
  | 'CATASTROPHIC'
  | 'HIGH_RISK'
  | 'MARGINAL'
  | 'GOOD'
  | 'IDEAL'
  | 'DIMINISHING'
  | 'VERY_EARLY'
  | 'N/A';

export interface TimeBufferScore {
  score: number;
  weight: number;
  weighted: number;
  buffer_minutes: number;
  tier: BufferTier;
}

export interface PriceScore {
  score: number;
  weight: number;
  weighted: number;
  vs_cheapest_pct: number;
}

export type ConnectionRisk = 'NONE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface ConnectionQualityScore {
  score: number;
  weight: number;
  weighted: number;
  layover_minutes: number;
  risk: ConnectionRisk;
}

export interface JourneyDurationScore {
  score: number;
  weight: number;
  weighted: number;
  vs_fastest_pct: number;
}

export interface ScoreBreakdown {
  time_buffer: TimeBufferScore;
  price: PriceScore;
  connection_quality: ConnectionQualityScore;
  journey_duration: JourneyDurationScore;
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export type ConfidenceBasis = 'HIGH_DATA' | 'MEDIUM_DATA' | 'LOW_DATA' | 'NO_DATA';

export interface ConfidenceResult {
  score: number;
  basis: ConfidenceBasis;
  missing_inputs: string[];
}

// ---------------------------------------------------------------------------
// structured_explanation
// ---------------------------------------------------------------------------

export interface TopRejected {
  offer_id: string;
  rejection_type: 'HARD' | 'SOFT';
  reason: string;
  arrival?: string;
  composite_score?: number;
  score_delta?: number;
  note?: string;
}

export interface StructuredExplanation {
  selected_summary: string;
  buffer_statement?: string;
  direct_availability?: string;
  alternatives_summary: string;
  top_rejected: TopRejected[];
  confidence_note?: string;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface SelectedOffer {
  offer_id: string;
  composite_score: number;
  rank: number;
  confidence: ConfidenceResult;
  effective_confidence: number;
  auto_executable: boolean;
  price: { total: number; currency: string };
  arrival_time: string;
  buffer_minutes: number;
  connection_count: number;
  total_duration_minutes: number;
  score_breakdown: ScoreBreakdown;
  structured_explanation: StructuredExplanation;
}

export type HardRejectionCode =
  | 'MISSING_CRITICAL_DATA'
  | 'OFFER_EXPIRED'
  | 'ARRIVES_TOO_LATE'
  | 'EXCEEDS_MAX_CONNECTIONS'
  | 'EXCEEDS_PRICE_CEILING'
  | 'BLACKLISTED_CARRIER'
  | 'TIGHT_CONNECTION_BELOW_MINIMUM';

export interface RejectedOffer {
  offer_id: string;
  rejection_type: 'HARD' | 'SOFT';
  reason: HardRejectionCode | 'LOWER_SCORE';
  composite_score?: number;
  score_delta?: number;
  arrival_time?: string;
  deadline?: string;
  expires_at?: string;
  note?: string;
}

export interface EvaluationSummary {
  total_offers: number;
  eligible: number;
  rejected_hard: number;
  rejected_hard_breakdown: Partial<Record<HardRejectionCode, number>>;
  rejected_soft: number;
  traveler_profile_used: TravelerProfile;
  profile_source: 'EXPLICIT' | 'AUTO_DETECTED';
  scoring_weights_used: ScoringWeights;
  selected_offer_id: string;
  confidence: { score: number; basis: ConfidenceBasis };
  effective_confidence: number;
  score_margin_to_rank2: number;
  currency_normalized: boolean;
  time_buffer_skipped?: boolean;
  evaluated_at: string;
  duration_ms: number;
  agent_version: string;
}

export interface OfferEvaluatorResponse {
  selected: SelectedOffer;
  rejected: RejectedOffer[];
  evaluation_summary: EvaluationSummary;
  chain_confidence_out: ChainConfidence;
}

// ---------------------------------------------------------------------------
// Error types (never throw — return structured errors)
// ---------------------------------------------------------------------------

export type EvaluatorErrorCode =
  | 'NO_OFFERS_PROVIDED'
  | 'NO_CONSTRAINTS_PROVIDED'
  | 'NO_ELIGIBLE_OFFERS'
  | 'INVALID_SCORING_WEIGHTS'
  | 'INVALID_CONSTRAINTS'
  | 'CURRENCY_NORMALIZATION_FAILED';

export interface EvaluatorError {
  error: EvaluatorErrorCode;
  details?: string;
  sum?: number;
  rejection_breakdown?: Partial<Record<HardRejectionCode, number>>;
  full_rejected?: RejectedOffer[];
  currencies_found?: string[];
}

export type EvaluatorResult =
  | { ok: true; data: OfferEvaluatorResponse }
  | { ok: false; error: EvaluatorError };
