/**
 * Duffel Sandbox End-to-End Test
 *
 * Runs against the real Duffel test/sandbox API.
 * Skipped when DUFFEL_API_KEY is not set.
 *
 * To run:
 *   DUFFEL_API_KEY=duffel_test_... pnpm test -- packages/adapters/duffel/src/__tests__/duffel-e2e
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { DuffelAdapter } from '../duffel-adapter.js';
import type { SearchRequest } from '@otaip/core';

const describeE2E = process.env.DUFFEL_API_KEY ? describe : describe.skip;

describeE2E('Duffel Sandbox E2E', () => {
  let adapter: DuffelAdapter;

  beforeAll(() => {
    adapter = new DuffelAdapter({ apiKey: process.env.DUFFEL_API_KEY! });
  });

  it('is available (health check)', async () => {
    const available = await adapter.isAvailable();
    expect(available).toBe(true);
  });

  it('searches for flights', async () => {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const departureDate = thirtyDaysFromNow.toISOString().split('T')[0]!;

    const request: SearchRequest = {
      segments: [
        {
          origin: 'LHR',
          destination: 'CDG',
          departure_date: departureDate,
        },
      ],
      passengers: {
        adults: 1,
        children: 0,
        infants: 0,
      },
      cabin_class: 'economy',
    };

    const response = await adapter.search(request);
    expect(response.offers.length).toBeGreaterThan(0);

    const offer = response.offers[0]!;
    expect(offer.total_price).toBeDefined();
    expect(offer.currency).toBeDefined();
    expect(offer.itineraries.length).toBeGreaterThan(0);
    expect(offer.itineraries[0]!.segments.length).toBeGreaterThan(0);

    const segment = offer.itineraries[0]!.segments[0]!;
    expect(segment.origin).toBe('LHR');
    expect(segment.destination).toBe('CDG');
    expect(segment.departure_time).toBeDefined();
    expect(segment.arrival_time).toBeDefined();
  });

  it('prices an offer', async () => {
    // First search
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const departureDate = thirtyDaysFromNow.toISOString().split('T')[0]!;

    const searchResponse = await adapter.search({
      segments: [{ origin: 'LHR', destination: 'CDG', departure_date: departureDate }],
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin_class: 'economy',
    });

    expect(searchResponse.offers.length).toBeGreaterThan(0);

    // Then price the cheapest offer
    if (adapter.price) {
      const cheapest = searchResponse.offers[0]!;
      const priceResponse = await adapter.price({
        offer_id: cheapest.id,
        passengers: [
          {
            type: 'adult',
            given_name: 'Test',
            family_name: 'Passenger',
            date_of_birth: '1990-01-01',
            gender: 'male',
          },
        ],
      });
      expect(priceResponse.total_price).toBeDefined();
      expect(priceResponse.currency).toBeDefined();
    }
  });
});
