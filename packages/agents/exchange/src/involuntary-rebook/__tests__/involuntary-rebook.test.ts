/**
 * Involuntary Rebook — Unit Tests
 *
 * Agent 5.3: Schedule change handling, protection logic, regulatory entitlements.
 *
 * Threshold and EU261 inputs are PASSED EXPLICITLY (no invented defaults).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { InvoluntaryRebook } from '../index.js';
import type {
  InvoluntaryRebookInput,
  OriginalPnrSummary,
  ScheduleChangeNotification,
} from '../types.js';

let agent: InvoluntaryRebook;

beforeAll(async () => {
  agent = new InvoluntaryRebook();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

function makePnr(overrides: Partial<OriginalPnrSummary> = {}): OriginalPnrSummary {
  return {
    record_locator: 'ABC123',
    passenger_name: 'SMITH/JOHN',
    affected_segment: {
      carrier: 'BA',
      flight_number: '115',
      origin: 'LHR',
      destination: 'JFK',
      departure_date: '2026-06-15',
      departure_time: '09:00',
      booking_class: 'Y',
      fare_basis: 'YOWUS',
    },
    issuing_carrier: 'BA',
    departure_country: 'GB',
    arrival_country: 'US',
    is_checked_in: false,
    is_eu_carrier: true,
    ...overrides,
  };
}

function makeChange(
  overrides: Partial<ScheduleChangeNotification> = {},
): ScheduleChangeNotification {
  return {
    change_type: 'TIME_CHANGE',
    original_departure_time: '09:00',
    new_departure_time: '11:30',
    time_change_minutes: 150,
    ...overrides,
  };
}

function makeInput(overrides: Partial<InvoluntaryRebookInput> = {}): InvoluntaryRebookInput {
  return {
    original_pnr: makePnr(),
    schedule_change: makeChange(),
    thresholds: { time_change_minutes: 60 },
    available_flights: [
      {
        carrier: 'BA',
        flight_number: '117',
        departure_date: '2026-06-15',
        departure_time: '14:00',
        booking_class: 'Y',
        is_same_carrier: true,
        is_alliance_partner: false,
        is_interline: false,
      },
      {
        carrier: 'AA',
        flight_number: '100',
        departure_date: '2026-06-15',
        departure_time: '15:00',
        booking_class: 'Y',
        is_same_carrier: false,
        is_alliance_partner: true,
        is_interline: false,
      },
      {
        carrier: 'UA',
        flight_number: '900',
        departure_date: '2026-06-15',
        departure_time: '18:00',
        booking_class: 'Y',
        is_same_carrier: false,
        is_alliance_partner: false,
        is_interline: true,
      },
    ],
    ...overrides,
  };
}

describe('Involuntary Rebook', () => {
  describe('Trigger assessment', () => {
    it('marks time change > supplied threshold as involuntary', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.result.is_involuntary).toBe(true);
      expect(result.data.result.trigger).toBe('TIME_CHANGE');
    });

    it('marks time change <= supplied threshold as not involuntary', async () => {
      const input = makeInput({
        schedule_change: makeChange({ time_change_minutes: 30 }),
      });
      const result = await agent.execute({ data: input });
      expect(result.data.result.is_involuntary).toBe(false);
    });

    it('respects custom time threshold', async () => {
      const input = makeInput({
        schedule_change: makeChange({ time_change_minutes: 45 }),
        thresholds: { time_change_minutes: 30 },
      });
      const result = await agent.execute({ data: input });
      expect(result.data.result.is_involuntary).toBe(true);
    });

    it('returns non-involuntary + DOMAIN_INPUT_REQUIRED warning when time threshold missing', async () => {
      const input = makeInput({ thresholds: undefined });
      const result = await agent.execute({ data: input });
      expect(result.data.result.is_involuntary).toBe(false);
      expect(result.warnings).toBeDefined();
      expect(
        result.warnings!.some((w) => w.includes('DOMAIN_INPUT_REQUIRED') && w.includes('time_change_minutes')),
      ).toBe(true);
    });

    it('flight cancellation is always involuntary', async () => {
      const input = makeInput({
        schedule_change: { change_type: 'FLIGHT_CANCELLATION' },
      });
      const result = await agent.execute({ data: input });
      expect(result.data.result.is_involuntary).toBe(true);
      expect(result.data.result.trigger).toBe('FLIGHT_CANCELLATION');
    });

    it('routing change is involuntary', async () => {
      const input = makeInput({
        schedule_change: {
          change_type: 'ROUTING_CHANGE',
          original_routing: ['LHR', 'JFK'],
          new_routing: ['LHR', 'BOS', 'JFK'],
        },
      });
      const result = await agent.execute({ data: input });
      expect(result.data.result.is_involuntary).toBe(true);
      expect(result.data.result.trigger).toBe('ROUTING_CHANGE');
    });

    it('equipment downgrade is flagged but not auto-involuntary', async () => {
      const input = makeInput({
        schedule_change: {
          change_type: 'EQUIPMENT_DOWNGRADE',
          original_equipment: '777',
          new_equipment: '737',
          original_is_widebody: true,
          new_is_widebody: false,
        },
      });
      const result = await agent.execute({ data: input });
      expect(result.data.result.is_involuntary).toBe(false);
      expect(result.data.result.trigger).toBe('EQUIPMENT_DOWNGRADE');
    });
  });

  describe('No-show detection', () => {
    it('flags passenger no-show', async () => {
      const input = makeInput({ is_passenger_no_show: true });
      const result = await agent.execute({ data: input });
      expect(result.data.result.is_no_show).toBe(true);
      expect(result.data.result.is_involuntary).toBe(false);
    });

    it('no original routing credit for no-show', async () => {
      const input = makeInput({ is_passenger_no_show: true });
      const result = await agent.execute({ data: input });
      expect(result.data.result.original_routing_credit).toBe(false);
    });

    it('warns about no-show', async () => {
      const input = makeInput({ is_passenger_no_show: true });
      const result = await agent.execute({ data: input });
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('no-show'))).toBe(true);
    });
  });

  describe('Protection logic', () => {
    it('prioritizes same carrier first', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.result.protection_path).toBe('SAME_CARRIER');
      expect(result.data.result.protection_options[0]!.carrier).toBe('BA');
    });

    it('falls back to alliance partner', async () => {
      const input = makeInput({
        available_flights: [
          {
            carrier: 'AA',
            flight_number: '100',
            departure_date: '2026-06-15',
            departure_time: '15:00',
            booking_class: 'Y',
            is_same_carrier: false,
            is_alliance_partner: true,
            is_interline: false,
          },
        ],
      });
      const result = await agent.execute({ data: input });
      expect(result.data.result.protection_path).toBe('ALLIANCE_PARTNER');
    });

    it('falls back to interline as last resort', async () => {
      const input = makeInput({
        available_flights: [
          {
            carrier: 'UA',
            flight_number: '900',
            departure_date: '2026-06-15',
            departure_time: '18:00',
            booking_class: 'Y',
            is_same_carrier: false,
            is_alliance_partner: false,
            is_interline: true,
          },
        ],
      });
      const result = await agent.execute({ data: input });
      expect(result.data.result.protection_path).toBe('INTERLINE');
    });

    it('reports NONE_AVAILABLE when no flights', async () => {
      const input = makeInput({ available_flights: [] });
      const result = await agent.execute({ data: input });
      expect(result.data.result.protection_path).toBe('NONE_AVAILABLE');
    });

    it('lists all protection options in priority order', async () => {
      const result = await agent.execute({ data: makeInput() });
      const paths = result.data.result.protection_options.map((o) => o.path);
      expect(paths[0]).toBe('SAME_CARRIER');
      expect(paths[1]).toBe('ALLIANCE_PARTNER');
      expect(paths[2]).toBe('INTERLINE');
    });

    it('no protection for non-involuntary change', async () => {
      const input = makeInput({
        schedule_change: makeChange({ time_change_minutes: 15 }),
      });
      const result = await agent.execute({ data: input });
      expect(result.data.result.protection_options).toHaveLength(0);
    });
  });

  describe('Regulatory entitlements — EU261', () => {
    it('flags EU261 for EU departure', async () => {
      const result = await agent.execute({ data: makeInput() });
      const eu261 = result.data.result.regulatory_flags.find((f) => f.framework === 'EU261');
      expect(eu261).toBeDefined();
      expect(eu261!.applies).toBe(true);
    });

    it('reports DOMAIN_INPUT_REQUIRED when EU261 inputs are missing', async () => {
      const result = await agent.execute({ data: makeInput() });
      const eu261 = result.data.result.regulatory_flags.find((f) => f.framework === 'EU261')!;
      expect(eu261.compensation_eur).toBeNull();
      expect(eu261.missing_inputs).toBeDefined();
      expect(eu261.missing_inputs).toContain('eu261_inputs.distance_km');
    });

    it('computes €600 for >3500km flight delayed 5h', async () => {
      const input = makeInput({
        eu261_inputs: {
          distance_km: 6000,
          arrival_delay_hours: 5,
          extraordinary_circumstances: false,
        },
      });
      const result = await agent.execute({ data: input });
      const eu261 = result.data.result.regulatory_flags.find((f) => f.framework === 'EU261')!;
      expect(eu261.compensation_eur).toBe('600.00');
      expect(eu261.reduction_percent).toBe(0);
    });

    it('applies 50% long-haul reduction (€300) for 3-4h delay', async () => {
      const input = makeInput({
        eu261_inputs: {
          distance_km: 6000,
          arrival_delay_hours: 3.5,
          extraordinary_circumstances: false,
        },
      });
      const result = await agent.execute({ data: input });
      const eu261 = result.data.result.regulatory_flags.find((f) => f.framework === 'EU261')!;
      expect(eu261.compensation_eur).toBe('300.00');
      expect(eu261.reduction_percent).toBe(50);
    });

    it('returns €0 under extraordinary circumstances', async () => {
      const input = makeInput({
        eu261_inputs: {
          distance_km: 6000,
          arrival_delay_hours: 5,
          extraordinary_circumstances: true,
        },
      });
      const result = await agent.execute({ data: input });
      const eu261 = result.data.result.regulatory_flags.find((f) => f.framework === 'EU261')!;
      expect(eu261.compensation_eur).toBe('0.00');
    });

    it('flags EU261 for EU carrier regardless of route', async () => {
      const input = makeInput({
        original_pnr: makePnr({
          departure_country: 'US',
          arrival_country: 'JP',
          is_eu_carrier: true,
        }),
      });
      const result = await agent.execute({ data: input });
      const eu261 = result.data.result.regulatory_flags.find((f) => f.framework === 'EU261');
      expect(eu261!.applies).toBe(true);
    });

    it('does not flag EU261 for non-EU carrier from non-EU country', async () => {
      const input = makeInput({
        original_pnr: makePnr({
          departure_country: 'US',
          arrival_country: 'JP',
          is_eu_carrier: false,
          affected_segment: {
            carrier: 'NH',
            flight_number: '10',
            origin: 'JFK',
            destination: 'NRT',
            departure_date: '2026-06-15',
            departure_time: '11:00',
            booking_class: 'Y',
            fare_basis: 'YOWJP',
          },
        }),
      });
      const result = await agent.execute({ data: input });
      const eu261 = result.data.result.regulatory_flags.find((f) => f.framework === 'EU261');
      expect(eu261!.applies).toBe(false);
    });
  });

  describe('Regulatory entitlements — US DOT', () => {
    it('reports US DOT IDB as not applicable on rebook path (delays/cancels are not denied boarding)', async () => {
      const result = await agent.execute({ data: makeInput() });
      const usDot = result.data.result.regulatory_flags.find((f) => f.framework === 'US_DOT');
      expect(usDot).toBeDefined();
      expect(usDot!.applies).toBe(false);
      expect(usDot!.reason).toMatch(/14 CFR §250/);
    });
  });

  describe('Original routing credit', () => {
    it('grants original routing credit for involuntary rebook', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.result.original_routing_credit).toBe(true);
    });

    it('no routing credit for voluntary (non-involuntary)', async () => {
      const input = makeInput({
        schedule_change: makeChange({ time_change_minutes: 15 }),
      });
      const result = await agent.execute({ data: input });
      expect(result.data.result.original_routing_credit).toBe(false);
    });
  });

  describe('Summary', () => {
    it('generates human-readable summary', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.result.summary).toBeTruthy();
      expect(result.data.result.summary.length).toBeGreaterThan(20);
    });

    it('summary mentions protection path', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.data.result.summary.toLowerCase()).toContain('same carrier');
    });
  });

  describe('Input validation', () => {
    it('rejects invalid record locator', async () => {
      const input = makeInput({ original_pnr: makePnr({ record_locator: 'bad' }) });
      await expect(agent.execute({ data: input })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid passenger name', async () => {
      const input = makeInput({ original_pnr: makePnr({ passenger_name: 'bad' }) });
      await expect(agent.execute({ data: input })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid carrier', async () => {
      const input = makeInput({
        original_pnr: makePnr({
          affected_segment: { ...makePnr().affected_segment, carrier: 'X' },
        }),
      });
      await expect(agent.execute({ data: input })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid change type', async () => {
      const input = makeInput({
        schedule_change: { change_type: 'INVALID' as 'TIME_CHANGE' },
      });
      await expect(agent.execute({ data: input })).rejects.toThrow('Invalid input');
    });

    it('rejects invalid country code', async () => {
      const input = makeInput({
        original_pnr: makePnr({ departure_country: 'United Kingdom' }),
      });
      await expect(agent.execute({ data: input })).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('5.3');
      expect(agent.name).toBe('Involuntary Rebook');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['agent_id']).toBe('5.3');
      expect(result.metadata!['is_involuntary']).toBe(true);
      expect(result.metadata!['protection_path']).toBe('SAME_CARRIER');
    });

    it('warns on involuntary change', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('Involuntary'))).toBe(true);
    });

    it('warns on regulatory entitlement', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.warnings!.some((w) => w.includes('EU261'))).toBe(true);
    });

    it('throws when not initialized', async () => {
      const uninit = new InvoluntaryRebook();
      await expect(uninit.execute({ data: makeInput() })).rejects.toThrow('not been initialized');
    });
  });
});
