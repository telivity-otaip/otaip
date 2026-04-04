/**
 * Property Deduplication Agent — Input/Output types
 *
 * Agent 20.2: Takes raw multi-source hotel results and identifies duplicate properties,
 * merging them into canonical property records with the best content from each source.
 *
 * 40-60% of multi-source city search results are duplicates of the same physical property.
 * This is THE biggest content quality problem in hotel distribution.
 *
 * Domain source: OTAIP Lodging Knowledge Base §10 (Property Deduplication)
 */

import type { RawHotelResult, CanonicalProperty } from '../types/hotel-common.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface DedupThresholds {
  /** Score above which properties are auto-merged (default: 0.85) */
  autoMerge: number;
  /** Score above which properties are flagged for review (default: 0.65) */
  review: number;
}

export interface DedupInput {
  /** Raw hotel results from Agent 20.1 (multiple sources, unmerged) */
  properties: RawHotelResult[];
  /** Custom merge thresholds (optional, uses defaults if omitted) */
  thresholds?: DedupThresholds;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Individual score components for a property pair comparison */
export interface ScoreBreakdown {
  /** Jaro-Winkler similarity on normalized property name (weight: 0.3) */
  name: number;
  /** Normalized Levenshtein similarity on address (weight: 0.2) */
  address: number;
  /** Haversine-based proximity score (weight: 0.25) */
  coordinates: number;
  /** Chain code exact match score (weight: 0.15) */
  chainCode: number;
  /** Star rating match score (weight: 0.1) */
  starRating: number;
  /** Weighted composite score */
  weighted: number;
}

export type MergeDecisionType = 'auto_merge' | 'review' | 'separate';

/** Audit trail for a single merge/separate decision */
export interface MergeDecision {
  /** Source property IDs involved in this comparison */
  propertyIds: string[];
  /** Composite score */
  score: number;
  /** Decision based on thresholds */
  decision: MergeDecisionType;
  /** Individual score components */
  scoreBreakdown: ScoreBreakdown;
}

export interface DedupStats {
  inputCount: number;
  outputCount: number;
  autoMerged: number;
  reviewFlagged: number;
  separated: number;
}

export interface DedupOutput {
  /** Canonical property records (one per physical property) */
  canonical: CanonicalProperty[];
  /** Full audit trail of merge/separate decisions */
  mergeLog: MergeDecision[];
  /** Summary statistics */
  stats: DedupStats;
}
