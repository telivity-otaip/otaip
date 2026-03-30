/**
 * Availability Search — Unit Tests
 *
 * Agent 1.1: Queries distribution adapters, normalizes, deduplicates, filters, sorts.
 * Uses MockDuffelAdapter for realistic test data.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AvailabilitySearch } from '../index.js';
import { MockDuffelAdapter } from '@otaip/adapter-duffel';
import type { DistributionAdapter, SearchRequest, SearchResponse } from '@otaip/core';

let adapter: MockDuffelAdapter;
let agent: AvailabilitySearch;

beforeAll(async () => {
  adapter = new MockDuffelAdapter();
  agent = new AvailabilitySearch([adapter]);
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

describe('Availability Search', () => {
  describe('Basic search functionality', () => {
    it('returns offers for a known route (JFK-LAX)', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
        },
      });

      expect(result.data.offers.length).toBeGreaterThan(0);
      expect(result.data.total_raw_offers).toBeGreaterThan(0);
      expect(result.data.source_status.length).toBe(1);
      expect(result.data.source_status[0]!.success).toBe(true);
    });

    it('returns empty offers for an unknown route', async () => {
      const result = await agent.execute({
        data: {
          origin: 'XXX',
          destination: 'YYY',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
        },
      });

      expect(result.data.offers.length).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('returns LHR-CDG offers', async () => {
      const result = await agent.execute({
        data: {
          origin: 'LHR',
          destination: 'CDG',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
        },
      });

      expect(result.data.offers.length).toBeGreaterThan(0);
      expect(result.data.offers[0]!.itinerary.segments[0]!.carrier).toBe('BA');
    });

    it('returns SFO-NRT offers', async () => {
      const result = await agent.execute({
        data: {
          origin: 'SFO',
          destination: 'NRT',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
        },
      });

      expect(result.data.offers.length).toBeGreaterThan(0);
      expect(result.data.offers[0]!.itinerary.segments[0]!.carrier).toBe('NH');
    });
  });

  describe('Cabin class filtering', () => {
    it('filters to business class only', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          cabin_class: 'business',
        },
      });

      expect(result.data.offers.length).toBe(1);
      expect(result.data.offers[0]!.itinerary.segments[0]!.cabin_class).toBe('business');
    });

    it('filters to economy class', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          cabin_class: 'economy',
        },
      });

      // Should have direct + connecting economy offers
      expect(result.data.offers.length).toBeGreaterThanOrEqual(2);
      for (const offer of result.data.offers) {
        expect(offer.itinerary.segments.some((s) => s.cabin_class === 'economy')).toBe(true);
      }
    });
  });

  describe('Direct only filtering', () => {
    it('filters to direct flights only', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          direct_only: true,
        },
      });

      for (const offer of result.data.offers) {
        expect(offer.itinerary.connection_count).toBe(0);
      }
    });
  });

  describe('Max connections filtering', () => {
    it('respects max_connections=0 (same as direct_only)', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          max_connections: 0,
        },
      });

      for (const offer of result.data.offers) {
        expect(offer.itinerary.connection_count).toBe(0);
      }
    });

    it('max_connections=1 includes connecting flights', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          max_connections: 1,
        },
      });

      expect(result.data.offers.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Sorting', () => {
    it('sorts by price ascending (default)', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
        },
      });

      for (let i = 1; i < result.data.offers.length; i++) {
        expect(result.data.offers[i]!.price.total).toBeGreaterThanOrEqual(
          result.data.offers[i - 1]!.price.total,
        );
      }
    });

    it('sorts by price descending', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          sort_by: 'price',
          sort_order: 'desc',
        },
      });

      for (let i = 1; i < result.data.offers.length; i++) {
        expect(result.data.offers[i]!.price.total).toBeLessThanOrEqual(
          result.data.offers[i - 1]!.price.total,
        );
      }
    });

    it('sorts by duration ascending', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          sort_by: 'duration',
        },
      });

      for (let i = 1; i < result.data.offers.length; i++) {
        expect(result.data.offers[i]!.itinerary.total_duration_minutes).toBeGreaterThanOrEqual(
          result.data.offers[i - 1]!.itinerary.total_duration_minutes,
        );
      }
    });

    it('sorts by connections ascending', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          sort_by: 'connections',
        },
      });

      for (let i = 1; i < result.data.offers.length; i++) {
        expect(result.data.offers[i]!.itinerary.connection_count).toBeGreaterThanOrEqual(
          result.data.offers[i - 1]!.itinerary.connection_count,
        );
      }
    });
  });

  describe('Truncation / max_results', () => {
    it('truncates to max_results', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          max_results: 1,
        },
      });

      expect(result.data.offers.length).toBe(1);
      expect(result.data.truncated).toBe(true);
    });

    it('does not truncate when max_results >= offer count', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          max_results: 100,
        },
      });

      expect(result.data.truncated).toBe(false);
    });
  });

  describe('Deduplication', () => {
    it('deduplicates identical offers from multiple adapters', async () => {
      // Create two adapters returning the same data
      const adapter2 = new MockDuffelAdapter();
      const dupeAgent = new AvailabilitySearch([adapter, adapter2]);
      await dupeAgent.initialize();

      const result = await dupeAgent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
        },
      });

      // Raw should be double, but deduped should be same as single adapter
      expect(result.data.total_raw_offers).toBeGreaterThan(result.data.offers.length);
      dupeAgent.destroy();
    });
  });

  describe('Multi-adapter source status', () => {
    it('reports status for each adapter', async () => {
      const adapter2 = new MockDuffelAdapter();
      const multiAgent = new AvailabilitySearch([adapter, adapter2]);
      await multiAgent.initialize();

      const result = await multiAgent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
        },
      });

      expect(result.data.source_status.length).toBe(2);
      for (const status of result.data.source_status) {
        expect(status.success).toBe(true);
        expect(status.response_time_ms).toBeGreaterThanOrEqual(0);
      }
      multiAgent.destroy();
    });
  });

  describe('Adapter failure handling', () => {
    it('handles adapter failure gracefully', async () => {
      const failAdapter = new MockDuffelAdapter();
      failAdapter.setAvailable(false);

      // Need a fresh agent since the failing adapter won't be added during init
      // Instead, let's use a custom adapter that fails during search
      const errorAdapter: DistributionAdapter = {
        name: 'failing-adapter',
        async search(_req: SearchRequest): Promise<SearchResponse> {
          throw new Error('Connection refused');
        },
        async isAvailable(): Promise<boolean> {
          return true;
        },
      };

      const failAgent = new AvailabilitySearch([adapter, errorAdapter]);
      await failAgent.initialize();

      const result = await failAgent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
        },
      });

      // Should still have results from the working adapter
      expect(result.data.offers.length).toBeGreaterThan(0);

      // Should report the failure
      const failedStatus = result.data.source_status.find((s) => s.source === 'failing-adapter');
      expect(failedStatus).toBeDefined();
      expect(failedStatus!.success).toBe(false);
      expect(failedStatus!.error).toContain('Connection refused');

      // Should have a warning
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('failing-adapter'))).toBe(true);

      failAgent.destroy();
    });
  });

  describe('Source filtering', () => {
    it('filters to specific sources', async () => {
      const adapter2: DistributionAdapter = {
        name: 'other-adapter',
        async search(): Promise<SearchResponse> {
          return { offers: [] };
        },
        async isAvailable(): Promise<boolean> {
          return true;
        },
      };

      const multiAgent = new AvailabilitySearch([adapter, adapter2]);
      await multiAgent.initialize();

      const result = await multiAgent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          sources: ['duffel'],
        },
      });

      // Only duffel should be queried
      expect(result.data.source_status.length).toBe(1);
      expect(result.data.source_status[0]!.source).toBe('duffel');

      multiAgent.destroy();
    });
  });

  describe('Input validation', () => {
    it('rejects empty origin', async () => {
      await expect(
        agent.execute({
          data: {
            origin: '',
            destination: 'LAX',
            departure_date: '2025-06-15',
            passengers: [{ type: 'ADT', count: 1 }],
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects empty destination', async () => {
      await expect(
        agent.execute({
          data: {
            origin: 'JFK',
            destination: '',
            departure_date: '2025-06-15',
            passengers: [{ type: 'ADT', count: 1 }],
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects same origin and destination', async () => {
      await expect(
        agent.execute({
          data: {
            origin: 'JFK',
            destination: 'JFK',
            departure_date: '2025-06-15',
            passengers: [{ type: 'ADT', count: 1 }],
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid departure_date format', async () => {
      await expect(
        agent.execute({
          data: {
            origin: 'JFK',
            destination: 'LAX',
            departure_date: 'June 15, 2025',
            passengers: [{ type: 'ADT', count: 1 }],
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects empty passengers array', async () => {
      await expect(
        agent.execute({
          data: {
            origin: 'JFK',
            destination: 'LAX',
            departure_date: '2025-06-15',
            passengers: [],
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid cabin_class', async () => {
      await expect(
        agent.execute({
          data: {
            origin: 'JFK',
            destination: 'LAX',
            departure_date: '2025-06-15',
            passengers: [{ type: 'ADT', count: 1 }],
            cabin_class: 'luxury' as 'economy',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid sort_by', async () => {
      await expect(
        agent.execute({
          data: {
            origin: 'JFK',
            destination: 'LAX',
            departure_date: '2025-06-15',
            passengers: [{ type: 'ADT', count: 1 }],
            sort_by: 'invalid' as 'price',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects max_connections > 5', async () => {
      await expect(
        agent.execute({
          data: {
            origin: 'JFK',
            destination: 'LAX',
            departure_date: '2025-06-15',
            passengers: [{ type: 'ADT', count: 1 }],
            max_connections: 6,
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects max_results > 200', async () => {
      await expect(
        agent.execute({
          data: {
            origin: 'JFK',
            destination: 'LAX',
            departure_date: '2025-06-15',
            passengers: [{ type: 'ADT', count: 1 }],
            max_results: 201,
          },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('1.1');
      expect(agent.name).toBe('Availability Search');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy status', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
        },
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata!['agent_id']).toBe('1.1');
      expect(result.metadata!['agent_version']).toBe('0.1.0');
    });

    it('throws when not initialized', async () => {
      const uninitAgent = new AvailabilitySearch([adapter]);
      await expect(
        uninitAgent.execute({
          data: {
            origin: 'JFK',
            destination: 'LAX',
            departure_date: '2025-06-15',
            passengers: [{ type: 'ADT', count: 1 }],
          },
        }),
      ).rejects.toThrow('not been initialized');
    });

    it('reports unhealthy when not initialized', async () => {
      const uninitAgent = new AvailabilitySearch([adapter]);
      const health = await uninitAgent.health();
      expect(health.status).toBe('unhealthy');
    });

    it('reports degraded when no adapters available', async () => {
      const noAdapterAgent = new AvailabilitySearch([]);
      await noAdapterAgent.initialize();
      const health = await noAdapterAgent.health();
      expect(health.status).toBe('degraded');
      noAdapterAgent.destroy();
    });
  });
});
