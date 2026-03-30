/**
 * PNR Validation — Unit Tests
 *
 * Agent 3.3: 13 pre-ticketing validation checks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PnrValidation } from '../index.js';
import type { PnrValidationInput } from '../types.js';

let agent: PnrValidation;

beforeAll(async () => {
  agent = new PnrValidation();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

function makeValidPnr(): PnrValidationInput {
  return {
    record_locator: 'ABC123',
    passengers: [
      {
        pax_number: 1,
        last_name: 'Smith',
        first_name: 'John',
        passenger_type: 'ADT',
        date_of_birth: '1985-03-15',
        nationality: 'US',
        passport_number: 'P123456789',
        passport_expiry: '2030-01-01',
        gender: 'M',
      },
    ],
    segments: [
      {
        segment_number: 1,
        carrier: 'BA',
        flight_number: '115',
        origin: 'LHR',
        destination: 'JFK',
        departure_date: '2026-06-15',
        booking_class: 'Y',
        status: 'HK',
        is_international: true,
      },
    ],
    contact: { phone: '+44-20-7946-0958', email: 'john@example.com' },
    ticketing: { time_limit: '2026-06-10', arranged: true },
    fare: { total_fare: '450.00', segment_indices: [0] },
    validation_date: '2026-04-01',
  };
}

describe('PNR Validation', () => {
  describe('Check 1: Segment Status', () => {
    it('passes when all segments are HK', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      const check = result.data.checks.find((c) => c.check_id === 1)!;
      expect(check.passed).toBe(true);
    });

    it('fails when segment is UN', async () => {
      const pnr = makeValidPnr();
      pnr.segments[0]!.status = 'UN';
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 1)!;
      expect(check.passed).toBe(false);
      expect(check.severity).toBe('error');
    });

    it('fails when segment is HL (waitlisted)', async () => {
      const pnr = makeValidPnr();
      pnr.segments[0]!.status = 'HL';
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 1)!;
      expect(check.passed).toBe(false);
    });
  });

  describe('Check 2: TTL Not Expired', () => {
    it('passes when TTL is in the future', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      const check = result.data.checks.find((c) => c.check_id === 2)!;
      expect(check.passed).toBe(true);
    });

    it('fails when TTL has expired', async () => {
      const pnr = makeValidPnr();
      pnr.ticketing = { time_limit: '2026-03-01', arranged: true };
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 2)!;
      expect(check.passed).toBe(false);
      expect(check.message).toContain('expired');
    });

    it('fails when no ticketing data', async () => {
      const pnr = makeValidPnr();
      delete (pnr as Partial<PnrValidationInput>).ticketing;
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 2)!;
      expect(check.passed).toBe(false);
    });
  });

  describe('Check 3: No Duplicate Bookings', () => {
    it('passes with no duplicates', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      const check = result.data.checks.find((c) => c.check_id === 3)!;
      expect(check.passed).toBe(true);
    });

    it('fails when same pax on same flight twice', async () => {
      const pnr = makeValidPnr();
      pnr.segments.push({ ...pnr.segments[0]!, segment_number: 2 });
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 3)!;
      expect(check.passed).toBe(false);
      expect(check.message).toContain('Duplicate');
    });
  });

  describe('Check 4: No Orphan Segments', () => {
    it('passes with continuous routing', async () => {
      const pnr = makeValidPnr();
      pnr.segments.push({
        segment_number: 2, carrier: 'AA', flight_number: '100',
        origin: 'JFK', destination: 'LAX', departure_date: '2026-06-16',
        booking_class: 'Y', status: 'HK', is_international: false,
      });
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 4)!;
      expect(check.passed).toBe(true);
    });

    it('fails with routing gap', async () => {
      const pnr = makeValidPnr();
      pnr.segments.push({
        segment_number: 2, carrier: 'AA', flight_number: '200',
        origin: 'LAX', destination: 'SFO', departure_date: '2026-06-17',
        booking_class: 'Y', status: 'HK', is_international: false,
      });
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 4)!;
      expect(check.passed).toBe(false);
      expect(check.message).toContain('Orphan');
    });
  });

  describe('Check 5: APIS Completeness', () => {
    it('passes with complete APIS for international', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      const check = result.data.checks.find((c) => c.check_id === 5)!;
      expect(check.passed).toBe(true);
    });

    it('fails when passport missing for international', async () => {
      const pnr = makeValidPnr();
      delete pnr.passengers[0]!.passport_number;
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 5)!;
      expect(check.passed).toBe(false);
      expect(check.message).toContain('passport');
    });

    it('passes for domestic-only itinerary without passport', async () => {
      const pnr = makeValidPnr();
      pnr.segments[0]!.is_international = false;
      delete pnr.passengers[0]!.passport_number;
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 5)!;
      expect(check.passed).toBe(true);
    });
  });

  describe('Check 6: Infant Linked', () => {
    it('passes when no infants', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      const check = result.data.checks.find((c) => c.check_id === 6)!;
      expect(check.passed).toBe(true);
    });

    it('passes when infant correctly linked', async () => {
      const pnr = makeValidPnr();
      pnr.passengers.push({
        pax_number: 2, last_name: 'Smith', first_name: 'Baby',
        passenger_type: 'INF', infant_linked_to: 1,
      });
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 6)!;
      expect(check.passed).toBe(true);
    });

    it('fails when infant not linked', async () => {
      const pnr = makeValidPnr();
      pnr.passengers.push({
        pax_number: 2, last_name: 'Smith', first_name: 'Baby',
        passenger_type: 'INF',
      });
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 6)!;
      expect(check.passed).toBe(false);
    });
  });

  describe('Check 7: Name Format', () => {
    it('passes with valid names', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      const check = result.data.checks.find((c) => c.check_id === 7)!;
      expect(check.passed).toBe(true);
    });

    it('fails with special characters in name', async () => {
      const pnr = makeValidPnr();
      pnr.passengers[0]!.last_name = 'Smith@#$';
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 7)!;
      expect(check.passed).toBe(false);
    });
  });

  describe('Check 8: Married Segment Integrity', () => {
    it('passes with no married segments', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      const check = result.data.checks.find((c) => c.check_id === 8)!;
      expect(check.passed).toBe(true);
    });

    it('fails with mixed status in married group', async () => {
      const pnr = makeValidPnr();
      pnr.segments = [
        { ...pnr.segments[0]!, married_group: 'A', status: 'HK' },
        {
          segment_number: 2, carrier: 'BA', flight_number: '116',
          origin: 'JFK', destination: 'LHR', departure_date: '2026-06-20',
          booking_class: 'Y', status: 'UN', is_international: true, married_group: 'A',
        },
      ];
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 8)!;
      expect(check.passed).toBe(false);
      expect(check.message).toContain('mixed statuses');
    });
  });

  describe('Check 9: Fare-Segment Match', () => {
    it('passes when all segments covered', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      const check = result.data.checks.find((c) => c.check_id === 9)!;
      expect(check.passed).toBe(true);
    });

    it('fails when segment not covered by fare', async () => {
      const pnr = makeValidPnr();
      pnr.segments.push({
        segment_number: 2, carrier: 'AA', flight_number: '100',
        origin: 'JFK', destination: 'LAX', departure_date: '2026-06-16',
        booking_class: 'Y', status: 'HK', is_international: false,
      });
      // fare only covers segment 0
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 9)!;
      expect(check.passed).toBe(false);
    });
  });

  describe('Check 10: Contact Present', () => {
    it('passes with contact info', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      const check = result.data.checks.find((c) => c.check_id === 10)!;
      expect(check.passed).toBe(true);
    });

    it('fails without contact', async () => {
      const pnr = makeValidPnr();
      delete (pnr as Partial<PnrValidationInput>).contact;
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 10)!;
      expect(check.passed).toBe(false);
    });
  });

  describe('Check 11: Ticketing Arrangement', () => {
    it('passes when arranged', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      const check = result.data.checks.find((c) => c.check_id === 11)!;
      expect(check.passed).toBe(true);
    });

    it('fails when not arranged', async () => {
      const pnr = makeValidPnr();
      pnr.ticketing = { time_limit: '2026-06-10', arranged: false };
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 11)!;
      expect(check.passed).toBe(false);
    });
  });

  describe('Check 12: Advance Purchase', () => {
    it('passes when no deadline', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      const check = result.data.checks.find((c) => c.check_id === 12)!;
      expect(check.passed).toBe(true);
    });

    it('passes when deadline not expired', async () => {
      const pnr = makeValidPnr();
      pnr.fare = { ...pnr.fare!, advance_purchase_deadline: '2026-05-01' };
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 12)!;
      expect(check.passed).toBe(true);
    });

    it('fails when deadline expired', async () => {
      const pnr = makeValidPnr();
      pnr.fare = { ...pnr.fare!, advance_purchase_deadline: '2026-03-15' };
      const result = await agent.execute({ data: pnr });
      const check = result.data.checks.find((c) => c.check_id === 12)!;
      expect(check.passed).toBe(false);
      expect(check.message).toContain('EXPIRED');
    });
  });

  describe('Check 13: No Name Change', () => {
    it('passes (requires PNR history)', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      const check = result.data.checks.find((c) => c.check_id === 13)!;
      expect(check.passed).toBe(true);
    });
  });

  describe('Overall validation result', () => {
    it('returns valid=true for clean PNR', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      expect(result.data.valid).toBe(true);
      expect(result.data.error_count).toBe(0);
      expect(result.data.checks.length).toBe(13);
    });

    it('returns valid=false when errors exist', async () => {
      const pnr = makeValidPnr();
      pnr.segments[0]!.status = 'UN';
      const result = await agent.execute({ data: pnr });
      expect(result.data.valid).toBe(false);
      expect(result.data.error_count).toBeGreaterThan(0);
    });

    it('returns warnings in agent output', async () => {
      const pnr = makeValidPnr();
      pnr.segments[0]!.status = 'UN';
      const result = await agent.execute({ data: pnr });
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('error'))).toBe(true);
    });
  });

  describe('Input validation', () => {
    it('rejects invalid record locator', async () => {
      const pnr = makeValidPnr();
      pnr.record_locator = 'bad';
      await expect(agent.execute({ data: pnr })).rejects.toThrow('Invalid input');
    });

    it('rejects empty passengers', async () => {
      const pnr = makeValidPnr();
      pnr.passengers = [];
      await expect(agent.execute({ data: pnr })).rejects.toThrow('Invalid input');
    });

    it('rejects empty segments', async () => {
      const pnr = makeValidPnr();
      pnr.segments = [];
      await expect(agent.execute({ data: pnr })).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('3.3');
      expect(agent.name).toBe('PNR Validation');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({ data: makeValidPnr() });
      expect(result.metadata!['agent_id']).toBe('3.3');
      expect(result.metadata!['record_locator']).toBe('ABC123');
    });

    it('throws when not initialized', async () => {
      const uninit = new PnrValidation();
      await expect(uninit.execute({ data: makeValidPnr() })).rejects.toThrow('not been initialized');
    });
  });
});
