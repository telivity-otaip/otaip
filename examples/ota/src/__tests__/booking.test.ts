/**
 * Integration tests for Sprint F — booking, payment, ticketing, management.
 *
 * Uses Fastify inject (no real HTTP) with MockOtaAdapter.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MockOtaAdapter } from '../mock-ota-adapter.js';
import { buildApp } from '../server.js';

let app: FastifyInstance;
let mockAdapter: MockOtaAdapter;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_PASSENGER = {
  title: 'mr' as const,
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: '1990-01-15',
  gender: 'male' as const,
};

const VALID_CONTACT = {
  email: 'john@example.com',
  phone: '+1-555-123-4567',
};

/** Run a search to populate the offer cache, returns offer IDs */
async function searchAndGetOfferIds(): Promise<string[]> {
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
  return (body.offers as Array<{ offer_id: string }>).map((o) => o.offer_id);
}

/** Create a booking for the first JFK-LAX offer. */
async function createBooking(): Promise<{ bookingReference: string }> {
  const offerIds = await searchAndGetOfferIds();
  const res = await app.inject({
    method: 'POST',
    url: '/api/book',
    payload: {
      offerId: offerIds[0],
      passengers: [VALID_PASSENGER],
      ...VALID_CONTACT,
    },
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  mockAdapter = new MockOtaAdapter();
  app = await buildApp({ adapter: mockAdapter, initResolver: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// Booking tests
// ---------------------------------------------------------------------------

describe('POST /api/book', () => {
  it('creates a booking for a valid offer', async () => {
    const offerIds = await searchAndGetOfferIds();

    const res = await app.inject({
      method: 'POST',
      url: '/api/book',
      payload: {
        offerId: offerIds[0],
        passengers: [VALID_PASSENGER],
        ...VALID_CONTACT,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.bookingReference).toMatch(/^OTA-/);
    expect(body.status).toBe('confirmed');
    expect(body.totalAmount).toBeDefined();
    expect(body.currency).toBe('USD');
    expect(body.passengers).toHaveLength(1);
  });

  it('returns 404 for unknown offer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/book',
      payload: {
        offerId: 'nonexistent-offer',
        passengers: [VALID_PASSENGER],
        ...VALID_CONTACT,
      },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toContain('Offer not found');
  });

  it('returns 400 for missing passengers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/book',
      payload: {
        offerId: 'mock-duffel-jfk-lax-1',
        passengers: [],
        ...VALID_CONTACT,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Validation failed');
  });
});

// ---------------------------------------------------------------------------
// Payment tests
// ---------------------------------------------------------------------------

describe('POST /api/pay', () => {
  it('processes payment for a valid booking', async () => {
    const booking = await createBooking();

    const res = await app.inject({
      method: 'POST',
      url: '/api/pay',
      payload: { bookingReference: booking.bookingReference },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('succeeded');
    expect(body.paymentId).toMatch(/^pay_mock_/);
    expect(body.bookingReference).toBe(booking.bookingReference);
  });

  it('returns 404 for unknown booking', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pay',
      payload: { bookingReference: 'OTA-DOESNOTEXIST' },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Ticketing tests
// ---------------------------------------------------------------------------

describe('POST /api/ticket', () => {
  it('issues tickets for a confirmed booking', async () => {
    const booking = await createBooking();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ticket',
      payload: { bookingReference: booking.bookingReference },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ticketed');
    expect(body.ticketNumbers).toHaveLength(1);
    expect(body.ticketNumbers[0]).toMatch(/^\d{13}$/);
  });

  it('returns existing tickets for already-ticketed booking', async () => {
    const booking = await createBooking();

    // Ticket once
    const first = await app.inject({
      method: 'POST',
      url: '/api/ticket',
      payload: { bookingReference: booking.bookingReference },
    });
    const firstBody = first.json();

    // Ticket again — should return same tickets
    const second = await app.inject({
      method: 'POST',
      url: '/api/ticket',
      payload: { bookingReference: booking.bookingReference },
    });

    expect(second.statusCode).toBe(200);
    const secondBody = second.json();
    expect(secondBody.ticketNumbers).toEqual(firstBody.ticketNumbers);
  });
});

// ---------------------------------------------------------------------------
// Manage tests
// ---------------------------------------------------------------------------

describe('GET /api/booking/:ref', () => {
  it('retrieves a booking by reference', async () => {
    const booking = await createBooking();

    const res = await app.inject({
      method: 'GET',
      url: `/api/booking/${booking.bookingReference}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.bookingReference).toBe(booking.bookingReference);
    expect(body.status).toBe('confirmed');
  });

  it('returns 404 for unknown reference', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/booking/OTA-NOTFOUND',
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/cancel', () => {
  it('cancels a confirmed booking', async () => {
    const booking = await createBooking();

    const res = await app.inject({
      method: 'POST',
      url: '/api/cancel',
      payload: { bookingReference: booking.bookingReference },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);

    // Verify status is now cancelled
    const check = await app.inject({
      method: 'GET',
      url: `/api/booking/${booking.bookingReference}`,
    });
    expect(check.json().status).toBe('cancelled');
  });

  it('returns 400 for ticketed booking', async () => {
    const booking = await createBooking();

    // Ticket it first
    await app.inject({
      method: 'POST',
      url: '/api/ticket',
      payload: { bookingReference: booking.bookingReference },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/cancel',
      payload: { bookingReference: booking.bookingReference },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('Cannot cancel');
  });

  it('returns 404 for unknown booking', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cancel',
      payload: { bookingReference: 'OTA-DOESNOTEXIST' },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Full flow tests
// ---------------------------------------------------------------------------

describe('Full booking flow', () => {
  it('search -> book -> pay -> ticket -> retrieve', async () => {
    // 1. Search
    const searchRes = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        origin: 'JFK',
        destination: 'LAX',
        date: '2025-06-15',
        passengers: 1,
      },
    });
    expect(searchRes.statusCode).toBe(200);
    const offers = searchRes.json().offers;
    const offerId = offers[0].offer_id;

    // 2. Book
    const bookRes = await app.inject({
      method: 'POST',
      url: '/api/book',
      payload: {
        offerId,
        passengers: [VALID_PASSENGER],
        ...VALID_CONTACT,
      },
    });
    expect(bookRes.statusCode).toBe(200);
    const bookingRef = bookRes.json().bookingReference;
    expect(bookRes.json().status).toBe('confirmed');

    // 3. Pay
    const payRes = await app.inject({
      method: 'POST',
      url: '/api/pay',
      payload: { bookingReference: bookingRef },
    });
    expect(payRes.statusCode).toBe(200);
    expect(payRes.json().status).toBe('succeeded');

    // 4. Ticket
    const ticketRes = await app.inject({
      method: 'POST',
      url: '/api/ticket',
      payload: { bookingReference: bookingRef },
    });
    expect(ticketRes.statusCode).toBe(200);
    expect(ticketRes.json().ticketNumbers).toHaveLength(1);

    // 5. Retrieve
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/booking/${bookingRef}`,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().status).toBe('ticketed');
    expect(getRes.json().ticketNumbers).toHaveLength(1);
  });

  it('search -> book -> cancel', async () => {
    // 1. Search
    await searchAndGetOfferIds();

    // 2. Book
    const booking = await createBooking();
    expect(booking.bookingReference).toMatch(/^OTA-/);

    // 3. Cancel
    const cancelRes = await app.inject({
      method: 'POST',
      url: '/api/cancel',
      payload: { bookingReference: booking.bookingReference },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().success).toBe(true);

    // 4. Verify cancelled
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/booking/${booking.bookingReference}`,
    });
    expect(getRes.json().status).toBe('cancelled');
  });
});
