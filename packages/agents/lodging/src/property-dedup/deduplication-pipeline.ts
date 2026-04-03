/**
 * Property Deduplication — Full pipeline.
 *
 * Orchestrates: normalize → block → score → threshold → merge
 *
 * Pipeline steps:
 * 1. Normalize — standardize names and addresses
 * 2. Block — group candidates by coarse criteria to reduce O(n²) comparisons
 * 3. Score — multi-algorithm scoring across name, address, coordinates, chain, stars
 * 4. Threshold — confidence score determines auto-merge vs review vs separate
 * 5. Merge — combine best content from each source into canonical record
 *
 * Domain source: OTAIP Lodging Knowledge Base §10 (Standard Deduplication Workflow)
 */

import type { RawHotelResult, CanonicalProperty } from '../types/hotel-common.js';
import type { DedupThresholds, MergeDecision, DedupStats, ScoreBreakdown } from './types.js';
import { normalizeName, normalizeAddress } from './matching/normalizer.js';
import { buildBlocks, getCandidatePairs } from './matching/blocker.js';
import {
  jaroWinkler,
  levenshteinSimilarity,
  haversineScore,
  chainCodeScore,
  starRatingScore,
  compositeScore,
} from './matching/scorer.js';
import { mergeProperties, singletonCanonical } from './matching/merger.js';

const DEFAULT_THRESHOLDS: DedupThresholds = {
  autoMerge: 0.85,
  review: 0.65,
};

interface PipelineResult {
  canonical: CanonicalProperty[];
  mergeLog: MergeDecision[];
  stats: DedupStats;
}

/**
 * Run the full deduplication pipeline on a set of raw hotel results.
 */
export function runDeduplicationPipeline(
  properties: RawHotelResult[],
  thresholds?: DedupThresholds,
): PipelineResult {
  const t = thresholds ?? DEFAULT_THRESHOLDS;

  if (properties.length === 0) {
    return {
      canonical: [],
      mergeLog: [],
      stats: { inputCount: 0, outputCount: 0, autoMerged: 0, reviewFlagged: 0, separated: 0 },
    };
  }

  if (properties.length === 1) {
    return {
      canonical: [singletonCanonical(properties[0]!)],
      mergeLog: [],
      stats: { inputCount: 1, outputCount: 1, autoMerged: 0, reviewFlagged: 0, separated: 0 },
    };
  }

  // Step 1: Pre-compute normalized strings
  const normalized = properties.map((p) => ({
    name: normalizeName(p.propertyName),
    address: normalizeAddress(
      `${p.address.line1} ${p.address.city} ${p.address.stateProvince ?? ''} ${p.address.countryCode}`,
    ),
  }));

  // Step 2: Block
  const blocks = buildBlocks(properties);
  const candidatePairs = getCandidatePairs(blocks);

  // Step 3: Score all candidate pairs
  const mergeLog: MergeDecision[] = [];
  const pairScores = new Map<string, ScoreBreakdown>();

  for (const [i, j] of candidatePairs) {
    const propA = properties[i]!;
    const propB = properties[j]!;
    const normA = normalized[i]!;
    const normB = normalized[j]!;

    const breakdown = compositeScore({
      name: jaroWinkler(normA.name, normB.name),
      address: levenshteinSimilarity(normA.address, normB.address),
      coordinates: haversineScore(
        propA.coordinates.latitude, propA.coordinates.longitude,
        propB.coordinates.latitude, propB.coordinates.longitude,
      ),
      chainCode: chainCodeScore(propA.chainCode, propB.chainCode),
      starRating: starRatingScore(propA.starRating, propB.starRating),
    });

    const pairKey = `${i}:${j}`;
    pairScores.set(pairKey, breakdown);

    const decision: MergeDecision = {
      propertyIds: [
        `${propA.source.sourceId}:${propA.source.sourcePropertyId}`,
        `${propB.source.sourceId}:${propB.source.sourcePropertyId}`,
      ],
      score: breakdown.weighted,
      decision: breakdown.weighted >= t.autoMerge ? 'auto_merge'
        : breakdown.weighted >= t.review ? 'review'
        : 'separate',
      scoreBreakdown: breakdown,
    };

    mergeLog.push(decision);
  }

  // Step 4: Build merge groups using Union-Find
  const parent = Array.from({ length: properties.length }, (_, i) => i);

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!; // path compression
      x = parent[x]!;
    }
    return x;
  }

  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent[rootB] = rootA;
    }
  }

  // Merge pairs that scored above the review threshold (both auto_merge and review)
  for (const [i, j] of candidatePairs) {
    const key = `${i}:${j}`;
    const breakdown = pairScores.get(key);
    if (breakdown && breakdown.weighted >= t.review) {
      union(i, j);
    }
  }

  // Step 5: Group by root and merge
  const groups = new Map<number, number[]>();
  for (let i = 0; i < properties.length; i++) {
    const root = find(i);
    const existing = groups.get(root);
    if (existing) {
      existing.push(i);
    } else {
      groups.set(root, [i]);
    }
  }

  const canonical: CanonicalProperty[] = [];
  let autoMerged = 0;
  let reviewFlagged = 0;
  let separated = 0;

  for (const indices of groups.values()) {
    if (indices.length === 1) {
      canonical.push(singletonCanonical(properties[indices[0]!]!));
      separated++;
    } else {
      const groupProperties = indices.map((i) => properties[i]!);

      // Find the best merge decision for this group
      let bestScore = 0;
      let bestDecision: MergeDecision | undefined;

      for (const [i, j] of candidatePairs) {
        if (indices.includes(i) && indices.includes(j)) {
          const key = `${i}:${j}`;
          const breakdown = pairScores.get(key);
          if (breakdown && breakdown.weighted > bestScore) {
            bestScore = breakdown.weighted;
            bestDecision = mergeLog.find(
              (d) => d.score === breakdown.weighted &&
                d.propertyIds.includes(`${properties[i]!.source.sourceId}:${properties[i]!.source.sourcePropertyId}`),
            );
          }
        }
      }

      if (bestDecision) {
        canonical.push(mergeProperties(groupProperties, bestDecision));
        if (bestDecision.decision === 'auto_merge') {
          autoMerged++;
        } else {
          reviewFlagged++;
        }
      } else {
        // Fallback: shouldn't happen, but create canonical anyway
        const fallbackDecision: MergeDecision = {
          propertyIds: groupProperties.map((p) => `${p.source.sourceId}:${p.source.sourcePropertyId}`),
          score: 0,
          decision: 'review',
          scoreBreakdown: { name: 0, address: 0, coordinates: 0, chainCode: 0, starRating: 0, weighted: 0 },
        };
        canonical.push(mergeProperties(groupProperties, fallbackDecision));
        reviewFlagged++;
      }
    }
  }

  return {
    canonical,
    mergeLog,
    stats: {
      inputCount: properties.length,
      outputCount: canonical.length,
      autoMerged,
      reviewFlagged,
      separated,
    },
  };
}
