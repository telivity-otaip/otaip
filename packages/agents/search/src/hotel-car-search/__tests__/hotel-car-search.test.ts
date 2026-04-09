import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HotelCarSearchAgent } from '../index.js';

let agent: HotelCarSearchAgent;
beforeAll(async () => {
  agent = new HotelCarSearchAgent();
  await agent.initialize();
});
afterAll(() => {
  agent.destroy();
});

describe('HotelCarSearchAgent', () => {
  it('hotel search returns empty with noAdaptersConfigured', async () => {
    const r = await agent.execute({
      data: {
        operation: 'searchHotels',
        hotel: {
          destination: 'NYC',
          checkIn: '2026-06-01',
          checkOut: '2026-06-05',
          rooms: 1,
          adults: 2,
        },
      },
    });
    expect(r.data.hotelResults!.hotels).toHaveLength(0);
    expect(r.data.hotelResults!.noAdaptersConfigured).toBe(true);
  });
  it('car search returns empty with noAdaptersConfigured', async () => {
    const r = await agent.execute({
      data: {
        operation: 'searchCars',
        car: {
          pickupLocation: 'LAX',
          pickupDateTime: '2026-06-01T10:00',
          dropoffDateTime: '2026-06-05T10:00',
        },
      },
    });
    expect(r.data.carResults!.cars).toHaveLength(0);
    expect(r.data.carResults!.noAdaptersConfigured).toBe(true);
  });
  it('hotel search uses provided currency', async () => {
    const r = await agent.execute({
      data: {
        operation: 'searchHotels',
        hotel: {
          destination: 'LON',
          checkIn: '2026-06-01',
          checkOut: '2026-06-03',
          rooms: 1,
          adults: 1,
          currency: 'GBP',
        },
      },
    });
    expect(r.data.hotelResults!.currency).toBe('GBP');
  });
  it('hotel defaults to USD', async () => {
    const r = await agent.execute({
      data: {
        operation: 'searchHotels',
        hotel: {
          destination: 'PAR',
          checkIn: '2026-06-01',
          checkOut: '2026-06-03',
          rooms: 1,
          adults: 1,
        },
      },
    });
    expect(r.data.hotelResults!.currency).toBe('USD');
  });
  it('rejects missing hotel input', async () => {
    await expect(agent.execute({ data: { operation: 'searchHotels' } })).rejects.toThrow('Invalid');
  });
  it('rejects missing car input', async () => {
    await expect(agent.execute({ data: { operation: 'searchCars' } })).rejects.toThrow('Invalid');
  });
  it('rejects invalid operation', async () => {
    await expect(
      agent.execute({ data: { operation: 'invalid' as 'searchHotels' } }),
    ).rejects.toThrow('Invalid');
  });
  it('has correct id', () => {
    expect(agent.id).toBe('1.7');
  });
  it('reports healthy', async () => {
    expect((await agent.health()).status).toBe('healthy');
  });
  it('throws when not initialized', async () => {
    const u = new HotelCarSearchAgent();
    await expect(
      u.execute({
        data: {
          operation: 'searchHotels',
          hotel: {
            destination: 'X',
            checkIn: '2026-01-01',
            checkOut: '2026-01-02',
            rooms: 1,
            adults: 1,
          },
        },
      }),
    ).rejects.toThrow('not been initialized');
  });
  it('car search defaults to USD', async () => {
    const r = await agent.execute({
      data: {
        operation: 'searchCars',
        car: {
          pickupLocation: 'JFK',
          pickupDateTime: '2026-06-01T10:00',
          dropoffDateTime: '2026-06-05T10:00',
        },
      },
    });
    expect(r.data.carResults!.currency).toBe('USD');
  });
  it('rejects empty operation', async () => {
    await expect(agent.execute({ data: { operation: '' as 'searchHotels' } })).rejects.toThrow(
      'Invalid',
    );
  });
  it('hotel with all optional params', async () => {
    const r = await agent.execute({
      data: {
        operation: 'searchHotels',
        hotel: {
          destination: 'TYO',
          checkIn: '2026-06-01',
          checkOut: '2026-06-03',
          rooms: 2,
          adults: 2,
          children: 1,
          starRating: 4,
          maxRatePerNight: '200',
          currency: 'JPY',
        },
      },
    });
    expect(r.data.hotelResults!.noAdaptersConfigured).toBe(true);
  });
  it('car with optional params', async () => {
    const r = await agent.execute({
      data: {
        operation: 'searchCars',
        car: {
          pickupLocation: 'CDG',
          dropoffLocation: 'NCE',
          pickupDateTime: '2026-06-01T10:00',
          dropoffDateTime: '2026-06-05T10:00',
          driverAge: 30,
          carCategory: 'SUV',
        },
      },
    });
    expect(r.data.carResults!.noAdaptersConfigured).toBe(true);
  });
  it('returns confidence 1.0', async () => {
    const r = await agent.execute({
      data: {
        operation: 'searchHotels',
        hotel: {
          destination: 'X',
          checkIn: '2026-01-01',
          checkOut: '2026-01-02',
          rooms: 1,
          adults: 1,
        },
      },
    });
    expect(r.confidence).toBe(1.0);
  });
});
