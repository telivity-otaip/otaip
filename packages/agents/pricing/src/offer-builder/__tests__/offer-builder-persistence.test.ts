/**
 * OfferBuilderAgent — Persistence adapter tests
 *
 * Verifies that the agent works correctly when constructed with an
 * InMemoryPersistenceAdapter injected via the config.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryPersistenceAdapter } from '@otaip/core';
import { OfferBuilderAgent } from '../index.js';
import type { BuildOfferInput } from '../types.js';

const BUILD: BuildOfferInput = {
  segments: [
    {
      carrier: 'BA',
      flightNumber: '115',
      origin: 'LHR',
      destination: 'JFK',
      departureDate: '2026-06-15',
      cabin: 'Y',
    },
  ],
  fare: {
    basis: 'YOWUS',
    cabin: 'Y',
    nuc: '500',
    roe: '1.0',
    baseAmount: '500.00',
    currency: 'USD',
  },
  taxes: [
    { code: 'GB', amount: '85.00', currency: 'USD' },
    { code: 'US', amount: '20.00', currency: 'USD' },
  ],
  passengerCount: 2,
  pricingSource: 'GDS' as const,
};

let persistence: InMemoryPersistenceAdapter;
let agent: OfferBuilderAgent;

beforeEach(async () => {
  persistence = new InMemoryPersistenceAdapter();
  agent = new OfferBuilderAgent({ persistence });
  await agent.initialize();
});

async function buildOffer(overrides: Partial<BuildOfferInput> = {}): Promise<string> {
  const r = await agent.execute({
    data: {
      operation: 'buildOffer',
      buildInput: { ...BUILD, ...overrides },
      currentTime: '2026-04-01T12:00:00Z',
    },
  });
  return r.data.offer!.offerId;
}

describe('OfferBuilderAgent with PersistenceAdapter', () => {
  it('stores offer in persistence adapter', async () => {
    const id = await buildOffer();
    expect(persistence.size).toBe(1);
    expect(await persistence.has(`offer:${id}`)).toBe(true);
  });

  it('retrieves offer via getOffer', async () => {
    const id = await buildOffer();
    const r = await agent.execute({ data: { operation: 'getOffer', offerId: id } });
    expect(r.data.offer!.offerId).toBe(id);
    expect(r.data.offer!.subtotal).toBe('1210.00');
  });

  it('validates an active offer', async () => {
    const id = await buildOffer();
    const r = await agent.execute({
      data: { operation: 'validateOffer', offerId: id, currentTime: '2026-04-01T12:05:00Z' },
    });
    expect(r.data.valid).toBe(true);
  });

  it('validates expired offer', async () => {
    const id = await buildOffer();
    const r = await agent.execute({
      data: { operation: 'validateOffer', offerId: id, currentTime: '2026-04-01T13:00:00Z' },
    });
    expect(r.data.valid).toBe(false);
    expect(r.data.reason).toBe('OFFER_EXPIRED');
  });

  it('marks offer as used and persists the change', async () => {
    const id = await buildOffer();
    await agent.execute({
      data: { operation: 'markUsed', offerId: id, currentTime: '2026-04-01T12:05:00Z' },
    });
    // Verify via a fresh get
    const r = await agent.execute({ data: { operation: 'getOffer', offerId: id } });
    expect(r.data.offer!.status).toBe('USED');
  });

  it('expires offer and persists the change', async () => {
    const id = await buildOffer();
    await agent.execute({ data: { operation: 'expireOffer', offerId: id } });
    const r = await agent.execute({ data: { operation: 'getOffer', offerId: id } });
    expect(r.data.offer!.status).toBe('EXPIRED');
  });

  it('cleanExpired updates offers in persistence', async () => {
    await buildOffer();
    const r = await agent.execute({
      data: { operation: 'cleanExpired', currentTime: '2026-04-01T13:00:00Z' },
    });
    expect(r.data.cleanedCount).toBe(1);
  });

  it('getOffer throws OFFER_NOT_FOUND for missing key', async () => {
    await expect(
      agent.execute({ data: { operation: 'getOffer', offerId: 'NONE' } }),
    ).rejects.toThrow('OFFER_NOT_FOUND');
  });

  it('in-memory Map is NOT used when persistence is injected', async () => {
    await buildOffer();
    // The agent's internal Map should remain empty
    expect(agent.getStore().size).toBe(0);
  });

  it('works without persistence (backward compatible)', async () => {
    const plainAgent = new OfferBuilderAgent();
    await plainAgent.initialize();
    const r = await plainAgent.execute({
      data: {
        operation: 'buildOffer',
        buildInput: BUILD,
        currentTime: '2026-04-01T12:00:00Z',
      },
    });
    expect(r.data.offer).toBeDefined();
    expect(plainAgent.getStore().size).toBe(1);
    plainAgent.destroy();
  });
});
