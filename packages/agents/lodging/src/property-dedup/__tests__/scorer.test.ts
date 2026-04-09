import { describe, it, expect } from 'vitest';
import {
  jaroWinkler,
  levenshteinSimilarity,
  haversineDistance,
  haversineScore,
  chainCodeScore,
  starRatingScore,
  compositeScore,
} from '../matching/scorer.js';

describe('Deduplication Scoring Algorithms', () => {
  describe('Jaro-Winkler', () => {
    it('returns 1.0 for identical strings', () => {
      expect(jaroWinkler('Marriott', 'Marriott')).toBe(1.0);
    });

    it('returns high score for similar strings with typo', () => {
      const score = jaroWinkler('Marriott', 'Mariott');
      expect(score).toBeGreaterThan(0.9);
    });

    it('returns high score for same hotel different naming', () => {
      const score = jaroWinkler('marriott marquis', 'new york marriott marquis');
      expect(score).toBeGreaterThan(0.6);
    });

    it('returns low score for completely different strings', () => {
      const score = jaroWinkler('Hilton', 'Sheraton');
      expect(score).toBeLessThan(0.65);
    });

    it('returns 0 for empty strings vs non-empty', () => {
      expect(jaroWinkler('', 'Hotel')).toBe(0.0);
      expect(jaroWinkler('Hotel', '')).toBe(0.0);
    });

    it('returns 1.0 for two empty strings', () => {
      expect(jaroWinkler('', '')).toBe(1.0);
    });

    it('gives prefix bonus (Winkler component)', () => {
      // Strings with same prefix should score higher than same Jaro with different prefix
      const withPrefix = jaroWinkler('Hilton Garden Inn', 'Hilton Gdn Inn');
      const noPrefix = jaroWinkler('Garden Inn Hilton', 'Gdn Inn Hilton');
      expect(withPrefix).toBeGreaterThanOrEqual(noPrefix);
    });
  });

  describe('Levenshtein Similarity', () => {
    it('returns 1.0 for identical strings', () => {
      expect(levenshteinSimilarity('1535 Broadway', '1535 Broadway')).toBe(1.0);
    });

    it('returns high score for minor differences', () => {
      const score = levenshteinSimilarity('1535 Broadway', '1535 Broadway Ave');
      expect(score).toBeGreaterThan(0.7);
    });

    it('returns low score for very different addresses', () => {
      const score = levenshteinSimilarity('1535 Broadway', '100 Park Avenue');
      expect(score).toBeLessThan(0.5);
    });

    it('returns 1.0 for two empty strings', () => {
      expect(levenshteinSimilarity('', '')).toBe(1.0);
    });

    it('handles single character strings', () => {
      expect(levenshteinSimilarity('a', 'b')).toBe(0.0);
      expect(levenshteinSimilarity('a', 'a')).toBe(1.0);
    });
  });

  describe('Haversine Distance', () => {
    it('returns 0 for identical coordinates', () => {
      expect(haversineDistance(40.758, -73.9855, 40.758, -73.9855)).toBe(0);
    });

    it('calculates ~111km for 1 degree latitude', () => {
      const distance = haversineDistance(40.0, -73.0, 41.0, -73.0);
      expect(distance).toBeGreaterThan(110_000);
      expect(distance).toBeLessThan(112_000);
    });

    it('calculates short distances accurately', () => {
      // Two points ~100m apart in Manhattan
      const distance = haversineDistance(40.758, -73.9855, 40.7581, -73.9856);
      expect(distance).toBeGreaterThan(5);
      expect(distance).toBeLessThan(200);
    });

    it('handles coordinates across hemispheres', () => {
      const distance = haversineDistance(40.758, -73.9855, -33.8688, 151.2093);
      expect(distance).toBeGreaterThan(15_000_000); // NYC to Sydney > 15,000km
    });
  });

  describe('Haversine Score', () => {
    it('returns 1.0 for same location', () => {
      expect(haversineScore(40.758, -73.9855, 40.758, -73.9855)).toBe(1.0);
    });

    it('returns 1.0 for very close locations (within 50m)', () => {
      // ~10m apart
      const score = haversineScore(40.758, -73.9855, 40.75801, -73.98551);
      expect(score).toBe(1.0);
    });

    it('returns 0.0 for far apart locations (>500m)', () => {
      // ~5km apart
      const score = haversineScore(40.758, -73.9855, 40.8, -73.9855);
      expect(score).toBe(0.0);
    });

    it('returns intermediate score for 250m threshold area', () => {
      // Properties within industry 250m threshold should score > 0.4
      const score = haversineScore(40.758, -73.9855, 40.7581, -73.9856);
      expect(score).toBeGreaterThan(0.4);
    });
  });

  describe('Chain Code Score', () => {
    it('returns 1.0 for matching chain codes', () => {
      expect(chainCodeScore('MC', 'MC')).toBe(1.0);
    });

    it('returns 1.0 for case-insensitive match', () => {
      expect(chainCodeScore('hh', 'HH')).toBe(1.0);
    });

    it('returns 0.0 for different chain codes', () => {
      expect(chainCodeScore('MC', 'HH')).toBe(0.0);
    });

    it('returns 0.5 when one chain code is missing', () => {
      expect(chainCodeScore('MC', undefined)).toBe(0.5);
      expect(chainCodeScore(undefined, 'HH')).toBe(0.5);
    });

    it('returns 0.5 when both chain codes are missing', () => {
      expect(chainCodeScore(undefined, undefined)).toBe(0.5);
    });
  });

  describe('Star Rating Score', () => {
    it('returns 1.0 for exact match', () => {
      expect(starRatingScore(4, 4)).toBe(1.0);
    });

    it('returns 0.5 for 0.5 star difference', () => {
      expect(starRatingScore(4, 4.5)).toBe(0.5);
      expect(starRatingScore(3.5, 4)).toBe(0.5);
    });

    it('returns 0.0 for >0.5 star difference', () => {
      expect(starRatingScore(3, 4)).toBe(0.0);
      expect(starRatingScore(5, 3)).toBe(0.0);
    });

    it('returns 0.5 when one or both ratings are missing', () => {
      expect(starRatingScore(4, undefined)).toBe(0.5);
      expect(starRatingScore(undefined, undefined)).toBe(0.5);
    });
  });

  describe('Composite Score', () => {
    it('returns weighted sum of all components', () => {
      const result = compositeScore({
        name: 1.0,
        address: 1.0,
        coordinates: 1.0,
        chainCode: 1.0,
        starRating: 1.0,
      });
      expect(result.weighted).toBeCloseTo(1.0, 5);
    });

    it('returns 0 when all components are 0', () => {
      const result = compositeScore({
        name: 0,
        address: 0,
        coordinates: 0,
        chainCode: 0,
        starRating: 0,
      });
      expect(result.weighted).toBe(0);
    });

    it('applies correct weights', () => {
      // Only name component = 1.0, rest = 0
      const nameOnly = compositeScore({
        name: 1.0,
        address: 0,
        coordinates: 0,
        chainCode: 0,
        starRating: 0,
      });
      expect(nameOnly.weighted).toBeCloseTo(0.3, 5); // name weight = 0.3

      // Only coordinates component = 1.0
      const coordOnly = compositeScore({
        name: 0,
        address: 0,
        coordinates: 1.0,
        chainCode: 0,
        starRating: 0,
      });
      expect(coordOnly.weighted).toBeCloseTo(0.25, 5); // coord weight = 0.25
    });

    it('weights sum to 1.0', () => {
      // All components at 0.5 should give exactly 0.5
      const result = compositeScore({
        name: 0.5,
        address: 0.5,
        coordinates: 0.5,
        chainCode: 0.5,
        starRating: 0.5,
      });
      expect(result.weighted).toBeCloseTo(0.5, 5);
    });
  });
});
