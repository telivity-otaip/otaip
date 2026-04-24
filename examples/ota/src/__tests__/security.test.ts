/**
 * Security tests — verify that @fastify/helmet, @fastify/cors,
 * @fastify/rate-limit, and the POST-route body schemas behave as wired.
 *
 * We use `app.inject()` which exercises the full plugin chain against
 * an in-memory request. Rate-limit tests build a fresh app with a
 * lower limit and a short time window so we don't have to wait a real
 * minute.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../server.js';
import { MockOtaAdapter } from '../mock-ota-adapter.js';

const PASSENGER = {
  title: 'mr',
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: '1990-01-15',
  gender: 'male',
};

describe('Security — Helmet headers', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    app = await buildApp({ adapter: new MockOtaAdapter(), initResolver: false });
  });
  afterEach(async () => {
    await app.close();
  });

  it('sets X-Content-Type-Options: nosniff on a static asset', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-DNS-Prefetch-Control: off', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
  });

  it('can be disabled for tests / bespoke embedding', async () => {
    const noHelmet = await buildApp({
      adapter: new MockOtaAdapter(),
      initResolver: false,
      security: { helmet: false },
    });
    const res = await noHelmet.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBeUndefined();
    await noHelmet.close();
  });
});

describe('Security — CORS', () => {
  it('no Access-Control-Allow-Origin when CORS is disabled', async () => {
    const app = await buildApp({
      adapter: new MockOtaAdapter(),
      initResolver: false,
      security: { cors: { origin: false } },
    });
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/search',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });

  it('allows only the configured origin when set', async () => {
    const app = await buildApp({
      adapter: new MockOtaAdapter(),
      initResolver: false,
      security: { cors: { origin: ['https://trusted.example'] } },
    });
    const ok = await app.inject({
      method: 'OPTIONS',
      url: '/api/search',
      headers: { origin: 'https://trusted.example', 'access-control-request-method': 'POST' },
    });
    expect(ok.headers['access-control-allow-origin']).toBe('https://trusted.example');

    const nope = await app.inject({
      method: 'OPTIONS',
      url: '/api/search',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(nope.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});

describe('Security — Rate limiting', () => {
  it('rejects requests once the global limit is exceeded', async () => {
    // Tight global limit so we can assert the 429 path in a single test
    // without waiting an actual minute. Per-route overrides on /api/book
    // and /api/pay are defined at route declaration (20/min, 10/min).
    const app = await buildApp({
      adapter: new MockOtaAdapter(),
      initResolver: false,
      security: { rateLimit: { max: 3, timeWindow: 60_000 } },
    });

    const body = {
      origin: 'JFK',
      destination: 'LAX',
      date: '2026-05-01',
      passengers: 1,
    };

    // Three requests within budget.
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/search', payload: body });
      expect(res.statusCode).not.toBe(429);
    }
    // Fourth trips the limiter.
    const over = await app.inject({ method: 'POST', url: '/api/search', payload: body });
    expect(over.statusCode).toBe(429);
    // Default rate-limit plugin error body:
    // { statusCode: 429, error: 'Too Many Requests', message: '...retry in X...' }
    const envelope = over.json();
    expect(envelope.error).toBe('Too Many Requests');
    expect(envelope.message).toMatch(/retry in/i);

    await app.close();
  });

  it('can be disabled for test/offline scenarios', async () => {
    const app = await buildApp({
      adapter: new MockOtaAdapter(),
      initResolver: false,
      security: { rateLimit: false },
    });
    // Fire 50 requests — none should 429.
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pay',
        payload: { bookingReference: 'OTA-ABCDEF' },
      });
      expect(res.statusCode).not.toBe(429);
    }
    await app.close();
  });
});

describe('Security — Input sanitization (additionalProperties: false)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    app = await buildApp({
      adapter: new MockOtaAdapter(),
      initResolver: false,
      security: { rateLimit: false }, // avoid flakiness from ratelimit in other tests
    });
  });
  afterEach(async () => {
    await app.close();
  });

  it('rejects extra top-level keys on POST /api/book', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/book',
      payload: {
        offerId: 'some-offer',
        passengers: [PASSENGER],
        email: 'a@b.test',
        phone: '+15551234567',
        admin: true, // injected — schema should reject
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.details.some((d: string) => d.includes('admin') || d.includes('additional'))).toBe(true);
  });

  it('rejects extra keys inside passengers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/book',
      payload: {
        offerId: 'some-offer',
        passengers: [{ ...PASSENGER, secretToken: 'x' }],
        email: 'a@b.test',
        phone: '+15551234567',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('rejects bad email format on POST /api/book', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/book',
      payload: {
        offerId: 'some-offer',
        passengers: [PASSENGER],
        email: 'not-an-email',
        phone: '+15551234567',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects extra keys on POST /api/pay', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pay',
      payload: { bookingReference: 'OTA-ABCDEF', hacker: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects extra keys on POST /api/cancel', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cancel',
      payload: { bookingReference: 'OTA-ABCDEF', extra: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects extra keys on POST /api/ticket', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ticket',
      payload: { bookingReference: 'OTA-ABCDEF', overrideAuth: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects extra keys on POST /api/search', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2026-05-01',
        passengers: 1,
        sql: "' OR 1=1 --",
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
