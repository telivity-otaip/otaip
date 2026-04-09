import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HotelSearchAggregatorAgent } from '../index.js';
import type { HotelSourceAdapter } from '../adapters/base-adapter.js';
import type { RawHotelResult } from '../../types/hotel-common.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const VALID_INPUT = {
  destination: 'NYC',
  checkIn: '2025-06-15',
  checkOut: '2025-06-17',
  rooms: 1,
  adults: 2,
};

/** Adapter that always delays beyond a timeout for testing partial results */
class SlowAdapter implements HotelSourceAdapter {
  readonly adapterId = 'slow';
  readonly adapterName = 'Slow Test Adapter';

  async searchHotels(): Promise<RawHotelResult[]> {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    return [];
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/** Adapter that always throws for testing error handling */
class ErrorAdapter implements HotelSourceAdapter {
  readonly adapterId = 'error';
  readonly adapterName = 'Error Test Adapter';

  async searchHotels(): Promise<RawHotelResult[]> {
    throw new Error('Connection refused');
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}

/** Fast adapter returning known results */
class FastMockAdapter implements HotelSourceAdapter {
  readonly adapterId = 'fast-mock';
  readonly adapterName = 'Fast Mock Adapter';

  async searchHotels(): Promise<RawHotelResult[]> {
    return [
      {
        source: { sourceId: 'fast-mock', sourcePropertyId: 'FM-001' },
        propertyName: 'Fast Mock Hotel',
        address: { line1: '123 Test St', city: 'New York', countryCode: 'US' },
        coordinates: { latitude: 40.75, longitude: -73.98 },
        starRating: 3,
        amenities: ['WiFi'],
        roomTypes: [{ roomTypeId: 'FM-001-STD', description: 'Standard Room', maxOccupancy: 2 }],
        rates: [
          {
            rateId: 'FM-001-R1',
            roomTypeId: 'FM-001-STD',
            nightlyRate: '100.00',
            totalRate: '200.00',
            currency: 'USD',
            rateType: 'bar',
            paymentModel: 'pay_at_property',
            cancellationPolicy: {
              refundable: true,
              deadlines: [{ hoursBeforeCheckin: 24, penaltyType: 'nights', penaltyValue: 1 }],
              freeCancel24hrBooking: true,
            },
          },
        ],
        photos: [],
      },
    ];
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent 20.1 — Hotel Search Aggregator', () => {
  let agent: HotelSearchAggregatorAgent;

  beforeAll(async () => {
    agent = new HotelSearchAggregatorAgent();
    await agent.initialize();
  });

  afterAll(() => {
    agent.destroy();
  });

  describe('Core search functionality', () => {
    it('returns results from multiple mock adapters in parallel', async () => {
      const result = await agent.execute({ data: VALID_INPUT });

      expect(result.data.properties.length).toBeGreaterThan(0);
      expect(result.data.adapterResults.length).toBe(3); // amadeus, hotelbeds, duffel
      expect(result.data.totalResults).toBe(result.data.properties.length);
      expect(result.data.searchId).toBeDefined();
    });

    it('returns properties from each adapter', async () => {
      const result = await agent.execute({ data: VALID_INPUT });
      const sourceIds = new Set(result.data.properties.map((p) => p.source.sourceId));

      expect(sourceIds.has('amadeus')).toBe(true);
      expect(sourceIds.has('hotelbeds')).toBe(true);
      expect(sourceIds.has('duffel')).toBe(true);
    });

    it('returns empty results for unknown destination', async () => {
      const result = await agent.execute({
        data: { ...VALID_INPUT, destination: 'Atlantis' },
      });

      expect(result.data.properties).toHaveLength(0);
      expect(result.data.totalResults).toBe(0);
      expect(result.data.partialResults).toBe(false);
    });

    it('filters by specific adapter IDs', async () => {
      const result = await agent.execute({
        data: { ...VALID_INPUT, adapterIds: ['amadeus'] },
      });

      const sourceIds = new Set(result.data.properties.map((p) => p.source.sourceId));
      expect(sourceIds.has('amadeus')).toBe(true);
      expect(sourceIds.has('hotelbeds')).toBe(false);
    });
  });

  describe('Timeout and error handling', () => {
    it('handles adapter timeout gracefully and returns partial results', async () => {
      const agentWithSlow = new HotelSearchAggregatorAgent({
        adapters: [new FastMockAdapter(), new SlowAdapter()],
      });
      await agentWithSlow.initialize();

      const result = await agentWithSlow.execute({
        data: { ...VALID_INPUT, timeoutMs: 500 },
      });

      expect(result.data.partialResults).toBe(true);
      // Fast adapter results should be present
      expect(result.data.properties.length).toBeGreaterThan(0);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('timed out'))).toBe(true);

      agentWithSlow.destroy();
    });

    it('handles adapter error and returns results from other adapters', async () => {
      const agentWithError = new HotelSearchAggregatorAgent({
        adapters: [new FastMockAdapter(), new ErrorAdapter()],
      });
      await agentWithError.initialize();

      const result = await agentWithError.execute({
        data: VALID_INPUT,
      });

      expect(result.data.partialResults).toBe(true);
      expect(result.data.properties.length).toBeGreaterThan(0);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('Connection refused'))).toBe(true);

      agentWithError.destroy();
    });

    it('returns empty results when no adapters configured', async () => {
      const emptyAgent = new HotelSearchAggregatorAgent({ adapters: [] });
      await emptyAgent.initialize();

      const result = await emptyAgent.execute({ data: VALID_INPUT });

      expect(result.data.properties).toHaveLength(0);
      expect(result.data.adapterResults).toHaveLength(0);
      expect(result.data.partialResults).toBe(false);

      emptyAgent.destroy();
    });
  });

  describe('Input validation', () => {
    it('rejects missing destination', async () => {
      await expect(agent.execute({ data: { ...VALID_INPUT, destination: '' } })).rejects.toThrow(
        'destination',
      );
    });

    it('rejects missing check-in date', async () => {
      await expect(agent.execute({ data: { ...VALID_INPUT, checkIn: '' } })).rejects.toThrow(
        'checkIn',
      );
    });

    it('rejects check-out before check-in', async () => {
      await expect(
        agent.execute({ data: { ...VALID_INPUT, checkIn: '2025-06-17', checkOut: '2025-06-15' } }),
      ).rejects.toThrow('checkOut');
    });

    it('rejects zero rooms', async () => {
      await expect(agent.execute({ data: { ...VALID_INPUT, rooms: 0 } })).rejects.toThrow('rooms');
    });

    it('rejects zero adults', async () => {
      await expect(agent.execute({ data: { ...VALID_INPUT, adults: 0 } })).rejects.toThrow(
        'adults',
      );
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('20.1');
      expect(agent.name).toBe('Hotel Search Aggregator');
      expect(agent.version).toBe('0.1.0');
    });

    it('throws when not initialized', async () => {
      const uninit = new HotelSearchAggregatorAgent();
      await expect(uninit.execute({ data: VALID_INPUT })).rejects.toThrow('not been initialized');
    });

    it('reports healthy status after initialization', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('reports unhealthy when not initialized', async () => {
      const uninit = new HotelSearchAggregatorAgent();
      const health = await uninit.health();
      expect(health.status).toBe('unhealthy');
    });

    it('reports degraded when no adapters', async () => {
      const empty = new HotelSearchAggregatorAgent({ adapters: [] });
      await empty.initialize();
      const health = await empty.health();
      expect(health.status).toBe('degraded');
      empty.destroy();
    });

    it('returns confidence of 1.0', async () => {
      const result = await agent.execute({ data: VALID_INPUT });
      expect(result.confidence).toBe(1.0);
    });

    it('includes metadata in output', async () => {
      const result = await agent.execute({ data: VALID_INPUT });
      expect(result.metadata).toBeDefined();
      expect(result.metadata!['agent_id']).toBe('20.1');
      expect(result.metadata!['agent_version']).toBe('0.1.0');
    });
  });
});
