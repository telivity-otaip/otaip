/**
 * Property Deduplication — Content merger.
 *
 * Takes merge decisions and creates CanonicalProperty records.
 * Selects best content per attribute using source trust hierarchy:
 * 1. Hotel direct / chain CRS (most authoritative)
 * 2. Major OTAs (Booking.com, Expedia — strong content quality)
 * 3. GDS content (standardized but sparse)
 * 4. Smaller aggregators
 *
 * Domain source: OTAIP Lodging Knowledge Base §10 (Content Merging After Deduplication)
 */

import type { RawHotelResult, CanonicalProperty, GeoCoordinates, HotelAddress } from '../../types/hotel-common.js';
import type { MergeDecision } from '../types.js';

/**
 * Source trust ranking (lower = more trusted).
 * Used to select which source's content wins for each attribute.
 */
const SOURCE_TRUST: Record<string, number> = {
  direct: 1,
  amadeus: 3,
  hotelbeds: 3,
  duffel: 3,
};

const DEFAULT_TRUST = 5;

function getTrust(sourceId: string): number {
  return SOURCE_TRUST[sourceId] ?? DEFAULT_TRUST;
}

/** Pick the most trusted source's value for an attribute. */
function pickBestSource(results: RawHotelResult[]): RawHotelResult {
  const sorted = [...results].sort((a, b) => getTrust(a.source.sourceId) - getTrust(b.source.sourceId));
  return sorted[0]!;
}

/** Pick the most precise coordinates (most decimal places). */
function pickBestCoordinates(results: RawHotelResult[]): GeoCoordinates {
  let best = results[0]!.coordinates;
  let bestPrecision = 0;

  for (const r of results) {
    const latStr = r.coordinates.latitude.toString();
    const lonStr = r.coordinates.longitude.toString();
    const latDec = latStr.includes('.') ? latStr.split('.')[1]!.length : 0;
    const lonDec = lonStr.includes('.') ? lonStr.split('.')[1]!.length : 0;
    const precision = latDec + lonDec;

    if (precision > bestPrecision) {
      bestPrecision = precision;
      best = r.coordinates;
    }
  }

  return best;
}

/** Pick best address — prefer most complete (more fields filled). */
function pickBestAddress(results: RawHotelResult[]): HotelAddress {
  let best = results[0]!.address;
  let bestScore = 0;

  for (const r of results) {
    let score = 0;
    if (r.address.line1) score++;
    if (r.address.line2) score++;
    if (r.address.city) score++;
    if (r.address.stateProvince) score++;
    if (r.address.postalCode) score++;
    if (r.address.countryCode) score++;

    // Boost by trust
    score += (10 - getTrust(r.source.sourceId));

    if (score > bestScore) {
      bestScore = score;
      best = r.address;
    }
  }

  return best;
}

/** Generate a deterministic canonical ID. */
function generateCanonicalId(results: RawHotelResult[]): string {
  // Sort source IDs for deterministic ordering
  const sourceKey = results
    .map((r) => `${r.source.sourceId}:${r.source.sourcePropertyId}`)
    .sort()
    .join('|');
  // Simple hash-like ID (deterministic for same inputs within a session)
  return `otaip-htl-${hashCode(sourceKey)}`;
}

function hashCode(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36).padStart(8, '0');
}

/**
 * Merge a group of duplicate properties into a single CanonicalProperty.
 */
export function mergeProperties(
  results: RawHotelResult[],
  mergeDecision: MergeDecision,
): CanonicalProperty {
  if (results.length === 0) {
    throw new Error('Cannot merge empty property list');
  }

  const best = pickBestSource(results);

  return {
    canonicalId: generateCanonicalId(results),
    propertyName: best.propertyName,
    address: pickBestAddress(results),
    coordinates: pickBestCoordinates(results),
    chainCode: best.chainCode ?? results.find((r) => r.chainCode)?.chainCode,
    chainName: best.chainName ?? results.find((r) => r.chainName)?.chainName,
    starRating: best.starRating ?? results.find((r) => r.starRating !== undefined)?.starRating,
    sources: results.map((r) => r.source),
    sourceResults: results,
    mergeConfidence: mergeDecision.score,
    mergeReasoning: buildMergeReasoning(mergeDecision, results),
    reviewRequired: mergeDecision.decision === 'review',
  };
}

/**
 * Create a CanonicalProperty from a single unmatched property.
 * Unmatched properties are returned as-is (never silently dropped).
 */
export function singletonCanonical(result: RawHotelResult): CanonicalProperty {
  return {
    canonicalId: generateCanonicalId([result]),
    propertyName: result.propertyName,
    address: result.address,
    coordinates: result.coordinates,
    chainCode: result.chainCode,
    chainName: result.chainName,
    starRating: result.starRating,
    sources: [result.source],
    sourceResults: [result],
    mergeConfidence: 1.0,
    mergeReasoning: 'Single source — no merge required',
    reviewRequired: false,
  };
}

function buildMergeReasoning(decision: MergeDecision, results: RawHotelResult[]): string {
  const sb = decision.scoreBreakdown;
  const sources = results.map((r) => `${r.source.sourceId}:${r.source.sourcePropertyId}`).join(', ');
  const parts: string[] = [
    `Merged ${results.length} sources (${sources})`,
    `Composite score: ${decision.score.toFixed(3)}`,
    `Name similarity: ${sb.name.toFixed(3)}`,
    `Address similarity: ${sb.address.toFixed(3)}`,
    `Coordinate proximity: ${sb.coordinates.toFixed(3)}`,
    `Chain match: ${sb.chainCode.toFixed(3)}`,
    `Star rating: ${sb.starRating.toFixed(3)}`,
    `Decision: ${decision.decision}`,
  ];
  return parts.join('; ');
}