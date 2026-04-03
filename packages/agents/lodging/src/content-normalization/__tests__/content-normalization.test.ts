import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ContentNormalizationAgent } from '../index.js';
import type { CanonicalProperty } from '../../types/hotel-common.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeCanonical(overrides: Partial<CanonicalProperty>): CanonicalProperty {
  return {
    canonicalId: 'test-001',
    propertyName: 'Test Hotel',
    address: { line1: '123 Test St', city: 'New York', countryCode: 'US' },
    coordinates: { latitude: 40.75, longitude: -73.98 },
    sources: [{ sourceId: 'amadeus', sourcePropertyId: 'AM-001' }],
    sourceResults: [],
    mergeConfidence: 1.0,
    mergeReasoning: 'test',
    reviewRequired: false,
    ...overrides,
  };
}

const PROPERTY_WITH_ROOMS = makeCanonical({
  canonicalId: 'room-test-001',
  sourceResults: [
    {
      source: { sourceId: 'amadeus', sourcePropertyId: 'AM-001' },
      propertyName: 'Test Hotel',
      address: { line1: '123 Test St', city: 'New York', countryCode: 'US' },
      coordinates: { latitude: 40.75, longitude: -73.98 },
      amenities: ['Free WiFi', 'Fitness Center', 'Restaurant', 'Complimentary Breakfast'],
      roomTypes: [
        { roomTypeId: 'R1', code: 'KNG', description: 'Standard King Room', maxOccupancy: 2, bedTypeRaw: 'King' },
        { roomTypeId: 'R2', code: 'KDLX', description: 'Deluxe King Room City View', maxOccupancy: 2, bedTypeRaw: 'King' },
        { roomTypeId: 'R3', code: 'STE', description: 'Junior Suite', maxOccupancy: 3 },
        { roomTypeId: 'R4', code: 'TWN', description: 'Twin Room', maxOccupancy: 2, bedTypeRaw: 'Twin' },
      ],
      rates: [],
      photos: [
        { url: 'https://example.com/exterior.jpg', caption: 'Hotel Exterior', category: 'exterior', width: 1920, height: 1080 },
        { url: 'https://example.com/room.jpg', caption: 'Guest Room', category: 'room', width: 1200, height: 800 },
      ],
    },
  ],
});

const PROPERTY_WITH_AMENITY_SYNONYMS = makeCanonical({
  canonicalId: 'amenity-test-001',
  sourceResults: [
    {
      source: { sourceId: 'amadeus', sourcePropertyId: 'AM-002' },
      propertyName: 'Amenity Test Hotel',
      address: { line1: '456 Test Ave', city: 'New York', countryCode: 'US' },
      coordinates: { latitude: 40.76, longitude: -73.97 },
      amenities: ['Complimentary WiFi', 'Gym', 'Indoor Pool', 'Valet Parking', 'Pet Friendly'],
      roomTypes: [],
      rates: [],
      photos: [],
    },
    {
      source: { sourceId: 'hotelbeds', sourcePropertyId: 'HB-002' },
      propertyName: 'Amenity Test Hotel',
      address: { line1: '456 Test Ave', city: 'New York', countryCode: 'US' },
      coordinates: { latitude: 40.76, longitude: -73.97 },
      amenities: ['Free Internet', 'Fitness Center', 'Swimming Pool', 'Parking'],
      roomTypes: [],
      rates: [],
      photos: [],
    },
  ],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent 4.3 — Content Normalization', () => {
  let agent: ContentNormalizationAgent;

  beforeAll(async () => {
    agent = new ContentNormalizationAgent();
    await agent.initialize();
  });

  afterAll(() => {
    agent.destroy();
  });

  describe('Room type normalization', () => {
    it('maps GDS codes to OTAIP taxonomy', async () => {
      const result = await agent.execute({ data: { properties: [PROPERTY_WITH_ROOMS] } });
      const prop = result.data.properties[0]!;

      expect(prop.normalizedRoomTypes.length).toBeGreaterThan(0);

      // KNG code should map to king bed
      const kingRoom = prop.normalizedRoomTypes.find((r) => r.bedType === 'king');
      expect(kingRoom).toBeDefined();
      expect(kingRoom!.bedCount).toBe(1);
    });

    it('extracts room category from description', async () => {
      const result = await agent.execute({ data: { properties: [PROPERTY_WITH_ROOMS] } });
      const prop = result.data.properties[0]!;

      const deluxe = prop.normalizedRoomTypes.find((r) => r.category === 'deluxe');
      expect(deluxe).toBeDefined();

      const suite = prop.normalizedRoomTypes.find((r) =>
        r.category === 'junior_suite' || r.category === 'suite',
      );
      expect(suite).toBeDefined();
    });

    it('extracts view type from description', async () => {
      const result = await agent.execute({ data: { properties: [PROPERTY_WITH_ROOMS] } });
      const prop = result.data.properties[0]!;

      const cityView = prop.normalizedRoomTypes.find((r) => r.viewType === 'city');
      expect(cityView).toBeDefined();
    });

    it('maps twin room code correctly', async () => {
      const result = await agent.execute({ data: { properties: [PROPERTY_WITH_ROOMS] } });
      const prop = result.data.properties[0]!;

      const twin = prop.normalizedRoomTypes.find((r) => r.bedType === 'twin');
      expect(twin).toBeDefined();
      expect(twin!.bedCount).toBe(2);
    });

    it('generates OTAIP room IDs', async () => {
      const result = await agent.execute({ data: { properties: [PROPERTY_WITH_ROOMS] } });
      const prop = result.data.properties[0]!;

      for (const room of prop.normalizedRoomTypes) {
        expect(room.otaipRoomId).toBeDefined();
        expect(room.otaipRoomId.startsWith('otaip-rm-')).toBe(true);
      }
    });
  });

  describe('Amenity normalization', () => {
    it('normalizes amenity synonyms to canonical IDs', async () => {
      const result = await agent.execute({ data: { properties: [PROPERTY_WITH_AMENITY_SYNONYMS] } });
      const prop = result.data.properties[0]!;

      const wifiAmenity = prop.normalizedAmenities.find((a) => a.amenityId === 'wifi_free');
      expect(wifiAmenity).toBeDefined();
      expect(wifiAmenity!.included).toBe(true);
    });

    it('deduplicates amenities across sources', async () => {
      const result = await agent.execute({ data: { properties: [PROPERTY_WITH_AMENITY_SYNONYMS] } });
      const prop = result.data.properties[0]!;

      // "Complimentary WiFi" and "Free Internet" should both map to wifi_free
      const wifiEntries = prop.normalizedAmenities.filter((a) => a.amenityId === 'wifi_free');
      expect(wifiEntries).toHaveLength(1);

      // "Gym" and "Fitness Center" should both map to gym
      const gymEntries = prop.normalizedAmenities.filter((a) => a.amenityId === 'gym');
      expect(gymEntries).toHaveLength(1);
    });

    it('handles missing/incomplete amenity data', async () => {
      const emptyAmenities = makeCanonical({
        canonicalId: 'empty-amenity',
        sourceResults: [{
          source: { sourceId: 'test', sourcePropertyId: 'T-001' },
          propertyName: 'Empty Hotel',
          address: { line1: '1 St', city: 'NYC', countryCode: 'US' },
          coordinates: { latitude: 40.75, longitude: -73.98 },
          amenities: [],
          roomTypes: [],
          rates: [],
          photos: [],
        }],
      });

      const result = await agent.execute({ data: { properties: [emptyAmenities] } });
      expect(result.data.properties[0]!.normalizedAmenities).toHaveLength(0);
    });
  });

  describe('Photo scoring', () => {
    it('scores and categorizes photos', async () => {
      const result = await agent.execute({ data: { properties: [PROPERTY_WITH_ROOMS] } });
      const prop = result.data.properties[0]!;

      expect(prop.scoredPhotos.length).toBe(2);
      expect(prop.scoredPhotos.some((p) => p.category === 'exterior')).toBe(true);
    });

    it('assigns primary photo (exterior preferred)', async () => {
      const result = await agent.execute({ data: { properties: [PROPERTY_WITH_ROOMS] } });
      const prop = result.data.properties[0]!;

      const primary = prop.scoredPhotos.find((p) => p.isPrimary);
      expect(primary).toBeDefined();
      expect(primary!.category).toBe('exterior');
    });
  });

  describe('Statistics', () => {
    it('reports mapping statistics', async () => {
      const result = await agent.execute({ data: { properties: [PROPERTY_WITH_ROOMS] } });

      expect(result.data.stats.totalProperties).toBe(1);
      expect(result.data.stats.totalRoomTypesMapped).toBeGreaterThan(0);
      expect(result.data.stats.totalAmenitiesMapped).toBeGreaterThan(0);
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('4.3');
      expect(agent.name).toBe('Hotel Content Normalization');
      expect(agent.version).toBe('0.1.0');
    });

    it('throws when not initialized', async () => {
      const uninit = new ContentNormalizationAgent();
      await expect(
        uninit.execute({ data: { properties: [] } }),
      ).rejects.toThrow('not been initialized');
    });

    it('reports healthy status', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });
  });
});
