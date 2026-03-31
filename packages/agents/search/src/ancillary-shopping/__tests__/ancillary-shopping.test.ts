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
  it('returns empty ancillaries with notSupportedByAdapter when no adapter', async () => {
    const r = await agent.execute({ data: BASE_INPUT });
    expect(r.data.ancillaries).toHaveLength(0);
    expect(r.data.notSupportedByAdapter).toBe(true);
  });

  it('returns ancillaries from adapter when adapter is set', async () => {
    const a2 = new AncillaryShoppingAgent();
    await a2.initialize();
    a2.setAdapter({ name: 'empty', searchAncillaries: async () => [] });
    const r = await a2.execute({ data: BASE_INPUT });
    expect(r.data.ancillaries).toHaveLength(0);
    expect(r.data.notSupportedByAdapter).toBe(false);
  });

  it('rejects empty segments', async () => {
    await expect(agent.execute({ data: { ...BASE_INPUT, segments: [] } })).rejects.toThrow('Invalid');
  });

  it('rejects empty passengers', async () => {
    await expect(agent.execute({ data: { ...BASE_INPUT, passengers: [] } })).rejects.toThrow('Invalid');
  });

  it('has correct agent id', () => { expect(agent.id).toBe('1.5'); });

  it('reports healthy', async () => { expect((await agent.health()).status).toBe('healthy'); });

  it('throws when not initialized', async () => {
    const u = new AncillaryShoppingAgent();
    await expect(u.execute({ data: BASE_INPUT })).rejects.toThrow('not been initialized');
  });
});
