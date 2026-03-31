/**
 * Duty of Care — Unit Tests (Agent 8.5)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DutyCareAgent } from '../index.js';
import type { DutyCareInput, TravelerItinerary } from '../types.js';

let agent: DutyCareAgent;

beforeAll(async () => {
  agent = new DutyCareAgent();
  await agent.initialize();
});

afterAll(() => { agent.destroy(); });

beforeEach(() => {
  const store = agent.getItineraryStore();
  store.clear();

  // Seed fixture data
  const itineraries: TravelerItinerary[] = [
    {
      traveler_id: 'TVL001', given_name: 'JOHN', surname: 'SMITH',
      contact_phone: '+14155551234', contact_email: 'john@example.com',
      corporate_id: 'CORP001', department: 'Engineering',
      segments: [{
        carrier: 'BA', flight_number: '115', origin: 'LHR', destination: 'JFK',
        departure_date: '2026-06-15', departure_time: '09:00',
        arrival_date: '2026-06-15', arrival_time: '12:00', status: 'HK',
      }],
    },
    {
      traveler_id: 'TVL002', given_name: 'MARY', surname: 'JONES',
      contact_phone: '+14155555678', contact_email: 'mary@example.com',
      corporate_id: 'CORP001', department: 'Sales',
      segments: [{
        carrier: 'AF', flight_number: '007', origin: 'CDG', destination: 'JFK',
        departure_date: '2026-06-15', departure_time: '10:00',
        arrival_date: '2026-06-15', arrival_time: '13:00', status: 'HK',
      }],
    },
    {
      traveler_id: 'TVL003', given_name: 'BOB', surname: 'BROWN',
      contact_phone: '+6512345678', contact_email: 'bob@example.com',
      corporate_id: 'CORP002', department: 'HR',
      segments: [{
        carrier: 'SQ', flight_number: '25', origin: 'SIN', destination: 'LHR',
        departure_date: '2026-06-16', departure_time: '22:00',
        arrival_date: '2026-06-17', arrival_time: '06:00', status: 'HK',
      }],
    },
  ];

  for (const itin of itineraries) {
    store.set(itin.traveler_id, itin);
  }
});

describe('Duty of Care', () => {
  describe('locate_travelers', () => {
    it('finds travelers at LHR', async () => {
      const res = await agent.execute({ data: {
        operation: 'locate_travelers', airport_code: 'LHR',
        date: '2026-06-15T08:00:00Z', window_hours: 4,
      } });
      expect(res.data.travelers!.length).toBeGreaterThanOrEqual(1);
      expect(res.data.travelers!.some((t) => t.traveler_id === 'TVL001')).toBe(true);
    });

    it('finds travelers at JFK (arrival)', async () => {
      const res = await agent.execute({ data: {
        operation: 'locate_travelers', airport_code: 'JFK',
        date: '2026-06-15T12:00:00Z', window_hours: 4,
      } });
      expect(res.data.travelers!.some((t) => t.traveler_id === 'TVL001')).toBe(true);
    });

    it('returns empty when no match', async () => {
      const res = await agent.execute({ data: {
        operation: 'locate_travelers', airport_code: 'NRT',
        date: '2026-06-15T08:00:00Z', window_hours: 4,
      } });
      expect(res.data.travelers!).toHaveLength(0);
    });

    it('filters by corporate_id', async () => {
      const res = await agent.execute({ data: {
        operation: 'locate_travelers', date: '2026-06-15T08:00:00Z',
        window_hours: 24, corporate_id: 'CORP002',
      } });
      expect(res.data.travelers!.every((t) => t.corporate_id === 'CORP002')).toBe(true);
    });

    it('rejects invalid airport code', async () => {
      await expect(agent.execute({ data: {
        operation: 'locate_travelers', airport_code: 'INVALID',
        date: '2026-06-15T08:00:00Z',
      } })).rejects.toThrow('INVALID_AIRPORT_CODE');
    });

    it('includes contact info in results', async () => {
      const res = await agent.execute({ data: {
        operation: 'locate_travelers', airport_code: 'LHR',
        date: '2026-06-15T08:00:00Z', window_hours: 4,
      } });
      const traveler = res.data.travelers!.find((t) => t.traveler_id === 'TVL001');
      expect(traveler!.contact_phone).toBe('+14155551234');
      expect(traveler!.contact_email).toBe('john@example.com');
    });

    it('includes department and corporate_id', async () => {
      const res = await agent.execute({ data: {
        operation: 'locate_travelers', airport_code: 'LHR',
        date: '2026-06-15T08:00:00Z', window_hours: 4,
      } });
      const t = res.data.travelers!.find((tr) => tr.traveler_id === 'TVL001');
      expect(t!.department).toBe('Engineering');
    });
  });

  describe('get_traveler_itinerary', () => {
    it('returns itinerary', async () => {
      const res = await agent.execute({ data: { operation: 'get_traveler_itinerary', traveler_id: 'TVL001' } });
      expect(res.data.itinerary!.segments).toHaveLength(1);
      expect(res.data.itinerary!.given_name).toBe('JOHN');
    });

    it('throws for unknown traveler', async () => {
      await expect(agent.execute({ data: { operation: 'get_traveler_itinerary', traveler_id: 'NONE' } })).rejects.toThrow('TRAVELER_NOT_FOUND');
    });
  });

  describe('assess_destination_risk', () => {
    it('returns low risk for US', async () => {
      const res = await agent.execute({ data: { operation: 'assess_destination_risk', destination_country: 'US' } });
      expect(res.data.risk!.risk_level).toBe('low');
    });

    it('returns medium risk for Mexico', async () => {
      const res = await agent.execute({ data: { operation: 'assess_destination_risk', destination_country: 'MX' } });
      expect(res.data.risk!.risk_level).toBe('medium');
    });

    it('returns critical for Afghanistan', async () => {
      const res = await agent.execute({ data: { operation: 'assess_destination_risk', destination_country: 'AF' } });
      expect(res.data.risk!.risk_level).toBe('critical');
      expect(res.warnings).toBeDefined();
    });

    it('returns medium for unknown country', async () => {
      const res = await agent.execute({ data: { operation: 'assess_destination_risk', destination_country: 'XX' } });
      expect(res.data.risk!.risk_level).toBe('medium');
    });

    it('rejects invalid country code', async () => {
      await expect(agent.execute({ data: { operation: 'assess_destination_risk', destination_country: 'INVALID' } })).rejects.toThrow('Invalid');
    });
  });

  describe('mark_accounted_for', () => {
    it('marks traveler as accounted for', async () => {
      const res = await agent.execute({ data: {
        operation: 'mark_accounted_for', traveler_id: 'TVL001', incident_id: 'INC001',
      } });
      expect(res.data.accounted_for).toBe(true);
    });

    it('is idempotent', async () => {
      await agent.execute({ data: { operation: 'mark_accounted_for', traveler_id: 'TVL001', incident_id: 'INC001' } });
      const res = await agent.execute({ data: { operation: 'mark_accounted_for', traveler_id: 'TVL001', incident_id: 'INC001' } });
      expect(res.data.accounted_for).toBe(true);
    });

    it('locate shows accounted_for after marking', async () => {
      await agent.execute({ data: { operation: 'mark_accounted_for', traveler_id: 'TVL001', incident_id: 'INC001' } });
      const res = await agent.execute({ data: {
        operation: 'locate_travelers', airport_code: 'LHR',
        date: '2026-06-15T08:00:00Z', window_hours: 4, incident_id: 'INC001',
      } as DutyCareInput });
      const t = res.data.travelers!.find((tr) => tr.traveler_id === 'TVL001');
      expect(t!.accounted_for).toBe(true);
    });
  });

  describe('agent compliance', () => {
    it('has correct id/name', () => { expect(agent.id).toBe('8.5'); expect(agent.name).toBe('Duty of Care'); });
    it('reports healthy', async () => { expect((await agent.health()).status).toBe('healthy'); });
    it('throws when not initialized', async () => {
      const u = new DutyCareAgent();
      await expect(u.execute({ data: { operation: 'locate_travelers', date: '2026-06-15' } })).rejects.toThrow('not been initialized');
    });
  });
});
