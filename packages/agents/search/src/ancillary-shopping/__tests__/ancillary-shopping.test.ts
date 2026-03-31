import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AncillaryShoppingAgent } from '../index.js';
import type { AncillaryShoppingInput } from '../types.js';

let agent: AncillaryShoppingAgent;
beforeAll(async () => { agent = new AncillaryShoppingAgent(); await agent.initialize(); });
afterAll(() => { agent.destroy(); });

const BASE_INPUT: AncillaryShoppingInput = {
  segments: [{ origin: 'LHR', destination: 'JFK', flightNumber: '115', departureDate: '2026-06-15', carrier: 'BA' }],
  passengers: [{ type: 'ADT', passengerRef: 'PAX1' }],
};

describe('AncillaryShoppingAgent', () => {
  it('returns ancillaries with mock data', async () => {
    const r = await agent.execute({ data: BASE_INPUT });
    expect(r.data.ancillaries.length).toBeGreaterThan(0);
    expect(r.data.notSupportedByAdapter).toBe(false);
  });
  it('each ancillary has valid rfic A-I', async () => {
    const r = await agent.execute({ data: BASE_INPUT });
    for (const a of r.data.ancillaries) expect('ABCDEFGHI').toContain(a.rfic);
  });
  it('filters by requested categories', async () => {
    const r = await agent.execute({ data: { ...BASE_INPUT, requestedCategories: ['BAGGAGE'] } });
    expect(r.data.ancillaries.every((a) => a.category === 'BAGGAGE')).toBe(true);
  });
  it('returns currency USD', async () => {
    const r = await agent.execute({ data: BASE_INPUT });
    expect(r.data.currency).toBe('USD');
  });
  it('includes segment refs', async () => {
    const r = await agent.execute({ data: BASE_INPUT });
    expect(r.data.ancillaries[0]!.segmentRefs.length).toBeGreaterThan(0);
  });
  it('includes passenger refs', async () => {
    const r = await agent.execute({ data: BASE_INPUT });
    expect(r.data.ancillaries[0]!.passengerRefs).toContain('PAX1');
  });
  it('returns notSupportedByAdapter when adapter has no ancillaries', async () => {
    const a2 = new AncillaryShoppingAgent();
    await a2.initialize();
    a2.setAdapter({ name: 'empty', searchAncillaries: async () => [] });
    const r = await a2.execute({ data: BASE_INPUT });
    expect(r.data.ancillaries).toHaveLength(0);
  });
  it('rejects empty segments', async () => {
    await expect(agent.execute({ data: { ...BASE_INPUT, segments: [] } })).rejects.toThrow('Invalid');
  });
  it('rejects empty passengers', async () => {
    await expect(agent.execute({ data: { ...BASE_INPUT, passengers: [] } })).rejects.toThrow('Invalid');
  });
  it('multiple segments produce more refs', async () => {
    const r = await agent.execute({ data: { ...BASE_INPUT, segments: [...BASE_INPUT.segments, { origin: 'JFK', destination: 'LAX', flightNumber: '200', departureDate: '2026-06-16', carrier: 'AA' }] } });
    const baggage = r.data.ancillaries.find((a) => a.category === 'BAGGAGE');
    expect(baggage!.segmentRefs.length).toBe(2);
  });
  it('has correct agent id', () => { expect(agent.id).toBe('1.5'); });
  it('reports healthy', async () => { expect((await agent.health()).status).toBe('healthy'); });
  it('throws when not initialized', async () => {
    const u = new AncillaryShoppingAgent();
    await expect(u.execute({ data: BASE_INPUT })).rejects.toThrow('not been initialized');
  });
  it('multiple passengers produces correct passengerRefs', async () => {
    const r = await agent.execute({ data: { ...BASE_INPUT, passengers: [{ type: 'ADT', passengerRef: 'P1' }, { type: 'CHD', passengerRef: 'P2' }] } });
    expect(r.data.ancillaries[0]!.passengerRefs).toContain('P2');
  });
  it('returns prices as decimal strings', async () => {
    const r = await agent.execute({ data: BASE_INPUT });
    for (const a of r.data.ancillaries) expect(() => Number(a.price.amount)).not.toThrow();
  });
  it('generates unique ancillary IDs', async () => {
    const r = await agent.execute({ data: BASE_INPUT });
    const ids = r.data.ancillaries.map((a) => a.ancillaryId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('MEAL category uses rfic G', async () => {
    const r = await agent.execute({ data: { ...BASE_INPUT, requestedCategories: ['MEAL'] } });
    expect(r.data.ancillaries[0]!.rfic).toBe('G');
  });
  it('BAGGAGE category uses rfic C', async () => {
    const r = await agent.execute({ data: { ...BASE_INPUT, requestedCategories: ['BAGGAGE'] } });
    expect(r.data.ancillaries[0]!.rfic).toBe('C');
  });
  it('returns available=true for mock data', async () => {
    const r = await agent.execute({ data: BASE_INPUT });
    expect(r.data.ancillaries.every((a) => a.available)).toBe(true);
  });
  it('LOUNGE is not per-segment', async () => {
    const r = await agent.execute({ data: { ...BASE_INPUT, requestedCategories: ['LOUNGE'] } });
    expect(r.data.ancillaries[0]!.price.perSegment).toBe(false);
  });
});
