/**
 * Amenity normalization — maps raw amenity strings to OTAIP taxonomy.
 *
 * Hotels have no standard amenity taxonomy across systems.
 * "complimentary WiFi", "free internet", "wireless included" all mean the same thing.
 *
 * Strategy: lowercase + fuzzy substring matching against AMENITY_SYNONYMS.
 *
 * Domain source: OTAIP Lodging Knowledge Base §5 (Hotel Content Challenges)
 */

import type { NormalizedAmenity } from '../types/amenity-taxonomy.js';
import { AMENITY_SYNONYMS } from '../types/amenity-taxonomy.js';

interface NormalizationResult {
  mapped: NormalizedAmenity[];
  unmapped: string[];
}

/**
 * Normalize a list of raw amenity strings from a single source.
 * Deduplicates by amenityId (same amenity from multiple raw strings → one entry).
 */
export function normalizeAmenities(rawAmenities: string[]): NormalizationResult {
  const mapped = new Map<string, NormalizedAmenity>();
  const unmapped: string[] = [];

  for (const raw of rawAmenities) {
    const normalized = matchAmenity(raw);
    if (normalized) {
      // Deduplicate by amenityId
      if (!mapped.has(normalized.amenityId)) {
        mapped.set(normalized.amenityId, normalized);
      }
    } else {
      unmapped.push(raw);
    }
  }

  return {
    mapped: Array.from(mapped.values()),
    unmapped,
  };
}

/**
 * Match a single raw amenity string to the OTAIP taxonomy.
 * Uses case-insensitive substring matching against known synonyms.
 */
function matchAmenity(raw: string): NormalizedAmenity | null {
  const lower = raw.toLowerCase().trim();

  // Direct match
  const direct = AMENITY_SYNONYMS[lower];
  if (direct) {
    return { ...direct };
  }

  // Substring match — find the longest matching synonym
  let bestMatch: (typeof AMENITY_SYNONYMS)[string] | null = null;
  let bestLength = 0;

  for (const [synonym, definition] of Object.entries(AMENITY_SYNONYMS)) {
    if (lower.includes(synonym) && synonym.length > bestLength) {
      bestMatch = definition;
      bestLength = synonym.length;
    }
  }

  if (bestMatch) {
    return { ...bestMatch };
  }

  return null;
}

/**
 * Merge amenities from multiple sources for a canonical property.
 * Union of all sources — most complete list wins.
 * Deduplicates by amenityId across sources.
 */
export function mergeAmenities(amenityLists: string[][]): NormalizationResult {
  const allRaw = amenityLists.flat();
  return normalizeAmenities(allRaw);
}
