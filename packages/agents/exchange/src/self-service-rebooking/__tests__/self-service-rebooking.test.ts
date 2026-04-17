import { describe, it, expect } from 'vitest';
import type { DistributionAdapter, SearchOffer, SearchRequest, SearchResponse } from '@otaip/core';
import { AvailabilitySearch } from '@otaip/agents-search';
import { ChangeManagement } from '../../change-management/index.js';
import type { OriginalTicketSummary } from '../../change-management/types.js';
import { SelfServiceRebookingAgent } from '../index.js';
import type { RebookingInput } from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const ORIGINAL: OriginalTicketSummary = {
  ticket_number: '1251234567890',
  issuing_carrier: 'BA',
  passenger_name: 'TEST/JOHN',
  record_locator: 'ABC123',
  issue_date: '2026-04-01',
  base_fare: '400.00',
  base_fare_currency: 'USD',
  total_tax: '50.00',
  total_amount: '450.00',
  fare_basis: 'YOW',
  is_refundable: false,
};

let flightCounter = 100;
function makeOffer(opts: {
  id: string;
  fare?: number;
  tax?: number;
  currency?: string;
  departureHour?: number;
  connections?: number;
  departureDate?: string;
}): SearchOffer {
  flightCounter++;
  const date = opts.departureDate ?? '2026-05-01';
  const hour = opts.departureHour ?? 8;
  const hourStr = hour.toString().padStart(2, '0');
  const fare = opts.fare ?? 400;
  const tax = opts.tax ?? 50;
  const segments = [
    {
      carrier: 'BA',
      flight_number: String(flightCounter),
      origin: 'JFK',
      destination: opts.connections ? 'LHR' : 'CDG',
      departure_time: `${date}T${hourStr}:00:00Z`,
      arrival_time: `${date}T${hour + 7}:00:00Z`,
      duration_minutes: 420,
      cabin_class: 'economy' as const,
      booking_class: 'Y',
      stops: 0,
    },
  ];
  if (opts.connections) {
    for (let i = 0; i < opts.connections; i++) {
      flightCounter++;
      segments.push({
        carrier: 'BA',
        flight_number: String(flightCounter),
        origin: 'LHR',
        destination: 'CDG',
        departure_time: `${date}T${(hour + 8 + i).toString().padStart(2, '0')}:00:00Z`,
        arrival_time: `${date}T${(hour + 9 + i).toString().padStart(2, '0')}:30:00Z`,
        duration_minutes: 90,
        cabin_class: 'economy' as const,
        booking_class: 'Y',
        stops: 0,
      });
    }
  }
  return {
    offer_id: opts.id,
    source: 'mock',
    itinerary: {
      source_id: opts.id,
      source: 'mock',
      segments,
      total_duration_minutes: 420 + (opts.connections ?? 0) * 90,
      connection_count: opts.connections ?? 0,
    },
    price: {
      base_fare: fare,
      taxes: tax,
      total: fare + tax,
      currency: opts.currency ?? 'USD',
    },
    fare_basis: ['YOW'],
    booking_classes: ['Y'],
  };
}

class MockAdapter implements DistributionAdapter {
  readonly name = 'mock';
  constructor(private readonly offers: SearchOffer[]) {}
  async search(_req: SearchRequest): Promise<SearchResponse> {
    return { offers: this.offers, truncated: false };
  }
  async isAvailable() {
    return true;
  }
}

async function makeAgent(offers: SearchOffer[]): Promise<SelfServiceRebookingAgent> {
  const search = new AvailabilitySearch([new MockAdapter(offers)]);
  const change = new ChangeManagement();
  const agent = new SelfServiceRebookingAgent({
    availabilitySearch: search,
    changeManagement: change,
  });
  await agent.initialize();
  return agent;
}

const BASE_INPUT: RebookingInput = {
  originalTicket: ORIGINAL,
  newOrigin: 'JFK',
  newDestination: 'CDG',
  newDepartureDate: '2026-05-01',
  reason: 'voluntary',
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SelfServiceRebookingAgent (5.5)', () => {
  describe('voluntary + involuntary flows', () => {
    it('voluntary change returns alternatives with positive fare diff', async () => {
      const agent = await makeAgent([
        makeOffer({ id: 'alt1', fare: 500, tax: 60 }), // +100 fare diff
        makeOffer({ id: 'alt2', fare: 450, tax: 55 }), // +50 fare diff
      ]);
      const r = await agent.execute({ data: BASE_INPUT });
      expect(r.data.alternatives.length).toBeGreaterThan(0);
      expect(r.data.noAlternativesFound).toBe(false);
      // Cheapest alternative (alt2) should be ranked first
      expect(r.data.alternatives[0]!.newItinerary.offer_id).toBe('alt2');
    });

    it('schedule_change waives the change fee', async () => {
      const agent = await makeAgent([makeOffer({ id: 'alt1', fare: 500, tax: 60 })]);
      const r = await agent.execute({
        data: { ...BASE_INPUT, reason: 'schedule_change' },
      });
      expect(r.data.alternatives[0]!.changeFee.amount).toBe('0.00');
      expect(r.data.alternatives[0]!.policyRestrictions.join(' ')).toMatch(/involuntary/);
    });

    it('missed_connection waives the change fee', async () => {
      const agent = await makeAgent([makeOffer({ id: 'alt1', fare: 500, tax: 60 })]);
      const r = await agent.execute({
        data: { ...BASE_INPUT, reason: 'missed_connection' },
      });
      expect(r.data.alternatives[0]!.changeFee.amount).toBe('0.00');
    });

    it('cancellation waives the change fee', async () => {
      const agent = await makeAgent([makeOffer({ id: 'alt1', fare: 500, tax: 60 })]);
      const r = await agent.execute({
        data: { ...BASE_INPUT, reason: 'cancellation' },
      });
      expect(r.data.alternatives[0]!.changeFee.amount).toBe('0.00');
    });
  });

  describe('search + filtering', () => {
    it('no alternatives on route returns empty + flag', async () => {
      const agent = await makeAgent([]);
      const r = await agent.execute({ data: BASE_INPUT });
      expect(r.data.alternatives).toEqual([]);
      expect(r.data.noAlternativesFound).toBe(true);
    });

    it('sameDay=true filters to same-day departures', async () => {
      const agent = await makeAgent([
        makeOffer({ id: 'same', departureDate: '2026-05-01' }),
        makeOffer({ id: 'other', departureDate: '2026-05-02' }),
      ]);
      const r = await agent.execute({ data: { ...BASE_INPUT, sameDay: true } });
      const ids = r.data.alternatives.map((a) => a.newItinerary.offer_id);
      expect(ids).toContain('same');
      expect(ids).not.toContain('other');
    });

    it('multi-segment new itinerary priced correctly', async () => {
      const agent = await makeAgent([
        makeOffer({ id: 'connect', fare: 500, tax: 60, connections: 1 }),
      ]);
      const r = await agent.execute({ data: BASE_INPUT });
      expect(r.data.alternatives[0]!.newItinerary.itinerary.segments).toHaveLength(2);
      expect(r.data.alternatives[0]!.fareDifference.amount).toBe('100.00');
      expect(r.data.alternatives[0]!.taxDifference.amount).toBe('10.00');
    });

    it('maxAlternatives caps output', async () => {
      const agent = await makeAgent([
        makeOffer({ id: 'a' }),
        makeOffer({ id: 'b' }),
        makeOffer({ id: 'c' }),
        makeOffer({ id: 'd' }),
        makeOffer({ id: 'e' }),
      ]);
      const r = await agent.execute({ data: { ...BASE_INPUT, maxAlternatives: 2 } });
      expect(r.data.alternatives).toHaveLength(2);
      expect(r.data.alternatives[0]!.rank).toBe(1);
      expect(r.data.alternatives[1]!.rank).toBe(2);
    });

    it('alternatives sorted by totalCost ascending', async () => {
      const agent = await makeAgent([
        makeOffer({ id: 'expensive', fare: 900, tax: 120 }),
        makeOffer({ id: 'cheap', fare: 200, tax: 30 }),
        makeOffer({ id: 'mid', fare: 500, tax: 60 }),
      ]);
      const r = await agent.execute({ data: BASE_INPUT });
      const ids = r.data.alternatives.map((a) => a.newItinerary.offer_id);
      expect(ids[0]).toBe('cheap');
      expect(ids[2]).toBe('expensive');
    });
  });

  describe('price deltas', () => {
    it('negative fare diff (alternative cheaper) handled', async () => {
      const agent = await makeAgent([makeOffer({ id: 'cheap', fare: 300, tax: 40 })]);
      const r = await agent.execute({ data: BASE_INPUT });
      expect(r.data.alternatives[0]!.fareDifference.amount).toBe('-100.00');
    });

    it('zero fare diff (same price) handled', async () => {
      const agent = await makeAgent([makeOffer({ id: 'same', fare: 400, tax: 50 })]);
      const r = await agent.execute({ data: BASE_INPUT });
      expect(r.data.alternatives[0]!.fareDifference.amount).toBe('0.00');
      expect(r.data.alternatives[0]!.taxDifference.amount).toBe('0.00');
    });

    it('totalCost = changeFee + fareDiff + taxDiff', async () => {
      const agent = await makeAgent([makeOffer({ id: 'x', fare: 500, tax: 60 })]);
      const r = await agent.execute({
        data: { ...BASE_INPUT, reason: 'schedule_change' },
      });
      const a = r.data.alternatives[0]!;
      expect(a.changeFee.amount).toBe('0.00');
      expect(a.fareDifference.amount).toBe('100.00');
      expect(a.taxDifference.amount).toBe('10.00');
      expect(a.totalCost.amount).toBe('110.00');
    });
  });

  describe('validation + lifecycle', () => {
    it('invalid newOrigin throws', async () => {
      const agent = await makeAgent([]);
      await expect(
        agent.execute({ data: { ...BASE_INPUT, newOrigin: 'JFKK' } }),
      ).rejects.toThrow(/newOrigin/);
    });

    it('same origin + destination throws', async () => {
      const agent = await makeAgent([]);
      await expect(
        agent.execute({ data: { ...BASE_INPUT, newDestination: 'JFK' } }),
      ).rejects.toThrow(/newDestination/);
    });

    it('invalid reason throws', async () => {
      const agent = await makeAgent([]);
      await expect(
        // @ts-expect-error — intentionally invalid
        agent.execute({ data: { ...BASE_INPUT, reason: 'oops' } }),
      ).rejects.toThrow(/reason/);
    });

    it('throws AgentNotInitializedError before initialize', async () => {
      const search = new AvailabilitySearch([new MockAdapter([])]);
      const change = new ChangeManagement();
      const agent = new SelfServiceRebookingAgent({
        availabilitySearch: search,
        changeManagement: change,
      });
      await expect(agent.execute({ data: BASE_INPUT })).rejects.toThrow(/not been initialized/);
    });

    it('has correct id, name, version', () => {
      const search = new AvailabilitySearch([new MockAdapter([])]);
      const change = new ChangeManagement();
      const agent = new SelfServiceRebookingAgent({
        availabilitySearch: search,
        changeManagement: change,
      });
      expect(agent.id).toBe('5.5');
      expect(agent.name).toBe('Self-Service Rebooking');
      expect(agent.version).toBe('0.2.0');
    });
  });
});
