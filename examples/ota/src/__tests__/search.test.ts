/**
 * Integration tests for the OTAIP Reference OTA.
 *
 * Uses Fastify inject (no real HTTP) with MockDuffelAdapter.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MockDuffelAdapter } from '@otaip/adapter-duffel';
import { buildApp } from '../server.js';

let app: FastifyInstance;
const mockAdapter = new MockDuffelAdapter();

beforeAll(async () => {
  app = await buildApp({ adapter: mockAdapter, initResolver: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// Search tests
// ---------------------------------------------------------------------------

describe('POST /api/search', () => {
  it('returns offers for a valid search', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.offers).toBeDefined();
    expect(body.offers.length).toBeGreaterThan(0);
    expect(body.totalFound).toBeGreaterThan(0);
  });

  it('returns error for invalid airport code format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFKX',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.details).toContain('origin must be a 3-letter IATA airport code');
  });

  it('returns 400 for missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        // missing destination, date, passengers
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.details.length).toBeGreaterThanOrEqual(2);
  });

  it('returns the correct number of offers for JFK-LAX', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // MockDuffelAdapter has 3 JFK-LAX offers (direct economy, connecting, business)
    expect(body.totalFound).toBe(3);
    expect(body.offers).toHaveLength(3);
  });

  it('includes source attribution', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
      },
    });

    const body = res.json();
    expect(body.sources).toBeDefined();
    expect(body.sources).toContain('duffel');
  });

  it('results are sorted by price by default', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
      },
    });

    const body = res.json();
    const prices = body.offers.map(
      (o: { price: { total: number } }) => o.price.total,
    );

    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]!);
    }
  });

  it('search with cabinClass filter works', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
        cabinClass: 'business',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // MockDuffelAdapter has 1 business class JFK-LAX offer
    expect(body.offers.length).toBe(1);
    expect(body.offers[0].itinerary.segments[0].cabin_class).toBe('business');
  });
});

// ---------------------------------------------------------------------------
// Offer tests
// ---------------------------------------------------------------------------

describe('GET /api/offers/:id', () => {
  it('returns offer details for a valid ID after search', async () => {
    // First, search to populate the cache
    await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/offers/mock-duffel-jfk-lax-1',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.offer).toBeDefined();
    expect(body.offer.offer_id).toBe('mock-duffel-jfk-lax-1');
    expect(body.fareRules).toBeDefined();
  });

  it('returns 404 for an unknown offer ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/offers/nonexistent-offer-id',
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toContain('Offer not found');
  });
});

// ---------------------------------------------------------------------------
// Health test
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.agents).toBeDefined();
    expect(body.agents.initialized).toBe(true);
    expect(body.adapter).toBe('duffel');
  });
});
