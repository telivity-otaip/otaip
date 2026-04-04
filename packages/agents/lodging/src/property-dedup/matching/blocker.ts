/**
 * Property Deduplication — Blocking.
 *
 * Groups candidate properties by coarse criteria to reduce O(n²) comparison space.
 * Only properties within the same block are compared.
 *
 * Blocking strategies:
 * - City + chain code (if available)
 * - City + first 3 characters of normalized name
 * - Geographic proximity via geohash-like bucketing (~1km grid)
 *
 * Domain source: OTAIP Lodging Knowledge Base §10 (Standard Deduplication Workflow)
 */

import type { RawHotelResult } from '../../types/hotel-common.js';
import { normalizeName } from './normalizer.js';

/**
 * Generate blocking keys for a property.
 * A property can belong to multiple blocks (increases recall at cost of more comparisons).
 */
export function generateBlockKeys(property: RawHotelResult): string[] {
  const keys: string[] = [];
  const city = property.address.city.toLowerCase().trim();
  const normalizedName = normalizeName(property.propertyName);

  // Block 1: city + chain code (high precision for branded hotels)
  if (property.chainCode) {
    keys.push(`${city}|chain:${property.chainCode.toUpperCase()}`);
  }

  // Block 2: city + first 3 chars of normalized name
  if (normalizedName.length >= 3) {
    keys.push(`${city}|name3:${normalizedName.substring(0, 3)}`);
  }

  // Block 3: geographic grid (~1km precision)
  // Truncate coordinates to 2 decimal places (~1.1km at equator)
  const latBucket = Math.floor(property.coordinates.latitude * 100) / 100;
  const lonBucket = Math.floor(property.coordinates.longitude * 100) / 100;
  keys.push(`geo:${latBucket}|${lonBucket}`);

  // Also add adjacent geo-buckets to catch properties on grid boundaries
  const latAdj = latBucket + 0.01;
  const lonAdj = lonBucket + 0.01;
  keys.push(`geo:${latAdj}|${lonBucket}`);
  keys.push(`geo:${latBucket}|${lonAdj}`);

  return keys;
}

/**
 * Group properties into blocks.
 * Returns a map of block key → array of property indices.
 * Properties in the same block will be compared pairwise.
 */
export function buildBlocks(properties: RawHotelResult[]): Map<string, number[]> {
  const blocks = new Map<string, number[]>();

  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i]!;
    const keys = generateBlockKeys(prop);

    for (const key of keys) {
      const existing = blocks.get(key);
      if (existing) {
        existing.push(i);
      } else {
        blocks.set(key, [i]);
      }
    }
  }

  return blocks;
}

/**
 * Get unique pairs of property indices that should be compared.
 * Deduplicates pairs that appear in multiple blocks.
 */
export function getCandidatePairs(blocks: Map<string, number[]>): Array<[number, number]> {
  const pairSet = new Set<string>();
  const pairs: Array<[number, number]> = [];

  for (const indices of blocks.values()) {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = Math.min(indices[i]!, indices[j]!);
        const b = Math.max(indices[i]!, indices[j]!);
        const key = `${a}:${b}`;
        if (!pairSet.has(key)) {
          pairSet.add(key);
          pairs.push([a, b]);
        }
      }
    }
  }

  return pairs;
}
