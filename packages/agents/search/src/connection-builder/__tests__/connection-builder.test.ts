/**
 * Connection Builder — Unit Tests
 *
 * Agent 1.3: MCT validation, connection quality scoring, interline checking.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ConnectionBuilder } from '../index.js';
import type { FlightSegment } from '@otaip/core';

let agent: ConnectionBuilder;

beforeAll(async () => {
  agent = new ConnectionBuilder();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

// Helper to create flight segments
function makeSegment(overrides: Partial<FlightSegment> & { carrier: string; departure_time: string; arrival_time: string }): FlightSegment {
  return {
    flight_number: '100',
    origin: 'JFK',
    destination: 'ORD',
    duration_minutes: 150,
    ...overrides,
  };
}

describe('Connection Builder', () => {
  describe('MCT validation — valid connections', () => {
    it('validates a valid domestic connection at ORD (UA→UA)', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'UA',
            origin: 'JFK',
            destination: 'ORD',
            arrival_time: '2025-06-15T08:30:00-05:00',
            departure_time: '2025-06-15T07:00:00-04:00',
          }),
          departing_segment: makeSegment({
            carrier: 'UA',
            origin: 'ORD',
            destination: 'LAX',
            departure_time: '2025-06-15T10:00:00-05:00',
            arrival_time: '2025-06-15T12:15:00-07:00',
          }),
          connection_airport: 'ORD',
        },
      });

      expect(result.data.validation.valid).toBe(true);
      expect(result.data.validation.available_minutes).toBe(90);
      // UA→UA at ORD domestic = 50 minutes (carrier-specific)
      expect(result.data.validation.required_mct_minutes).toBe(50);
      expect(result.data.validation.buffer_minutes).toBe(40);
    });

    it('validates a valid connection at ATL (short MCT)', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'DL',
            arrival_time: '2025-06-15T10:00:00-04:00',
            departure_time: '2025-06-15T08:00:00-04:00',
          }),
          departing_segment: makeSegment({
            carrier: 'DL',
            departure_time: '2025-06-15T11:00:00-04:00',
            arrival_time: '2025-06-15T14:00:00-07:00',
          }),
          connection_airport: 'ATL',
        },
      });

      // ATL domestic default = 45 min, available = 60 min
      expect(result.data.validation.valid).toBe(true);
      expect(result.data.validation.required_mct_minutes).toBe(45);
    });
  });

  describe('MCT validation — invalid connections', () => {
    it('flags connection below MCT', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'AA',
            arrival_time: '2025-06-15T10:00:00-04:00',
            departure_time: '2025-06-15T08:00:00-04:00',
          }),
          departing_segment: makeSegment({
            carrier: 'AA',
            departure_time: '2025-06-15T10:30:00-04:00',
            arrival_time: '2025-06-15T13:00:00-07:00',
          }),
          connection_airport: 'JFK',
        },
      });

      // JFK domestic default = 75 min, available = 30 min
      expect(result.data.validation.valid).toBe(false);
      expect(result.data.validation.available_minutes).toBe(30);
      expect(result.data.validation.buffer_minutes).toBeLessThan(0);
    });

    it('includes warning for invalid connection', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'AA',
            arrival_time: '2025-06-15T10:00:00-04:00',
            departure_time: '2025-06-15T08:00:00-04:00',
          }),
          departing_segment: makeSegment({
            carrier: 'AA',
            departure_time: '2025-06-15T10:30:00-04:00',
            arrival_time: '2025-06-15T13:00:00-07:00',
          }),
          connection_airport: 'JFK',
        },
      });

      expect(result.data.warnings.some((w) => w.includes('below MCT'))).toBe(true);
    });
  });

  describe('MCT hierarchy', () => {
    it('uses carrier-specific MCT for UA→UA at ORD', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'UA',
            arrival_time: '2025-06-15T10:00:00-05:00',
            departure_time: '2025-06-15T08:00:00-04:00',
          }),
          departing_segment: makeSegment({
            carrier: 'UA',
            departure_time: '2025-06-15T11:00:00-05:00',
            arrival_time: '2025-06-15T13:00:00-07:00',
          }),
          connection_airport: 'ORD',
        },
      });

      expect(result.data.validation.applied_rule).toContain('carrier-specific');
      expect(result.data.validation.required_mct_minutes).toBe(50);
    });

    it('uses airport default MCT for DL→DL at ORD (no carrier-specific rule)', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'DL',
            arrival_time: '2025-06-15T10:00:00-05:00',
            departure_time: '2025-06-15T08:00:00-04:00',
          }),
          departing_segment: makeSegment({
            carrier: 'DL',
            departure_time: '2025-06-15T11:30:00-05:00',
            arrival_time: '2025-06-15T14:00:00-07:00',
          }),
          connection_airport: 'ORD',
        },
      });

      expect(result.data.validation.applied_rule).toContain('airport default');
      expect(result.data.validation.required_mct_minutes).toBe(60);
    });

    it('falls back to IATA default for unknown airport', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'AA',
            arrival_time: '2025-06-15T10:00:00',
            departure_time: '2025-06-15T08:00:00',
          }),
          departing_segment: makeSegment({
            carrier: 'AA',
            departure_time: '2025-06-15T12:00:00',
            arrival_time: '2025-06-15T15:00:00',
          }),
          connection_airport: 'XYZ',
        },
      });

      expect(result.data.validation.applied_rule).toContain('IATA default');
      expect(result.data.validation.required_mct_minutes).toBe(60);
    });
  });

  describe('Connection quality scoring', () => {
    it('scores a good same-carrier connection highly', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'UA',
            arrival_time: '2025-06-15T10:00:00-05:00',
            departure_time: '2025-06-15T08:00:00-04:00',
          }),
          departing_segment: makeSegment({
            carrier: 'UA',
            departure_time: '2025-06-15T11:30:00-05:00',
            arrival_time: '2025-06-15T14:00:00-07:00',
          }),
          connection_airport: 'ORD',
        },
      });

      expect(result.data.quality.score).toBeGreaterThan(0.7);
      expect(result.data.quality.factors.length).toBeGreaterThan(0);
    });

    it('scores an invalid connection as 0 for time factor', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'AA',
            arrival_time: '2025-06-15T10:00:00',
            departure_time: '2025-06-15T08:00:00',
          }),
          departing_segment: makeSegment({
            carrier: 'AA',
            departure_time: '2025-06-15T10:15:00',
            arrival_time: '2025-06-15T13:00:00',
          }),
          connection_airport: 'JFK',
        },
      });

      const timeFactor = result.data.quality.factors.find((f) => f.name === 'connection_time');
      expect(timeFactor).toBeDefined();
      expect(timeFactor!.score).toBe(0);
    });

    it('warns about very long connections', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'UA',
            arrival_time: '2025-06-15T08:00:00',
            departure_time: '2025-06-15T06:00:00',
          }),
          departing_segment: makeSegment({
            carrier: 'UA',
            departure_time: '2025-06-15T16:00:00',
            arrival_time: '2025-06-15T19:00:00',
          }),
          connection_airport: 'ORD',
        },
      });

      expect(result.data.warnings.some((w) => w.includes('Long connection'))).toBe(true);
    });

    it('warns about tight connections', async () => {
      // UA→UA at ORD, MCT=50, available=55 → 5 min buffer
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'UA',
            arrival_time: '2025-06-15T10:00:00-05:00',
            departure_time: '2025-06-15T08:00:00-04:00',
          }),
          departing_segment: makeSegment({
            carrier: 'UA',
            departure_time: '2025-06-15T10:55:00-05:00',
            arrival_time: '2025-06-15T13:00:00-07:00',
          }),
          connection_airport: 'ORD',
        },
      });

      expect(result.data.validation.valid).toBe(true);
      expect(result.data.warnings.some((w) => w.includes('tight'))).toBe(true);
    });
  });

  describe('Interline checking', () => {
    it('returns null interline for same carrier', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'UA',
            arrival_time: '2025-06-15T10:00:00',
            departure_time: '2025-06-15T08:00:00',
          }),
          departing_segment: makeSegment({
            carrier: 'UA',
            departure_time: '2025-06-15T12:00:00',
            arrival_time: '2025-06-15T15:00:00',
          }),
          connection_airport: 'ORD',
        },
      });

      expect(result.data.interline).toBeNull();
    });

    it('detects same-alliance interline (Star Alliance)', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'UA',
            arrival_time: '2025-06-15T10:00:00',
            departure_time: '2025-06-15T08:00:00',
          }),
          departing_segment: makeSegment({
            carrier: 'LH',
            departure_time: '2025-06-15T12:00:00',
            arrival_time: '2025-06-15T15:00:00',
          }),
          connection_airport: 'FRA',
          is_interline: true,
        },
      });

      expect(result.data.interline).not.toBeNull();
      expect(result.data.interline!.same_alliance).toBe(true);
      expect(result.data.interline!.alliance).toBe('star_alliance');
      expect(result.data.interline!.interline_allowed).toBe(true);
    });

    it('detects different-alliance interline', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'UA',
            arrival_time: '2025-06-15T10:00:00',
            departure_time: '2025-06-15T08:00:00',
          }),
          departing_segment: makeSegment({
            carrier: 'BA',
            departure_time: '2025-06-15T12:00:00',
            arrival_time: '2025-06-15T15:00:00',
          }),
          connection_airport: 'LHR',
        },
      });

      expect(result.data.interline).not.toBeNull();
      expect(result.data.interline!.same_alliance).toBe(false);
    });
  });

  describe('Input validation', () => {
    it('rejects missing arriving_segment', async () => {
      await expect(
        agent.execute({
          data: {
            arriving_segment: null as unknown as FlightSegment,
            departing_segment: makeSegment({
              carrier: 'UA',
              departure_time: '2025-06-15T12:00:00',
              arrival_time: '2025-06-15T15:00:00',
            }),
            connection_airport: 'ORD',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid connection_airport', async () => {
      await expect(
        agent.execute({
          data: {
            arriving_segment: makeSegment({
              carrier: 'UA',
              arrival_time: '2025-06-15T10:00:00',
              departure_time: '2025-06-15T08:00:00',
            }),
            departing_segment: makeSegment({
              carrier: 'UA',
              departure_time: '2025-06-15T12:00:00',
              arrival_time: '2025-06-15T15:00:00',
            }),
            connection_airport: 'X',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(agent.id).toBe('1.3');
      expect(agent.name).toBe('Connection Builder');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy status', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({
        data: {
          arriving_segment: makeSegment({
            carrier: 'UA',
            arrival_time: '2025-06-15T10:00:00',
            departure_time: '2025-06-15T08:00:00',
          }),
          departing_segment: makeSegment({
            carrier: 'UA',
            departure_time: '2025-06-15T12:00:00',
            arrival_time: '2025-06-15T15:00:00',
          }),
          connection_airport: 'ORD',
        },
      });

      expect(result.metadata!['agent_id']).toBe('1.3');
    });

    it('throws when not initialized', async () => {
      const uninit = new ConnectionBuilder();
      await expect(
        uninit.execute({
          data: {
            arriving_segment: makeSegment({
              carrier: 'UA',
              arrival_time: '2025-06-15T10:00:00',
              departure_time: '2025-06-15T08:00:00',
            }),
            departing_segment: makeSegment({
              carrier: 'UA',
              departure_time: '2025-06-15T12:00:00',
              arrival_time: '2025-06-15T15:00:00',
            }),
            connection_airport: 'ORD',
          },
        }),
      ).rejects.toThrow('not been initialized');
    });

    it('reports unhealthy when not initialized', async () => {
      const uninit = new ConnectionBuilder();
      const health = await uninit.health();
      expect(health.status).toBe('unhealthy');
    });
  });
});
