/**
 * Fuzzy name matching for Airport Code Resolver.
 *
 * Uses Fuse.js for fuzzy search with tuned thresholds for airport names.
 * Match confidence: exact IATA/ICAO = 1.0, city code = 0.95, fuzzy name = 0.5-0.9
 */

import Fuse from 'fuse.js';
import type { ProcessedAirport } from './types.js';

export interface FuzzyMatchResult {
  airport: ProcessedAirport;
  confidence: number;
}

let fuseInstance: Fuse<ProcessedAirport> | null = null;

/**
 * Initialize the fuzzy search index. Call once after loading airport data.
 */
export function initFuzzyIndex(airports: ProcessedAirport[]): void {
  fuseInstance = new Fuse(airports, {
    keys: [
      { name: 'name', weight: 0.6 },
      { name: 'city_name', weight: 0.3 },
      { name: 'iata_code', weight: 0.1 },
    ],
    threshold: 0.4,
    distance: 100,
    includeScore: true,
    minMatchCharLength: 2,
  });
}

/**
 * Search airports by name with fuzzy matching.
 * Returns matches sorted by confidence (highest first).
 */
export function fuzzySearch(query: string, limit: number = 5): FuzzyMatchResult[] {
  if (!fuseInstance) {
    throw new Error('Fuzzy index not initialized. Call initFuzzyIndex() first.');
  }

  const results = fuseInstance.search(query, { limit });

  return results.map((result) => ({
    airport: result.item,
    // Fuse.js score is 0 (perfect) to 1 (no match). Invert to our 0-1 confidence scale.
    confidence: result.score !== undefined ? Math.round((1 - result.score) * 100) / 100 : 0,
  }));
}

/**
 * Reset the fuzzy index (used in testing).
 */
export function resetFuzzyIndex(): void {
  fuseInstance = null;
}
