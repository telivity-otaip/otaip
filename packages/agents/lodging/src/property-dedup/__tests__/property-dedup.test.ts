import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PropertyDeduplicationAgent } from '../index.js';
import type { RawHotelResult } from '../../types/hotel-common.js';

// ---------------------------------------------------------------------------
// Test fixtures — overlapping properties from different sources
// ---------------------------------------------------------------------------

function makeProperty(overrides: Partial<RawHotelResult> & { source: RawHotelResult['source']; propertyName: string; address: RawHotelResult['address']; coordinates: RawHotelResult['coordinates'] }): RawHotelResult {
  return {
    amenities: [],
    roomTypes: [],
    rates: [],
    photos: [],
    ...overrides,
  };
}

// Marriott Marquis — 3 sources, same physical property
const MARRIOTT_AMADEUS = makeProperty({
  source: { sourceId: 'amadeus', sourcePropertyId: 'AM-001' },
  propertyName: 'Marriott Marquis Times Square',
  address: { line1: '1535 Broadway', city: 'New York', stateProvince: 'NY', postalCode: '10036', countryCode: 'US' },
  coordinates: { latitude: 40.7580, longitude: -73.9855 },
  chainCode: 'MC',
  starRating: 4,
});

const MARRIOTT_HOTELBEDS = makeProperty({
  source: { sourceId: 'hotelbeds', sourcePropertyId: 'HB-87234' },
  propertyName: 'New York Marriott Marquis',
  address: { line1: '1535 Broadway Ave', city: 'New York', stateProvince: 'NY', postalCode: '10036', countryCode: 'US' },
  coordinates: { latitude: 40.7581, longitude: -73.9856 },
  chainCode: 'MC',
  starRating: 4,
});

const MARRIOTT_DUFFEL = makeProperty({
  source: { sourceId: 'duffel', sourcePropertyId: 'DUF-NYC-001' },
  propertyName: 'Marriott Marquis New York Times Square',
  address: { line1: '1535 Broadway', city: 'New York', stateProvince: 'NY', postalCode: '10036', countryCode: 'US' },
  coordinates: { latitude: 40.7579, longitude: -73.9854 },
  chainCode: 'MC',
  starRating: 4,
});

// Hilton Midtown — 2 sources
const HILTON_AMADEUS = makeProperty({
  source: { sourceId: 'amadeus', sourcePropertyId: 'AM-002' },
  propertyName: 'Hilton Midtown Manhattan',
  address: { line1: '1335 Avenue of the Americas', city: 'New York', stateProvince: 'NY', postalCode: '10019', countryCode: 'US' },
  coordinates: { latitude: 40.7624, longitude: -73.9790 },
  chainCode: 'HH',
  starRating: 4,
});

const HILTON_HOTELBEDS = makeProperty({
  source: { sourceId: 'hotelbeds', sourcePropertyId: 'HB-65891' },
  propertyName: 'Hilton New York Midtown',
  address: { line1: '1335 6th Ave', city: 'New York', stateProvince: 'NY', postalCode: '10019', countryCode: 'US' },
  coordinates: { latitude: 40.7625, longitude: -73.9791 },
  chainCode: 'HH',
  starRating: 4,
});

// Unique property — no duplicates
const POD51 = makeProperty({
  source: { sourceId: 'duffel', sourcePropertyId: 'DUF-NYC-004' },
  propertyName: 'Pod 51 Hotel',
  address: { line1: '230 East 51st Street', city: 'New York', stateProvince: 'NY', postalCode: '10022', countryCode: 'US' },
  coordinates: { latitude: 40.7557, longitude: -73.9685 },
  starRating: 3,
});

// Different chain, same city — must NOT be merged with Marriott
const HYATT_AMADEUS = makeProperty({
  source: { sourceId: 'amadeus', sourcePropertyId: 'AM-003' },
  propertyName: 'Hyatt Grand Central New York',
  address: { line1: '109 East 42nd Street', city: 'New York', stateProvince: 'NY', postalCode: '10017', countryCode: 'US' },
  coordinates: { latitude: 40.7527, longitude: -73.9772 },
  chainCode: 'HY',
  starRating: 4,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent 20.2 — Property Deduplication', () => {
  let agent: PropertyDeduplicationAgent;

  beforeAll(async () => {
    agent = new PropertyDeduplicationAgent();
    await agent.initialize();
  });

  afterAll(() => {
    agent.destroy();
  });

  describe('Core deduplication', () => {
    it('merges obvious duplicates (same chain + similar name + within 250m)', async () => {
      const result = await agent.execute({
        data: {
          properties: [MARRIOTT_AMADEUS, MARRIOTT_HOTELBEDS, MARRIOTT_DUFFEL],
        },
      });

      // 3 sources of the same property → 1 canonical
      expect(result.data.canonical).toHaveLength(1);
      expect(result.data.canonical[0]!.sources).toHaveLength(3);
      expect(result.data.stats.inputCount).toBe(3);
      expect(result.data.stats.outputCount).toBe(1);
    });

    it('keeps separate properties that are different chains', async () => {
      const result = await agent.execute({
        data: {
          properties: [MARRIOTT_AMADEUS, HYATT_AMADEUS],
        },
      });

      expect(result.data.canonical).toHaveLength(2);
      expect(result.data.stats.separated).toBe(2);
    });

    it('handles mixed: some duplicates, some unique', async () => {
      const result = await agent.execute({
        data: {
          properties: [
            MARRIOTT_AMADEUS, MARRIOTT_HOTELBEDS,
            HILTON_AMADEUS, HILTON_HOTELBEDS,
            POD51,
            HYATT_AMADEUS,
          ],
        },
      });

      // Marriott: 2→1, Hilton: 2→1, Pod51: 1→1, Hyatt: 1→1 = 4 canonical
      expect(result.data.canonical).toHaveLength(4);
      expect(result.data.stats.inputCount).toBe(6);
      expect(result.data.stats.outputCount).toBe(4);
    });

    it('returns unmatched properties as-is (never silently dropped)', async () => {
      const result = await agent.execute({
        data: { properties: [POD51] },
      });

      expect(result.data.canonical).toHaveLength(1);
      expect(result.data.canonical[0]!.propertyName).toBe('Pod 51 Hotel');
      expect(result.data.canonical[0]!.sources).toHaveLength(1);
    });

    it('preserves all source results in canonical property', async () => {
      const result = await agent.execute({
        data: { properties: [MARRIOTT_AMADEUS, MARRIOTT_HOTELBEDS] },
      });

      expect(result.data.canonical[0]!.sourceResults).toHaveLength(2);
    });
  });

  describe('Confidence and merge decisions', () => {
    it('returns high confidence for obvious duplicates', async () => {
      const result = await agent.execute({
        data: { properties: [MARRIOTT_AMADEUS, MARRIOTT_HOTELBEDS] },
      });

      expect(result.data.canonical[0]!.mergeConfidence).toBeGreaterThan(0.8);
    });

    it('includes merge log with score breakdowns', async () => {
      const result = await agent.execute({
        data: { properties: [MARRIOTT_AMADEUS, MARRIOTT_HOTELBEDS, POD51] },
      });

      expect(result.data.mergeLog.length).toBeGreaterThan(0);
      const log = result.data.mergeLog[0]!;
      expect(log.scoreBreakdown).toBeDefined();
      expect(log.scoreBreakdown.name).toBeDefined();
      expect(log.scoreBreakdown.address).toBeDefined();
      expect(log.scoreBreakdown.coordinates).toBeDefined();
      expect(log.scoreBreakdown.chainCode).toBeDefined();
      expect(log.scoreBreakdown.starRating).toBeDefined();
      expect(log.scoreBreakdown.weighted).toBeDefined();
    });

    it('generates canonical IDs', async () => {
      const result = await agent.execute({
        data: { properties: [MARRIOTT_AMADEUS, POD51] },
      });

      for (const c of result.data.canonical) {
        expect(c.canonicalId).toBeDefined();
        expect(c.canonicalId.startsWith('otaip-htl-')).toBe(true);
      }
    });
  });

  describe('Edge cases', () => {
    it('handles empty input', async () => {
      const result = await agent.execute({
        data: { properties: [] },
      });

      expect(result.data.canonical).toHaveLength(0);
      expect(result.data.stats.inputCount).toBe(0);
    });

    it('handles single property', async () => {
      const result = await agent.execute({
        data: { properties: [MARRIOTT_AMADEUS] },
      });

      expect(result.data.canonical).toHaveLength(1);
      expect(result.data.stats.outputCount).toBe(1);
    });

    it('handles same chain, two properties in same city (different locations)', async () => {
      // Two Marriott properties in NYC but different physical locations (~3km apart)
      const marriottTimesSquare = MARRIOTT_AMADEUS;
      const marriottDowntown = makeProperty({
        source: { sourceId: 'amadeus', sourcePropertyId: 'AM-099' },
        propertyName: 'Marriott Downtown Manhattan',
        address: { line1: '85 West Street', city: 'New York', stateProvince: 'NY', postalCode: '10006', countryCode: 'US' },
        coordinates: { latitude: 40.7095, longitude: -74.0145 }, // Downtown, ~5km from Times Square
        chainCode: 'MC',
        starRating: 4,
      });

      const result = await agent.execute({
        data: { properties: [marriottTimesSquare, marriottDowntown] },
      });

      // Should be 2 separate properties despite same chain
      expect(result.data.canonical).toHaveLength(2);
    });
  });

  describe('Input validation', () => {
    it('rejects invalid thresholds (autoMerge <= review)', async () => {
      await expect(
        agent.execute({
          data: {
            properties: [MARRIOTT_AMADEUS],
            thresholds: { autoMerge: 0.5, review: 0.8 },
          },
        }),
      ).rejects.toThrow('thresholds');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('20.2');
      expect(agent.name).toBe('Property Deduplication');
      expect(agent.version).toBe('0.1.0');
    });

    it('throws when not initialized', async () => {
      const uninit = new PropertyDeduplicationAgent();
      await expect(
        uninit.execute({ data: { properties: [] } }),
      ).rejects.toThrow('not been initialized');
    });

    it('reports healthy status', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('includes metadata in output', async () => {
      const result = await agent.execute({ data: { properties: [MARRIOTT_AMADEUS] } });
      expect(result.metadata).toBeDefined();
      expect(result.metadata!['agent_id']).toBe('20.2');
    });
  });
});
