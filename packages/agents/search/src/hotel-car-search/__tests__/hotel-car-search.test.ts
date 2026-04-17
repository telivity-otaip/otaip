import { describe, it, expect, beforeEach } from 'vitest';
import { HotelCarSearchAgent } from '../index.js';
import type {
  CarAdapter,
  CarOffer,
  CarSearchInput,
  HotelAdapter,
  HotelOffer,
  HotelSearchInput,
} from '../types.js';

// ───────────────────────────────────────────────────────────────────────────
// Test fixtures
// ───────────────────────────────────────────────────────────────────────────

const BASE_HOTEL_INPUT: HotelSearchInput = {
  destination: 'NYC',
  checkIn: '2026-06-01',
  checkOut: '2026-06-05',
  rooms: 1,
  adults: 2,
  currency: 'USD',
};

const BASE_CAR_INPUT: CarSearchInput = {
  pickupLocation: 'JFK',
  pickupDateTime: '2026-06-01T10:00:00Z',
  dropoffDateTime: '2026-06-05T10:00:00Z',
};

function makeHotel(overrides: Partial<HotelOffer> & { hotelId: string; source: string }): HotelOffer {
  return {
    hotelId: overrides.hotelId,
    name: `Hotel ${overrides.hotelId}`,
    starRating: 4,
    ratePerNight: '200.00',
    currency: 'USD',
    roomType: 'STANDARD',
    cancellationPolicy: 'Free cancellation until 24h before',
    source: overrides.source,
    ...overrides,
  };
}

function makeCar(overrides: Partial<CarOffer> & { carId: string; source: string }): CarOffer {
  return {
    carId: overrides.carId,
    category: 'ECONOMY',
    supplier: 'HERTZ',
    dailyRate: '45.00',
    totalRate: '180.00',
    currency: 'USD',
    features: ['AC', 'automatic'],
    source: overrides.source,
    ...overrides,
  };
}

function makeHotelAdapter(name: string, offers: HotelOffer[]): HotelAdapter {
  return {
    name,
    async searchHotels() {
      return offers;
    },
  };
}

function makeFailingHotelAdapter(name: string, msg = 'boom'): HotelAdapter {
  return {
    name,
    async searchHotels() {
      throw new Error(msg);
    },
  };
}

function makeSlowHotelAdapter(name: string, delayMs: number, offers: HotelOffer[] = []): HotelAdapter {
  return {
    name,
    searchHotels: () =>
      new Promise((resolve) => setTimeout(() => resolve(offers), delayMs)),
  };
}

function makeCarAdapter(name: string, offers: CarOffer[]): CarAdapter {
  return {
    name,
    async searchCars() {
      return offers;
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────────

describe('HotelCarSearchAgent (1.7)', () => {
  describe('hotel search', () => {
    it('returns results from a single hotel adapter', async () => {
      const adapter = makeHotelAdapter('haip', [
        makeHotel({ hotelId: 'h1', source: 'haip' }),
      ]);
      const agent = new HotelCarSearchAgent({ hotelAdapters: [adapter] });
      await agent.initialize();

      const r = await agent.execute({ data: { operation: 'searchHotels', hotel: BASE_HOTEL_INPUT } });
      const out = r.data.hotelResults!;

      expect(out.noAdaptersConfigured).toBe(false);
      expect(out.hotels).toHaveLength(1);
      expect(out.hotels[0]!.source).toBe('haip');
      expect(out.adapterSummary).toHaveLength(1);
      expect(out.adapterSummary![0]!.offerCount).toBe(1);
      expect(out.adapterSummary![0]!.error).toBeUndefined();
      expect(r.confidence).toBe(1.0);
    });

    it('merges results from two adapters and tags source', async () => {
      const a = makeHotelAdapter('haip', [makeHotel({ hotelId: 'h1', source: 'haip', ratePerNight: '150.00' })]);
      const b = makeHotelAdapter('booking', [makeHotel({ hotelId: 'h2', source: 'booking', ratePerNight: '250.00' })]);
      const agent = new HotelCarSearchAgent({ hotelAdapters: [a, b] });
      await agent.initialize();

      const r = await agent.execute({ data: { operation: 'searchHotels', hotel: BASE_HOTEL_INPUT } });
      const out = r.data.hotelResults!;

      expect(out.hotels).toHaveLength(2);
      const sources = out.hotels.map((h) => h.source).sort();
      expect(sources).toEqual(['booking', 'haip']);
      expect(out.adapterSummary).toHaveLength(2);
    });

    it('returns noAdaptersConfigured when no hotel adapters registered', async () => {
      const agent = new HotelCarSearchAgent({ hotelAdapters: [] });
      await agent.initialize();

      const r = await agent.execute({ data: { operation: 'searchHotels', hotel: BASE_HOTEL_INPUT } });
      const out = r.data.hotelResults!;

      expect(out.noAdaptersConfigured).toBe(true);
      expect(out.hotels).toHaveLength(0);
      expect(r.confidence).toBe(0.5);
    });

    it('filters hotels below minimum star rating', async () => {
      const adapter = makeHotelAdapter('haip', [
        makeHotel({ hotelId: 'low', source: 'haip', starRating: 2 }),
        makeHotel({ hotelId: 'mid', source: 'haip', starRating: 3 }),
        makeHotel({ hotelId: 'high', source: 'haip', starRating: 5 }),
      ]);
      const agent = new HotelCarSearchAgent({ hotelAdapters: [adapter] });
      await agent.initialize();

      const r = await agent.execute({
        data: {
          operation: 'searchHotels',
          hotel: { ...BASE_HOTEL_INPUT, starRating: 4 },
        },
      });
      const out = r.data.hotelResults!;
      expect(out.hotels.map((h) => h.hotelId)).toEqual(['high']);
    });

    it('filters hotels above maxRatePerNight', async () => {
      const adapter = makeHotelAdapter('haip', [
        makeHotel({ hotelId: 'cheap', source: 'haip', ratePerNight: '100.00' }),
        makeHotel({ hotelId: 'mid', source: 'haip', ratePerNight: '250.00' }),
        makeHotel({ hotelId: 'lux', source: 'haip', ratePerNight: '500.00' }),
      ]);
      const agent = new HotelCarSearchAgent({ hotelAdapters: [adapter] });
      await agent.initialize();

      const r = await agent.execute({
        data: {
          operation: 'searchHotels',
          hotel: { ...BASE_HOTEL_INPUT, maxRatePerNight: '300.00' },
        },
      });
      const out = r.data.hotelResults!;
      expect(out.hotels.map((h) => h.hotelId)).toEqual(['cheap', 'mid']);
    });

    it('sorts by price ascending by default', async () => {
      const adapter = makeHotelAdapter('haip', [
        makeHotel({ hotelId: 'b', source: 'haip', ratePerNight: '300.00' }),
        makeHotel({ hotelId: 'a', source: 'haip', ratePerNight: '100.00' }),
        makeHotel({ hotelId: 'c', source: 'haip', ratePerNight: '200.00' }),
      ]);
      const agent = new HotelCarSearchAgent({ hotelAdapters: [adapter] });
      await agent.initialize();

      const r = await agent.execute({ data: { operation: 'searchHotels', hotel: BASE_HOTEL_INPUT } });
      expect(r.data.hotelResults!.hotels.map((h) => h.hotelId)).toEqual(['a', 'c', 'b']);
    });

    it('sorts by rating descending when requested', async () => {
      const adapter = makeHotelAdapter('haip', [
        makeHotel({ hotelId: '2', source: 'haip', starRating: 2 }),
        makeHotel({ hotelId: '5', source: 'haip', starRating: 5 }),
        makeHotel({ hotelId: '3', source: 'haip', starRating: 3 }),
      ]);
      const agent = new HotelCarSearchAgent({ hotelAdapters: [adapter] });
      await agent.initialize();

      const r = await agent.execute({
        data: {
          operation: 'searchHotels',
          hotel: { ...BASE_HOTEL_INPUT, sortBy: 'rating' },
        },
      });
      expect(r.data.hotelResults!.hotels.map((h) => h.hotelId)).toEqual(['5', '3', '2']);
    });

    it('adapter timeout produces partial results with per-adapter error', async () => {
      const fast = makeHotelAdapter('fast', [makeHotel({ hotelId: 'h1', source: 'fast' })]);
      const slow = makeSlowHotelAdapter('slow', 200, [makeHotel({ hotelId: 'h2', source: 'slow' })]);
      const agent = new HotelCarSearchAgent({
        hotelAdapters: [fast, slow],
        timeoutMs: 50,
      });
      await agent.initialize();

      const r = await agent.execute({ data: { operation: 'searchHotels', hotel: BASE_HOTEL_INPUT } });
      const out = r.data.hotelResults!;

      expect(out.hotels.map((h) => h.source)).toEqual(['fast']);
      const slowSummary = out.adapterSummary!.find((s) => s.adapter === 'slow')!;
      expect(slowSummary.error).toMatch(/timed out/);
      expect(r.confidence).toBe(0.8); // partial success
    });

    it('all adapters fail returns empty with confidence 0.5', async () => {
      const a = makeFailingHotelAdapter('a', 'a-error');
      const b = makeFailingHotelAdapter('b', 'b-error');
      const agent = new HotelCarSearchAgent({ hotelAdapters: [a, b] });
      await agent.initialize();

      const r = await agent.execute({ data: { operation: 'searchHotels', hotel: BASE_HOTEL_INPUT } });
      const out = r.data.hotelResults!;
      expect(out.hotels).toHaveLength(0);
      expect(out.noAdaptersConfigured).toBe(false);
      expect(out.adapterSummary!.every((s) => s.error !== undefined)).toBe(true);
      expect(r.confidence).toBe(0.5);
    });
  });

  describe('car search', () => {
    it('returns results from a single car adapter', async () => {
      const adapter = makeCarAdapter('hertz', [makeCar({ carId: 'c1', source: 'hertz' })]);
      const agent = new HotelCarSearchAgent({ carAdapters: [adapter] });
      await agent.initialize();

      const r = await agent.execute({ data: { operation: 'searchCars', car: BASE_CAR_INPUT } });
      expect(r.data.carResults!.cars).toHaveLength(1);
      expect(r.data.carResults!.cars[0]!.source).toBe('hertz');
    });

    it('filters cars by category', async () => {
      const adapter = makeCarAdapter('hertz', [
        makeCar({ carId: 'e', source: 'hertz', category: 'ECONOMY' }),
        makeCar({ carId: 'l', source: 'hertz', category: 'LUXURY' }),
        makeCar({ carId: 's', source: 'hertz', category: 'SUV' }),
      ]);
      const agent = new HotelCarSearchAgent({ carAdapters: [adapter] });
      await agent.initialize();

      const r = await agent.execute({
        data: {
          operation: 'searchCars',
          car: { ...BASE_CAR_INPUT, carCategory: 'SUV' },
        },
      });
      expect(r.data.carResults!.cars.map((c) => c.carId)).toEqual(['s']);
    });

    it('sorts cars by daily rate ascending by default', async () => {
      const adapter = makeCarAdapter('hertz', [
        makeCar({ carId: 'exp', source: 'hertz', dailyRate: '100.00' }),
        makeCar({ carId: 'cheap', source: 'hertz', dailyRate: '30.00' }),
        makeCar({ carId: 'mid', source: 'hertz', dailyRate: '60.00' }),
      ]);
      const agent = new HotelCarSearchAgent({ carAdapters: [adapter] });
      await agent.initialize();

      const r = await agent.execute({ data: { operation: 'searchCars', car: BASE_CAR_INPUT } });
      expect(r.data.carResults!.cars.map((c) => c.carId)).toEqual(['cheap', 'mid', 'exp']);
    });
  });

  describe('input validation', () => {
    it('throws on invalid operation', async () => {
      const agent = new HotelCarSearchAgent();
      await agent.initialize();
      // @ts-expect-error — intentionally invalid
      await expect(agent.execute({ data: { operation: 'searchRockets' } })).rejects.toThrow(
        /operation/,
      );
    });

    it('throws when searchHotels op is missing hotel input', async () => {
      const agent = new HotelCarSearchAgent();
      await agent.initialize();
      await expect(agent.execute({ data: { operation: 'searchHotels' } })).rejects.toThrow(
        /hotel/,
      );
    });

    it('throws when searchCars op is missing car input', async () => {
      const agent = new HotelCarSearchAgent();
      await agent.initialize();
      await expect(agent.execute({ data: { operation: 'searchCars' } })).rejects.toThrow(
        /car/,
      );
    });

    it('throws AgentNotInitializedError before initialize()', async () => {
      const agent = new HotelCarSearchAgent();
      await expect(
        agent.execute({ data: { operation: 'searchHotels', hotel: BASE_HOTEL_INPUT } }),
      ).rejects.toThrow(/not been initialized/);
    });
  });

  describe('agent identity + health', () => {
    it('has correct id, name, version', () => {
      const agent = new HotelCarSearchAgent();
      expect(agent.id).toBe('1.7');
      expect(agent.name).toBe('Hotel & Car Search');
      expect(agent.version).toBe('0.2.0');
    });

    it('health reports degraded when no adapters configured', async () => {
      const agent = new HotelCarSearchAgent();
      await agent.initialize();
      const h = await agent.health();
      expect(h.status).toBe('degraded');
    });

    it('health reports healthy when adapters are configured', async () => {
      const agent = new HotelCarSearchAgent({
        hotelAdapters: [makeHotelAdapter('x', [])],
      });
      await agent.initialize();
      const h = await agent.health();
      expect(h.status).toBe('healthy');
    });
  });
});
