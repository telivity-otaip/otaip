import { describe, expect, it } from 'vitest';

import { MockHotelbedsAdapter } from '../mock-hotelbeds-adapter.js';

describe('MockHotelbedsAdapter — search bridge', () => {
  it('returns mapped RawHotelResult for known destination', async () => {
    const adapter = new MockHotelbedsAdapter();
    const results = await adapter.searchHotels({
      destination: 'MCO',
      checkIn: '2026-06-15',
      checkOut: '2026-06-17',
      rooms: 1,
      adults: 2,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.source.sourceId).toBe('hotelbeds');
  });

  it('returns empty array for unknown destination', async () => {
    const adapter = new MockHotelbedsAdapter();
    const results = await adapter.searchHotels({
      destination: 'XYZ',
      checkIn: '2026-06-15',
      checkOut: '2026-06-17',
      rooms: 1,
      adults: 2,
    });
    expect(results).toEqual([]);
  });
});

describe('MockHotelbedsAdapter — BOOKABLE rate flow', () => {
  it('books directly without checkrate', async () => {
    const adapter = new MockHotelbedsAdapter();
    const summary = await adapter.bookSummary({
      holder: { name: 'John', surname: 'Smith' },
      rooms: [
        {
          rateKey: 'mock-mco-bookable-1',
          paxes: [{ roomId: 1, type: 'AD', name: 'John', surname: 'Smith' }],
        },
      ],
      clientReference: 'trip-1',
    });
    expect(summary).not.toBeNull();
    expect(summary!.status).toBe('confirmed');
    expect(summary!.reference).toMatch(/^MOCK-HB-/);
  });
});

describe('MockHotelbedsAdapter — RECHECK rate flow', () => {
  it('checkrate returns a new rateKey for RECHECK rates', async () => {
    const adapter = new MockHotelbedsAdapter();
    const checkrate = await adapter.checkRate({ rooms: [{ rateKey: 'mock-mco-recheck-1' }] });
    const rate = checkrate.hotel?.rooms?.[0]?.rates?.[0];
    expect(rate?.rateKey).toBe('mock-mco-recheck-1-repriced');
    expect(rate?.rateType).toBe('BOOKABLE');
  });
});

describe('MockHotelbedsAdapter — cancellation', () => {
  it('SIMULATION leaves status confirmed and returns SIM- reference', async () => {
    const adapter = new MockHotelbedsAdapter();
    const booked = await adapter.book({
      holder: { name: 'A', surname: 'B' },
      rooms: [
        { rateKey: 'mock-mco-bookable-1', paxes: [{ roomId: 1, type: 'AD', name: 'A', surname: 'B' }] },
      ],
      clientReference: 'c',
    });
    const ref = booked.booking!.reference;

    const sim = await adapter.cancelBooking(ref, 'SIMULATION');
    expect(sim.booking?.status).toBe('CONFIRMED');
    expect(sim.booking?.cancellationReference).toBe(`SIM-${ref}`);

    const fetched = await adapter.getBooking(ref);
    expect(fetched.booking?.status).toBe('CONFIRMED');
  });

  it('CANCELLATION transitions status and persists', async () => {
    const adapter = new MockHotelbedsAdapter();
    const booked = await adapter.book({
      holder: { name: 'A', surname: 'B' },
      rooms: [
        { rateKey: 'mock-mco-bookable-1', paxes: [{ roomId: 1, type: 'AD', name: 'A', surname: 'B' }] },
      ],
      clientReference: 'c',
    });
    const ref = booked.booking!.reference;

    const cancelled = await adapter.cancelBooking(ref, 'CANCELLATION');
    expect(cancelled.booking?.status).toBe('CANCELLED');

    const fetched = await adapter.getBooking(ref);
    expect(fetched.booking?.status).toBe('CANCELLED');
  });
});

describe('MockHotelbedsAdapter — availability error', () => {
  it('throws when set unavailable', async () => {
    const adapter = new MockHotelbedsAdapter();
    adapter.setAvailable(false);
    await expect(adapter.searchHotels({
      destination: 'MCO',
      checkIn: '2026-06-15',
      checkOut: '2026-06-17',
      rooms: 1,
      adults: 1,
    })).rejects.toThrow('not available');
  });
});
