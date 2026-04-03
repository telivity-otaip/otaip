/**
 * Property Deduplication — Scoring algorithms.
 *
 * Multi-algorithm scoring for property pair comparison:
 * - Jaro-Winkler on property name (weight: 0.3)
 * - Levenshtein (normalized) on address (weight: 0.2)
 * - Haversine distance on coordinates, 250m threshold (weight: 0.25)
 * - Chain code exact match (weight: 0.15)
 * - Star rating match (weight: 0.1)
 *
 * Domain source: OTAIP Lodging Knowledge Base §10 (Fuzzy Matching Techniques)
 */

import type { ScoreBreakdown } from '../types.js';

// ---------------------------------------------------------------------------
// Scoring weights (from knowledge base)
// ---------------------------------------------------------------------------

const WEIGHTS = {
  name: 0.3,
  address: 0.2,
  coordinates: 0.25,
  chainCode: 0.15,
  starRating: 0.1,
} as const;

// ---------------------------------------------------------------------------
// Jaro-Winkler Distance
// ---------------------------------------------------------------------------

/**
 * Jaro similarity between two strings.
 * Returns 0 (no match) to 1 (exact match).
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matchWindow = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);

  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

/**
 * Jaro-Winkler similarity.
 * Emphasizes matching at string beginning (common prefix bonus).
 * Returns 0 (no match) to 1 (exact match).
 */
export function jaroWinkler(s1: string, s2: string, prefixScale = 0.1): number {
  const jaro = jaroSimilarity(s1, s2);

  // Common prefix length (max 4 characters per Winkler)
  let prefixLen = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) {
      prefixLen++;
    } else {
      break;
    }
  }

  return jaro + prefixLen * prefixScale * (1 - jaro);
}

// ---------------------------------------------------------------------------
// Levenshtein Distance (normalized)
// ---------------------------------------------------------------------------

/**
 * Levenshtein edit distance between two strings.
 */
function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  // Use two-row optimization for memory efficiency
  let prevRow = new Array<number>(s2.length + 1);
  let currRow = new Array<number>(s2.length + 1);

  for (let j = 0; j <= s2.length; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    currRow[0] = i;

    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j]! + 1,        // deletion
        currRow[j - 1]! + 1,    // insertion
        prevRow[j - 1]! + cost, // substitution
      );
    }

    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[s2.length]!;
}

/**
 * Normalized Levenshtein similarity.
 * Returns 0 (completely different) to 1 (exact match).
 * Formula: 1 - (distance / max(len1, len2))
 */
export function levenshteinSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshteinDistance(s1, s2) / maxLen;
}

// ---------------------------------------------------------------------------
// Haversine Distance
// ---------------------------------------------------------------------------

const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Haversine distance between two coordinate pairs.
 * Returns distance in meters.
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Haversine-based proximity score.
 * - 1.0 if within 50m
 * - Linear decay to 0 at 500m
 * - Threshold for potential match: 250m
 */
export function haversineScore(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const distance = haversineDistance(lat1, lon1, lat2, lon2);

  if (distance <= 50) return 1.0;
  if (distance >= 500) return 0.0;

  // Linear decay from 1.0 at 50m to 0.0 at 500m
  return 1 - (distance - 50) / (500 - 50);
}

// ---------------------------------------------------------------------------
// Chain code match
// ---------------------------------------------------------------------------

/**
 * Chain code exact match score.
 * - 1.0 if both have chain codes and they match
 * - 0.0 if both have chain codes and they differ
 * - 0.5 if one or both are missing
 */
export function chainCodeScore(code1?: string, code2?: string): number {
  if (!code1 || !code2) return 0.5;
  return code1.toUpperCase() === code2.toUpperCase() ? 1.0 : 0.0;
}

// ---------------------------------------------------------------------------
// Star rating match
// ---------------------------------------------------------------------------

/**
 * Star rating match score.
 * - 1.0 if exact match
 * - 0.5 if within 0.5 stars
 * - 0.0 if >0.5 difference
 * - 0.5 if one or both are missing
 */
export function starRatingScore(rating1?: number, rating2?: number): number {
  if (rating1 === undefined || rating2 === undefined) return 0.5;
  const diff = Math.abs(rating1 - rating2);
  if (diff === 0) return 1.0;
  if (diff <= 0.5) return 0.5;
  return 0.0;
}

// ---------------------------------------------------------------------------
// Composite score
// ---------------------------------------------------------------------------

/**
 * Calculate composite score from individual component scores.
 * Deterministic weighted sum using fixed weights from the knowledge base.
 */
export function compositeScore(breakdown: Omit<ScoreBreakdown, 'weighted'>): ScoreBreakdown {
  const weighted =
    breakdown.name * WEIGHTS.name +
    breakdown.address * WEIGHTS.address +
    breakdown.coordinates * WEIGHTS.coordinates +
    breakdown.chainCode * WEIGHTS.chainCode +
    breakdown.starRating * WEIGHTS.starRating;

  return { ...breakdown, weighted };
}
