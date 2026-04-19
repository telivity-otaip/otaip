/**
 * HotelbedsAdapter — unit tests with mocked fetch.
 *
 * No real network. Same shape as duffel-adapter.test.ts: stub global fetch,
 * exercise constructor, search, checkrate, book, cancel, error handling.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HotelbedsAdapter } from '../hotelbeds-adapter.js';
import type {
  HotelbedsAvailabilityResponse,
  HotelbedsBookingResponse,
  HotelbedsCancellationResponse,
  HotelbedsCheckRateResponse,
} from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(body),
    }),
  );
}

function mockFetchNetworkError(message: string): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
}

const AVAIL_RESPONSE: HotelbedsAvailabilityResponse = {
  hotels: {
    total: 1,
    checkIn: '2026-06-15',
    checkOut: '2026-06-17',
    hotels: [
      {
        code: 12345,
        name: 'Test Hotel Orlando',
        categoryCode: '4EST',
        countryCode: 'US',
        latitude: '28.3852',
        longitude: '-81.5639',
        currency: 'USD',
        rooms: [
          {
            code: 'STD.ST',
            name: 'STANDARD',
            rates: [
              {
                rateKey: 'rk-bookable-1',
                rateType: 'BOOKABLE',
                rateClass: 'NOR',
                net: '610.00',
                paymentType: 'AT_WEB',
                cancellationPolicies: [{ amount: '305.00', from: '2026-06-13T15:00:00Z' }],
              },
            ],
          },
        ],
      },
    ],
  },
};

const CHECKRATE_REPRICED_RESPONSE: HotelbedsCheckRateResponse = {
  hotel: {
    code: 12345,
    name: 'Test Hotel Orlando',
    countryCode: 'US',
    rooms: [
      {
        code: 'STD.ST',
        rates: [
          {
            rateKey: 'rk-bookable-1-repriced',
            rateType: 'BOOKABLE',
            rateClass: 'NOR',
            net: '625.00',
          },
        ],
      },
    ],
  },
};

const BOOKING_RESPONSE: HotelbedsBookingResponse = {
  booking: {
    reference: 'HB-PROD-0001',
    clientReference: 'trip-9',
    status: 'CONFIRMED',
    creationDate: '2026-04-18T12:00:00Z',
    holder: { name: 'John', surname: 'Smith' },
    totalNet: '610.00',
    currency: 'USD',
    hotel: { code: 12345, name: 'Test Hotel Orlando' },
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('HotelbedsAdapter constructor', () => {
  it('throws when api key missing', () => {
    const origKey = process.env['HOTELBEDS_API_KEY'];
    const origSecret = process.env['HOTELBEDS_SECRET'];
    delete process.env['HOTELBEDS_API_KEY'];
    process.env['HOTELBEDS_SECRET'] = 's';
    expect(() => new HotelbedsAdapter()).toThrow('HOTELBEDS_API_KEY');
    if (origKey !== undefined) process.env['HOTELBEDS_API_KEY'] = origKey;
    if (origSecret !== undefined) process.env['HOTELBEDS_SECRET'] = origSecret;
    else delete process.env['HOTELBEDS_SECRET'];
  });

  it('throws when secret missing', () => {
    const origSecret = process.env['HOTELBEDS_SECRET'];
    delete process.env['HOTELBEDS_SECRET'];
    expect(() => new HotelbedsAdapter({ apiKey: 'k' })).toThrow('HOTELBEDS_SECRET');
    if (origSecret !== undefined) process.env['HOTELBEDS_SECRET'] = origSecret;
  });

  it('defaults to test environment', () => {
    const orig = process.env['HOTELBEDS_ENV'];
    delete process.env['HOTELBEDS_ENV'];
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    expect(adapter.adapterId).toBe('hotelbeds');
    if (orig !== undefined) process.env['HOTELBEDS_ENV'] = orig;
  });

  it('respects baseUrl override', async () => {
    mockFetchOnce(200, AVAIL_RESPONSE);
    const adapter = new HotelbedsAdapter({
      apiKey: 'k',
      secret: 's',
      baseUrl: 'https://override.example',
    });
    await adapter.availability({
      stay: { checkIn: '2026-06-15', checkOut: '2026-06-17' },
      occupancies: [{ rooms: 1, adults: 2, children: 0 }],
      destination: { code: 'MCO' },
    });
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    expect(fetchCall[0]).toMatch(/^https:\/\/override\.example/);
  });
});

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

describe('HotelbedsAdapter request headers', () => {
  it('sends Api-key, X-Signature, Accept-Encoding gzip', async () => {
    mockFetchOnce(200, AVAIL_RESPONSE);
    const adapter = new HotelbedsAdapter({ apiKey: 'KEY', secret: 'SEC' });
    await adapter.availability({
      stay: { checkIn: '2026-06-15', checkOut: '2026-06-17' },
      occupancies: [{ rooms: 1, adults: 2, children: 0 }],
      destination: { code: 'MCO' },
    });
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const headers = fetchCall[1]!.headers as Record<string, string>;
    expect(headers['Api-key']).toBe('KEY');
    expect(headers['X-Signature']).toMatch(/^[a-f0-9]{64}$/);
    expect(headers['Accept-Encoding']).toBe('gzip');
    expect(headers['Content-Type']).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// searchHotels (HotelSourceAdapter bridge)
// ---------------------------------------------------------------------------

describe('HotelbedsAdapter searchHotels', () => {
  it('maps Hotelbeds availability response to RawHotelResult[]', async () => {
    mockFetchOnce(200, AVAIL_RESPONSE);
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    const results = await adapter.searchHotels({
      destination: 'MCO',
      checkIn: '2026-06-15',
      checkOut: '2026-06-17',
      rooms: 1,
      adults: 2,
    });
    expect(results).toHaveLength(1);
    const property = results[0]!;
    expect(property.source.sourceId).toBe('hotelbeds');
    expect(property.source.sourcePropertyId).toBe('12345');
    expect(property.starRating).toBe(4);
    expect(property.rates).toHaveLength(1);
    expect(property.rates[0]?.rateId).toBe('rk-bookable-1');
    expect(property.rates[0]?.totalRate).toBe('610.00');
    expect(property.rates[0]?.nightlyRate).toBe('305.00');
  });

  it('returns empty array when Hotelbeds returns no hotels', async () => {
    mockFetchOnce(200, { hotels: { hotels: [] } });
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    const results = await adapter.searchHotels({
      destination: 'XYZ',
      checkIn: '2026-06-15',
      checkOut: '2026-06-17',
      rooms: 1,
      adults: 1,
    });
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// availability (raw)
// ---------------------------------------------------------------------------

describe('HotelbedsAdapter availability', () => {
  it('posts to /hotel-api/1.0/hotels and returns wire response', async () => {
    mockFetchOnce(200, AVAIL_RESPONSE);
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    const response = await adapter.availability({
      stay: { checkIn: '2026-06-15', checkOut: '2026-06-17' },
      occupancies: [{ rooms: 1, adults: 2, children: 0 }],
      destination: { code: 'MCO' },
    });
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    expect(fetchCall[0]).toMatch(/\/hotel-api\/1\.0\/hotels$/);
    expect(fetchCall[1]?.method).toBe('POST');
    expect(response.hotels?.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// checkRate — RECHECK flow
// ---------------------------------------------------------------------------

describe('HotelbedsAdapter checkRate', () => {
  it('posts the rateKey and returns repriced response', async () => {
    mockFetchOnce(200, CHECKRATE_REPRICED_RESPONSE);
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    const response = await adapter.checkRate({ rooms: [{ rateKey: 'rk-bookable-1' }] });
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    expect(fetchCall[0]).toMatch(/\/hotel-api\/1\.0\/checkrates$/);
    const body = JSON.parse(fetchCall[1]!.body as string);
    expect(body.rooms[0].rateKey).toBe('rk-bookable-1');
    expect(response.hotel?.rooms?.[0]?.rates?.[0]?.rateKey).toBe('rk-bookable-1-repriced');
  });
});

// ---------------------------------------------------------------------------
// book → bookSummary
// ---------------------------------------------------------------------------

describe('HotelbedsAdapter book', () => {
  it('returns mapped BookingSummary', async () => {
    mockFetchOnce(200, BOOKING_RESPONSE);
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    const summary = await adapter.bookSummary({
      holder: { name: 'John', surname: 'Smith' },
      rooms: [
        {
          rateKey: 'rk-bookable-1',
          paxes: [{ roomId: 1, type: 'AD', name: 'John', surname: 'Smith' }],
        },
      ],
      clientReference: 'trip-9',
    });
    expect(summary).not.toBeNull();
    expect(summary!.reference).toBe('HB-PROD-0001');
    expect(summary!.status).toBe('confirmed');
    expect(summary!.totalCharged).toEqual({ amount: '610.00', currency: 'USD' });
  });

  it('returns null when Hotelbeds returns no booking', async () => {
    mockFetchOnce(200, {});
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    const summary = await adapter.bookSummary({
      holder: { name: 'A', surname: 'B' },
      rooms: [{ rateKey: 'rk', paxes: [{ roomId: 1, type: 'AD', name: 'A', surname: 'B' }] }],
      clientReference: 'c',
    });
    expect(summary).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cancellation — simulation vs execution
// ---------------------------------------------------------------------------

describe('HotelbedsAdapter cancelBooking', () => {
  const CANCEL_SIM_RESPONSE: HotelbedsCancellationResponse = {
    booking: {
      reference: 'HB-PROD-0001',
      status: 'CONFIRMED',
      cancellationReference: 'SIM-HB-PROD-0001',
    },
  };
  const CANCEL_RESPONSE: HotelbedsCancellationResponse = {
    booking: {
      reference: 'HB-PROD-0001',
      status: 'CANCELLED',
      cancellationReference: 'CXL-HB-PROD-0001',
    },
  };

  it('defaults to SIMULATION flag', async () => {
    mockFetchOnce(200, CANCEL_SIM_RESPONSE);
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    await adapter.cancelBooking('HB-PROD-0001');
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toContain('cancellationFlag=SIMULATION');
  });

  it('uses CANCELLATION when explicitly requested', async () => {
    mockFetchOnce(200, CANCEL_RESPONSE);
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    const response = await adapter.cancelBooking('HB-PROD-0001', 'CANCELLATION');
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toContain('cancellationFlag=CANCELLATION');
    expect(response.booking?.status).toBe('CANCELLED');
  });
});

// ---------------------------------------------------------------------------
// isAvailable / error handling
// ---------------------------------------------------------------------------

describe('HotelbedsAdapter isAvailable', () => {
  it('returns true on 200', async () => {
    mockFetchOnce(200, {});
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('returns false on network error', async () => {
    mockFetchNetworkError('ECONNREFUSED');
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('returns false on 401', async () => {
    mockFetchOnce(401, { error: { message: 'Invalid signature' } });
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    expect(await adapter.isAvailable()).toBe(false);
  });
});

describe('HotelbedsAdapter error handling', () => {
  it('throws clear network error message', async () => {
    mockFetchNetworkError('ENOTFOUND');
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    await expect(
      adapter.availability({
        stay: { checkIn: '2026-06-15', checkOut: '2026-06-17' },
        occupancies: [{ rooms: 1, adults: 2, children: 0 }],
        destination: { code: 'MCO' },
      }),
    ).rejects.toThrow('Hotelbeds API network error: ENOTFOUND');
  });

  it('throws on 429 rate limit', async () => {
    mockFetchOnce(429, { error: { message: 'Daily quota exceeded' } });
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    await expect(
      adapter.availability({
        stay: { checkIn: '2026-06-15', checkOut: '2026-06-17' },
        occupancies: [{ rooms: 1, adults: 2, children: 0 }],
        destination: { code: 'MCO' },
      }),
    ).rejects.toThrow('rate limited (429)');
  });

  it('throws on 4xx with API detail', async () => {
    mockFetchOnce(422, { error: { code: 'INVALID', message: 'Bad rateKey' } });
    const adapter = new HotelbedsAdapter({ apiKey: 'k', secret: 's' });
    await expect(adapter.checkRate({ rooms: [{ rateKey: 'bad' }] })).rejects.toThrow(
      'Hotelbeds API error 422: Bad rateKey',
    );
  });
});
