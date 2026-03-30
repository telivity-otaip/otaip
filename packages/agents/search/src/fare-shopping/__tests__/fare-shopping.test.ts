/**
 * Fare Shopping — Unit Tests
 *
 * Agent 1.4: Multi-source fare comparison, fare basis decoding,
 * class mapping, branded fare family grouping, passenger type pricing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FareShopping } from '../index.js';
import { MockDuffelAdapter } from '@otaip/adapter-duffel';
import {
  classifyFareFamily,
  decodeFareBasis,
  mapClassOfService,
  calculatePassengerPricing,
} from '../fare-classifier.js';
import type { SearchOffer } from '@otaip/core';

let adapter: MockDuffelAdapter;
let agent: FareShopping;

beforeAll(async () => {
  adapter = new MockDuffelAdapter();
  agent = new FareShopping([adapter]);
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

describe('Fare Shopping', () => {
  describe('Basic fare retrieval', () => {
    it('returns fares for JFK-LAX', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
        },
      });

      expect(result.data.fares.length).toBeGreaterThan(0);
      expect(result.data.total_fares).toBeGreaterThan(0);
      expect(result.data.sources_queried).toContain('duffel');
    });

    it('returns fares sorted by price ascending', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
        },
      });

      for (let i = 1; i < result.data.fares.length; i++) {
        expect(result.data.fares[i]!.offer.price.total).toBeGreaterThanOrEqual(
          result.data.fares[i - 1]!.offer.price.total,
        );
      }
    });

    it('returns empty for unknown route', async () => {
      const result = await agent.execute({
        data: {
          origin: 'XXX',
          destination: 'YYY',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
        },
      });

      expect(result.data.fares.length).toBe(0);
      expect(result.confidence).toBe(0);
    });
  });

  describe('Fare basis decoding', () => {
    it('decodes fare basis codes when decode_fare_basis=true', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          decode_fare_basis: true,
        },
      });

      const fareWithBasis = result.data.fares.find((f) => f.fare_basis_decoded !== null);
      expect(fareWithBasis).toBeDefined();
      expect(fareWithBasis!.fare_basis_decoded!.length).toBeGreaterThan(0);
      expect(fareWithBasis!.fare_basis_decoded![0]!.cabin_class).toBeTruthy();
    });

    it('skips fare basis decoding when decode_fare_basis=false', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          decode_fare_basis: false,
        },
      });

      for (const fare of result.data.fares) {
        expect(fare.fare_basis_decoded).toBeNull();
      }
    });
  });

  describe('Fare family classification', () => {
    it('classifies Y26NR as basic', () => {
      expect(classifyFareFamily('Y26NR')).toBe('basic');
    });

    it('classifies J as premium', () => {
      expect(classifyFareFamily('J')).toBe('premium');
    });

    it('classifies Y as flex', () => {
      expect(classifyFareFamily('Y')).toBe('flex');
    });

    it('classifies B14NR as basic', () => {
      expect(classifyFareFamily('B14NR')).toBe('basic');
    });

    it('classifies V14NR as basic (deep discount)', () => {
      expect(classifyFareFamily('V14NR')).toBe('basic');
    });

    it('classifies YOW as flex (Y-class one-way)', () => {
      expect(classifyFareFamily('YOW')).toBe('flex');
    });

    it('returns unknown for empty string', () => {
      expect(classifyFareFamily('')).toBe('unknown');
    });
  });

  describe('Fare basis decoding (unit)', () => {
    it('decodes Y26NR correctly', () => {
      const result = decodeFareBasis('Y26NR');
      expect(result.cabin_class).toBe('economy');
      expect(result.refundable).toBe(false);
      expect(result.advance_purchase_days).toBe(26);
      expect(result.fare_family).toBe('basic');
    });

    it('decodes J correctly', () => {
      const result = decodeFareBasis('J');
      expect(result.cabin_class).toBe('business');
      expect(result.refundable).toBe(true);
      expect(result.fare_family).toBe('premium');
    });

    it('decodes V14NR correctly', () => {
      const result = decodeFareBasis('V14NR');
      expect(result.cabin_class).toBe('economy');
      expect(result.refundable).toBe(false);
      expect(result.advance_purchase_days).toBe(14);
    });
  });

  describe('Class of service mapping', () => {
    it('maps Y to economy/full', () => {
      const cos = mapClassOfService('Y');
      expect(cos.cabin_class).toBe('economy');
      expect(cos.tier).toBe('full');
    });

    it('maps J to business/full', () => {
      const cos = mapClassOfService('J');
      expect(cos.cabin_class).toBe('business');
      expect(cos.tier).toBe('full');
    });

    it('maps V to economy/deep-discount', () => {
      const cos = mapClassOfService('V');
      expect(cos.cabin_class).toBe('economy');
      expect(cos.tier).toBe('deep-discount');
    });

    it('maps B to economy/standard', () => {
      const cos = mapClassOfService('B');
      expect(cos.cabin_class).toBe('economy');
      expect(cos.tier).toBe('standard');
    });
  });

  describe('Fare family grouping', () => {
    it('groups fares by family when group_by_fare_family=true', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          group_by_fare_family: true,
        },
      });

      expect(result.data.fare_families).not.toBeNull();
      expect(result.data.fare_families!.length).toBeGreaterThan(0);

      for (const group of result.data.fare_families!) {
        expect(group.cheapest_total).toBeLessThanOrEqual(group.most_expensive_total);
        expect(group.offers.length).toBeGreaterThan(0);
      }
    });

    it('returns null fare_families when group_by_fare_family=false', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          group_by_fare_family: false,
        },
      });

      expect(result.data.fare_families).toBeNull();
    });

    it('fare families are sorted by cheapest price', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
        },
      });

      if (result.data.fare_families && result.data.fare_families.length > 1) {
        for (let i = 1; i < result.data.fare_families.length; i++) {
          expect(result.data.fare_families[i]!.cheapest_total).toBeGreaterThanOrEqual(
            result.data.fare_families[i - 1]!.cheapest_total,
          );
        }
      }
    });
  });

  describe('Passenger type pricing', () => {
    it('calculates ADT pricing (full fare)', () => {
      const mockOffer = { price: { total: 300, base_fare: 250, taxes: 50, currency: 'USD' } } as SearchOffer;
      const pricing = calculatePassengerPricing(mockOffer, [{ type: 'ADT', count: 2 }]);

      expect(pricing.length).toBe(1);
      expect(pricing[0]!.type).toBe('ADT');
      expect(pricing[0]!.per_person_total).toBe(300);
      expect(pricing[0]!.subtotal).toBe(600);
    });

    it('calculates CHD pricing (75% of adult)', () => {
      const mockOffer = { price: { total: 400, base_fare: 350, taxes: 50, currency: 'USD' } } as SearchOffer;
      const pricing = calculatePassengerPricing(mockOffer, [{ type: 'CHD', count: 1 }]);

      expect(pricing[0]!.type).toBe('CHD');
      expect(pricing[0]!.per_person_total).toBe(300);
      expect(pricing[0]!.subtotal).toBe(300);
    });

    it('calculates INF pricing (10% of adult)', () => {
      const mockOffer = { price: { total: 1000, base_fare: 900, taxes: 100, currency: 'USD' } } as SearchOffer;
      const pricing = calculatePassengerPricing(mockOffer, [{ type: 'INF', count: 1 }]);

      expect(pricing[0]!.type).toBe('INF');
      expect(pricing[0]!.per_person_total).toBe(100);
      expect(pricing[0]!.subtotal).toBe(100);
    });

    it('handles mixed passenger types', () => {
      const mockOffer = { price: { total: 200, base_fare: 170, taxes: 30, currency: 'USD' } } as SearchOffer;
      const pricing = calculatePassengerPricing(mockOffer, [
        { type: 'ADT', count: 2 },
        { type: 'CHD', count: 1 },
        { type: 'INF', count: 1 },
      ]);

      expect(pricing.length).toBe(3);
      expect(pricing[0]!.subtotal).toBe(400); // 2 ADT × 200
      expect(pricing[1]!.subtotal).toBe(150); // 1 CHD × 150
      expect(pricing[2]!.subtotal).toBe(20);  // 1 INF × 20
    });

    it('includes passenger pricing in fare offers', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [
            { type: 'ADT', count: 2 },
            { type: 'CHD', count: 1 },
          ],
        },
      });

      for (const fare of result.data.fares) {
        expect(fare.passenger_pricing.length).toBe(2);
        const adtPricing = fare.passenger_pricing.find((p) => p.type === 'ADT');
        expect(adtPricing).toBeDefined();
        expect(adtPricing!.count).toBe(2);
      }
    });
  });

  describe('Cabin class filtering', () => {
    it('filters to business class fares', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          departure_date: '2025-06-15',
          passengers: [{ type: 'ADT', count: 1 }],
          cabin_class: 'business',
        },
      });

      expect(result.data.fares.length).toBeGreaterThan(0);
      for (const fare of result.data.fares) {
        expect(fare.offer.itinerary.segments.some((s) => s.cabin_class === 'business')).toBe(true);
      }
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

    it('rejects invalid date', async () => {
      await expect(
        agent.execute({
          data: {
            origin: 'JFK',
            destination: 'LAX',
            departure_date: 'bad-date',
            passengers: [{ type: 'ADT', count: 1 }],
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects empty passengers', async () => {
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
            cabin_class: 'super-first' as 'first',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('1.4');
      expect(agent.name).toBe('Fare Shopping');
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

      expect(result.metadata!['agent_id']).toBe('1.4');
      expect(result.metadata!['agent_version']).toBe('0.1.0');
    });

    it('throws when not initialized', async () => {
      const uninit = new FareShopping([adapter]);
      await expect(
        uninit.execute({
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
      const uninit = new FareShopping([adapter]);
      const health = await uninit.health();
      expect(health.status).toBe('unhealthy');
    });

    it('reports degraded when no adapters', async () => {
      const noAdapterAgent = new FareShopping([]);
      await noAdapterAgent.initialize();
      const health = await noAdapterAgent.health();
      expect(health.status).toBe('degraded');
      noAdapterAgent.destroy();
    });
  });
});
