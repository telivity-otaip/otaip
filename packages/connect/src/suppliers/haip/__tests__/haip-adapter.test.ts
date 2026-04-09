import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HaipAdapter } from '../index.js';
import { ConnectError } from '../../../base-adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Record<string, unknown>) {
  return {
    baseUrl: 'http://localhost:3000',
    apiKey: '',
    timeoutMs: 5000,
    maxRetries: 0, // No retries in unit tests for speed
    baseDelayMs: 100,
    ...overrides,
  };
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function mockFetchSequence(responses: Array<{ body: unknown; status: number }>) {
  const fn = vi.fn();
  for (const [i, r] of responses.entries()) {
    fn.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: () => Promise.resolve(r.body),
      text: () => Promise.resolve(JSON.stringify(r.body)),
    });
  }
  return fn;
}

const SEARCH_RESPONSE = {
  properties: [
    {
      id: 'prop-001',
      name: 'Telivity Grand Hotel',
      address: { line1: '123 Main St', city: 'New York', countryCode: 'US' },
      coordinates: { latitude: 40.7128, longitude: -74.006 },
      starRating: 4,
      amenities: ['WiFi'],
      roomTypes: [{ roomTypeId: 'rt-1', name: 'Standard King', maxOccupancy: 2, bedType: 'King' }],
      rates: [
        {
          rateId: 'rate-1',
          roomTypeId: 'rt-1',
          nightlyRate: '199.99',
          totalRate: '399.98',
          currency: 'USD',
          rateType: 'bar',
          paymentModel: 'pay_at_property',
          cancellationPolicy: { refundable: true, penalties: [] },
        },
      ],
      photos: [],
      contentCompleteness: 85,
    },
  ],
  totalResults: 1,
};

const BOOK_RESPONSE = {
  confirmationNumber: 'HAIP-12345',
  externalConfirmationCode: 'OTAIP-EXT-001',
  status: 'confirmed',
  propertyId: 'prop-001',
  propertyName: 'Telivity Grand Hotel',
  roomTypeName: 'Standard King',
  checkIn: '2026-04-07',
  checkOut: '2026-04-09',
  rooms: 1,
  guest: { firstName: 'John', lastName: 'Doe' },
  totalAmount: '449.58',
  currency: 'USD',
  cancellationDeadline: '2026-04-06T14:00:00Z',
  createdAt: '2026-04-01T10:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HaipAdapter', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // -- Construction --

  describe('constructor', () => {
    it('validates config on construction', () => {
      expect(() => new HaipAdapter(makeConfig())).not.toThrow();
    });

    it('throws on invalid config', () => {
      expect(() => new HaipAdapter({})).toThrow('Invalid HAIP config');
    });
  });

  // -- searchHotels --

  describe('searchHotels', () => {
    it('calls POST /api/v1/connect/search with correct body', async () => {
      const fetchMock = mockFetch(SEARCH_RESPONSE);
      globalThis.fetch = fetchMock;

      const adapter = new HaipAdapter(makeConfig());
      await adapter.searchHotels({
        destination: 'New York',
        checkIn: '2026-04-07',
        checkOut: '2026-04-09',
        rooms: 1,
        adults: 2,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('http://localhost:3000/api/v1/connect/search');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string);
      expect(body.destination).toBe('New York');
      expect(body.adults).toBe(2);
    });

    it('returns mapped hotel results', async () => {
      globalThis.fetch = mockFetch(SEARCH_RESPONSE);

      const adapter = new HaipAdapter(makeConfig());
      const results = await adapter.searchHotels({
        destination: 'New York',
        checkIn: '2026-04-07',
        checkOut: '2026-04-09',
        rooms: 1,
        adults: 2,
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.source.sourceId).toBe('haip');
      expect(results[0]!.source.qualityScore).toBe(85);
      expect(results[0]!.propertyName).toBe('Telivity Grand Hotel');
    });

    it('includes Content-Type and Accept headers', async () => {
      const fetchMock = mockFetch(SEARCH_RESPONSE);
      globalThis.fetch = fetchMock;

      const adapter = new HaipAdapter(makeConfig());
      await adapter.searchHotels({
        destination: 'NYC',
        checkIn: '2026-04-07',
        checkOut: '2026-04-09',
        rooms: 1,
        adults: 1,
      });

      const headers = fetchMock.mock.calls[0]![1].headers;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Accept']).toBe('application/json');
    });

    it('includes Authorization header when apiKey is set', async () => {
      const fetchMock = mockFetch(SEARCH_RESPONSE);
      globalThis.fetch = fetchMock;

      const adapter = new HaipAdapter(makeConfig({ apiKey: 'my-token' }));
      await adapter.searchHotels({
        destination: 'NYC',
        checkIn: '2026-04-07',
        checkOut: '2026-04-09',
        rooms: 1,
        adults: 1,
      });

      const headers = fetchMock.mock.calls[0]![1].headers;
      expect(headers['Authorization']).toBe('Bearer my-token');
    });

    it('omits Authorization header when apiKey is empty', async () => {
      const fetchMock = mockFetch(SEARCH_RESPONSE);
      globalThis.fetch = fetchMock;

      const adapter = new HaipAdapter(makeConfig({ apiKey: '' }));
      await adapter.searchHotels({
        destination: 'NYC',
        checkIn: '2026-04-07',
        checkOut: '2026-04-09',
        rooms: 1,
        adults: 1,
      });

      const headers = fetchMock.mock.calls[0]![1].headers;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  // -- getPropertyDetails --

  describe('getPropertyDetails', () => {
    it('calls GET /api/v1/connect/properties/:id', async () => {
      const fetchMock = mockFetch(SEARCH_RESPONSE.properties[0]);
      globalThis.fetch = fetchMock;

      const adapter = new HaipAdapter(makeConfig());
      const result = await adapter.getPropertyDetails('prop-001');

      expect(fetchMock.mock.calls[0]![0]).toBe(
        'http://localhost:3000/api/v1/connect/properties/prop-001',
      );
      expect(result).not.toBeNull();
      expect(result!.propertyName).toBe('Telivity Grand Hotel');
    });

    it('returns null on 404', async () => {
      globalThis.fetch = mockFetch({ error: 'Not Found' }, 404);

      const adapter = new HaipAdapter(makeConfig());
      const result = await adapter.getPropertyDetails('nonexistent');

      expect(result).toBeNull();
    });
  });

  // -- createBooking --

  describe('createBooking', () => {
    it('calls POST /api/v1/connect/book', async () => {
      const fetchMock = mockFetch(BOOK_RESPONSE);
      globalThis.fetch = fetchMock;

      const adapter = new HaipAdapter(makeConfig());
      const result = await adapter.createBooking({
        propertyId: 'prop-001',
        roomTypeId: 'rt-1',
        rateId: 'rate-1',
        checkIn: '2026-04-07',
        checkOut: '2026-04-09',
        rooms: 1,
        guest: { firstName: 'John', lastName: 'Doe' },
        externalConfirmationCode: 'OTAIP-EXT-001',
      });

      expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:3000/api/v1/connect/book');

      // Auto-confirm: status should be 'confirmed' immediately
      expect(result.status).toBe('confirmed');
      expect(result.confirmation.crsConfirmation).toBe('HAIP-12345');
      expect(result.confirmation.channelConfirmation).toBe('OTAIP-EXT-001');
    });

    it('passes externalConfirmationCode in request body', async () => {
      const fetchMock = mockFetch(BOOK_RESPONSE);
      globalThis.fetch = fetchMock;

      const adapter = new HaipAdapter(makeConfig());
      await adapter.createBooking({
        propertyId: 'prop-001',
        roomTypeId: 'rt-1',
        rateId: 'rate-1',
        checkIn: '2026-04-07',
        checkOut: '2026-04-09',
        rooms: 1,
        guest: { firstName: 'John', lastName: 'Doe' },
        externalConfirmationCode: 'MY-REF-123',
      });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
      expect(body.externalConfirmationCode).toBe('MY-REF-123');
    });
  });

  // -- getBookingStatus --

  describe('getBookingStatus', () => {
    it('calls GET /api/v1/connect/bookings/:id/verify', async () => {
      const verifyResponse = {
        confirmationNumber: 'HAIP-12345',
        reservationStatus: 'confirmed',
        propertyId: 'prop-001',
        propertyName: 'Telivity Grand Hotel',
        roomTypeName: 'Standard King',
        checkIn: '2026-04-07',
        checkOut: '2026-04-09',
        rooms: 1,
        guest: { firstName: 'John', lastName: 'Doe' },
        totalAmount: '449.58',
        currency: 'USD',
        verification: {
          rateMatch: true,
          roomMatch: true,
          datesMatch: true,
          guestMatch: true,
          allMatch: true,
        },
        updatedAt: '2026-04-01T10:00:00Z',
      };

      const fetchMock = mockFetch(verifyResponse);
      globalThis.fetch = fetchMock;

      const adapter = new HaipAdapter(makeConfig());
      const result = await adapter.getBookingStatus('HAIP-12345');

      expect(fetchMock.mock.calls[0]![0]).toBe(
        'http://localhost:3000/api/v1/connect/bookings/HAIP-12345/verify',
      );
      expect(result.syncStatus).toBe('IN_SYNC');
      expect(result.status).toBe('confirmed');
    });
  });

  // -- modifyBooking --

  describe('modifyBooking', () => {
    it('calls PATCH /api/v1/connect/bookings/:id', async () => {
      const modifyResponse = {
        confirmationNumber: 'HAIP-12345',
        status: 'modified',
        propertyId: 'prop-001',
        propertyName: 'Telivity Grand Hotel',
        roomTypeName: 'Deluxe King',
        checkIn: '2026-04-07',
        checkOut: '2026-04-10',
        rooms: 1,
        guest: { firstName: 'John', lastName: 'Doe' },
        totalAmount: '649.97',
        currency: 'USD',
        modifiedAt: '2026-04-02T10:00:00Z',
      };

      const fetchMock = mockFetch(modifyResponse);
      globalThis.fetch = fetchMock;

      const adapter = new HaipAdapter(makeConfig());
      const result = await adapter.modifyBooking('HAIP-12345', {
        checkOut: '2026-04-10',
      });

      expect(fetchMock.mock.calls[0]![0]).toBe(
        'http://localhost:3000/api/v1/connect/bookings/HAIP-12345',
      );
      expect(fetchMock.mock.calls[0]![1].method).toBe('PATCH');
      expect(result.status).toBe('modified');
      expect(result.checkOut).toBe('2026-04-10');
    });
  });

  // -- cancelBooking --

  describe('cancelBooking', () => {
    it('calls DELETE /api/v1/connect/bookings/:id', async () => {
      const cancelResponse = {
        confirmationNumber: 'HAIP-12345',
        status: 'cancelled',
        cancellationFee: '199.99',
        cancellationCurrency: 'USD',
        cancelledAt: '2026-04-03T10:00:00Z',
      };

      const fetchMock = mockFetch(cancelResponse);
      globalThis.fetch = fetchMock;

      const adapter = new HaipAdapter(makeConfig());
      const result = await adapter.cancelBooking('HAIP-12345');

      expect(fetchMock.mock.calls[0]![0]).toBe(
        'http://localhost:3000/api/v1/connect/bookings/HAIP-12345',
      );
      expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE');
      expect(result.status).toBe('cancelled');
      expect(result.cancellationFee).toBe('199.99');
    });
  });

  // -- healthCheck --

  describe('healthCheck', () => {
    it('returns healthy when HAIP responds ok', async () => {
      globalThis.fetch = mockFetch({ status: 'ok', version: '1.0.0' });

      const adapter = new HaipAdapter(makeConfig());
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns unhealthy on fetch error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const adapter = new HaipAdapter(makeConfig());
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(false);
    });
  });

  // -- isAvailable --

  describe('isAvailable', () => {
    it('returns true when health check passes', async () => {
      globalThis.fetch = mockFetch({ status: 'ok' });

      const adapter = new HaipAdapter(makeConfig());
      expect(await adapter.isAvailable()).toBe(true);
    });

    it('returns false when health check fails', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('down'));

      const adapter = new HaipAdapter(makeConfig());
      expect(await adapter.isAvailable()).toBe(false);
    });
  });

  // -- Error handling --

  describe('error handling', () => {
    it('throws ConnectError on 400', async () => {
      globalThis.fetch = mockFetch({ error: 'Bad Request' }, 400);

      const adapter = new HaipAdapter(makeConfig());
      await expect(
        adapter.searchHotels({
          destination: 'NYC',
          checkIn: '2026-04-07',
          checkOut: '2026-04-09',
          rooms: 1,
          adults: 1,
        }),
      ).rejects.toThrow(ConnectError);
    });

    it('marks 400 as non-retryable', async () => {
      globalThis.fetch = mockFetch({ error: 'Bad Request' }, 400);

      const adapter = new HaipAdapter(makeConfig());
      try {
        await adapter.searchHotels({
          destination: 'NYC',
          checkIn: '2026-04-07',
          checkOut: '2026-04-09',
          rooms: 1,
          adults: 1,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ConnectError);
        expect((error as ConnectError).retryable).toBe(false);
      }
    });

    it('marks 503 as retryable', async () => {
      globalThis.fetch = mockFetch({ error: 'Service Unavailable' }, 503);

      const adapter = new HaipAdapter(makeConfig());
      try {
        await adapter.searchHotels({
          destination: 'NYC',
          checkIn: '2026-04-07',
          checkOut: '2026-04-09',
          rooms: 1,
          adults: 1,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ConnectError);
        expect((error as ConnectError).retryable).toBe(true);
      }
    });
  });
});
