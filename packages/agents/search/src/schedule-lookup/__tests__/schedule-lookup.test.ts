/**
 * Schedule Lookup — Unit Tests
 *
 * Agent 1.2: Flight schedule lookup with SSIM operating days,
 * codeshare detection, and connection discovery.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ScheduleLookup, parseSsimDays, operatesOnDate, getDayOfWeek } from '../index.js';

let agent: ScheduleLookup;

beforeAll(async () => {
  agent = new ScheduleLookup();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

describe('Schedule Lookup', () => {
  describe('SSIM parsing utilities', () => {
    it('parses all-days SSIM "1111111"', () => {
      const days = parseSsimDays('1111111');
      expect(days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    });

    it('parses weekdays-only SSIM "1111100"', () => {
      const days = parseSsimDays('1111100');
      expect(days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    });

    it('parses weekends-only SSIM "0000011"', () => {
      const days = parseSsimDays('0000011');
      expect(days).toEqual(['sat', 'sun']);
    });

    it('parses single-day SSIM "0010000" (Wednesday)', () => {
      const days = parseSsimDays('0010000');
      expect(days).toEqual(['wed']);
    });

    it('checks operatesOnDate correctly for a Monday', () => {
      // 2025-06-16 is a Monday
      expect(operatesOnDate('1111111', '2025-06-16')).toBe(true);
      expect(operatesOnDate('0000011', '2025-06-16')).toBe(false);
    });

    it('checks operatesOnDate correctly for a Saturday', () => {
      // 2025-06-14 is a Saturday
      expect(operatesOnDate('0000011', '2025-06-14')).toBe(true);
      expect(operatesOnDate('1111100', '2025-06-14')).toBe(false);
    });

    it('getDayOfWeek returns correct day', () => {
      // 2025-06-15 is a Sunday
      expect(getDayOfWeek('2025-06-15')).toBe('sun');
      // 2025-06-16 is a Monday
      expect(getDayOfWeek('2025-06-16')).toBe('mon');
    });
  });

  describe('Direct flight lookup', () => {
    it('finds JFK-LAX direct flights on a weekday', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          date: '2025-06-16', // Monday
        },
      });

      expect(result.data.flights.length).toBeGreaterThan(0);
      expect(result.data.operates_on_date).toBe(true);
      // Should include UA and DL directs + codeshare (weekday)
      const carriers = result.data.flights.map((f) => f.carrier);
      expect(carriers).toContain('UA');
      expect(carriers).toContain('DL');
    });

    it('finds weekend-only flights on Saturday', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          date: '2025-06-14', // Saturday
        },
      });

      // AA 500 operates only on weekends
      const aaFlight = result.data.flights.find(
        (f) => f.carrier === 'AA' && f.flight_number === '500',
      );
      expect(aaFlight).toBeDefined();
      expect(aaFlight!.schedule.operating_days_ssim).toBe('0000011');
    });

    it('excludes weekend-only flights on a Wednesday', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          date: '2025-06-18', // Wednesday
        },
      });

      const aaFlight = result.data.flights.find(
        (f) => f.carrier === 'AA' && f.flight_number === '500',
      );
      expect(aaFlight).toBeUndefined();
    });

    it('finds LHR-CDG flights', async () => {
      const result = await agent.execute({
        data: {
          origin: 'LHR',
          destination: 'CDG',
          date: '2025-06-16', // Monday
        },
      });

      expect(result.data.flights.length).toBeGreaterThan(0);
      expect(result.data.flights[0]!.carrier).toBe('BA');
    });

    it('returns empty for unknown route', async () => {
      const result = await agent.execute({
        data: {
          origin: 'XXX',
          destination: 'YYY',
          date: '2025-06-16',
        },
      });

      expect(result.data.flights.length).toBe(0);
      expect(result.data.operates_on_date).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('Carrier and flight number filtering', () => {
    it('filters to specific carrier', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          date: '2025-06-16',
          carrier: 'UA',
        },
      });

      for (const flight of result.data.flights) {
        expect(flight.carrier).toBe('UA');
      }
    });

    it('filters to specific flight number', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          date: '2025-06-16',
          carrier: 'UA',
          flight_number: '1234',
        },
      });

      expect(result.data.flights.length).toBe(1);
      expect(result.data.flights[0]!.flight_number).toBe('1234');
    });
  });

  describe('Codeshare handling', () => {
    it('includes codeshare flights by default', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          date: '2025-06-16', // Monday - LH codeshare operates
        },
      });

      const codeshare = result.data.flights.find((f) => f.is_codeshare);
      expect(codeshare).toBeDefined();
      expect(codeshare!.carrier).toBe('LH');
      expect(codeshare!.operating_carrier).toBe('UA');
    });

    it('excludes codeshare flights when include_codeshares=false', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          date: '2025-06-16',
          include_codeshares: false,
        },
      });

      for (const flight of result.data.flights) {
        expect(flight.is_codeshare).toBe(false);
      }
    });

    it('codeshare has operating carrier details', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          date: '2025-06-16',
        },
      });

      const lhFlight = result.data.flights.find((f) => f.carrier === 'LH');
      expect(lhFlight).toBeDefined();
      expect(lhFlight!.operating_carrier).toBe('UA');
      expect(lhFlight!.operating_flight_number).toBe('1234');
    });
  });

  describe('Connection discovery', () => {
    it('finds connecting options when include_connections=true', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          date: '2025-06-16',
          include_connections: true,
        },
      });

      expect(result.data.connections).not.toBeNull();
      expect(result.data.connections!.length).toBeGreaterThan(0);

      const conn = result.data.connections![0]!;
      expect(conn.first_leg.origin).toBe('JFK');
      expect(conn.second_leg.destination).toBe('LAX');
      expect(conn.connection_airport).toBeTruthy();
      expect(conn.connection_minutes).toBeGreaterThanOrEqual(45);
      expect(conn.total_duration_minutes).toBeGreaterThan(0);
    });

    it('connections are null when include_connections=false (default)', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          date: '2025-06-16',
        },
      });

      expect(result.data.connections).toBeNull();
    });

    it('connection via ORD has correct airport', async () => {
      const result = await agent.execute({
        data: {
          origin: 'JFK',
          destination: 'LAX',
          date: '2025-06-16',
          include_connections: true,
        },
      });

      const ordConnection = result.data.connections!.find(
        (c) => c.connection_airport === 'ORD',
      );
      expect(ordConnection).toBeDefined();
      expect(ordConnection!.first_leg.destination).toBe('ORD');
      expect(ordConnection!.second_leg.origin).toBe('ORD');
    });
  });

  describe('Input validation', () => {
    it('rejects empty origin', async () => {
      await expect(
        agent.execute({ data: { origin: '', destination: 'LAX', date: '2025-06-16' } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid origin format', async () => {
      await expect(
        agent.execute({ data: { origin: '1234', destination: 'LAX', date: '2025-06-16' } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects empty destination', async () => {
      await expect(
        agent.execute({ data: { origin: 'JFK', destination: '', date: '2025-06-16' } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid date format', async () => {
      await expect(
        agent.execute({ data: { origin: 'JFK', destination: 'LAX', date: 'June 16' } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects flight_number without carrier', async () => {
      await expect(
        agent.execute({
          data: { origin: 'JFK', destination: 'LAX', date: '2025-06-16', flight_number: '1234' },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('1.2');
      expect(agent.name).toBe('Schedule Lookup');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy status', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({
        data: { origin: 'JFK', destination: 'LAX', date: '2025-06-16' },
      });
      expect(result.metadata!['agent_id']).toBe('1.2');
    });

    it('throws when not initialized', async () => {
      const uninit = new ScheduleLookup();
      await expect(
        uninit.execute({ data: { origin: 'JFK', destination: 'LAX', date: '2025-06-16' } }),
      ).rejects.toThrow('not been initialized');
    });

    it('reports unhealthy when not initialized', async () => {
      const uninit = new ScheduleLookup();
      const health = await uninit.health();
      expect(health.status).toBe('unhealthy');
    });
  });
});
