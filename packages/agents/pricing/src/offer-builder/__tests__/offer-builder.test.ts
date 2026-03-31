import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { OfferBuilderAgent } from '../index.js';

let agent: OfferBuilderAgent;
beforeAll(async () => { agent = new OfferBuilderAgent(); await agent.initialize(); });
afterAll(() => { agent.destroy(); });
beforeEach(() => { agent.getStore().clear(); });

const BUILD = {
  segments: [{ carrier: 'BA', flightNumber: '115', origin: 'LHR', destination: 'JFK', departureDate: '2026-06-15', cabin: 'Y' }],
  fare: { basis: 'YOWUS', cabin: 'Y', nuc: '500', roe: '1.0', baseAmount: '500.00', currency: 'USD' },
  taxes: [{ code: 'GB', amount: '85.00', currency: 'USD' }, { code: 'US', amount: '20.00', currency: 'USD' }],
  passengerCount: 2,
  pricingSource: 'GDS' as const,
};

async function buildOffer(overrides = {}): Promise<string> {
  const r = await agent.execute({ data: { operation: 'buildOffer', buildInput: { ...BUILD, ...overrides }, currentTime: '2026-04-01T12:00:00Z' } });
  return r.data.offer!.offerId;
}

describe('OfferBuilderAgent', () => {
  it('builds offer with correct subtotal', async () => {
    const r = await agent.execute({ data: { operation: 'buildOffer', buildInput: BUILD, currentTime: '2026-04-01T12:00:00Z' } });
    // subtotal = (500 + 85 + 20) * 2 = 1210
    expect(r.data.offer!.subtotal).toBe('1210.00');
  });
  it('builds offer with ancillaries', async () => {
    const r = await agent.execute({ data: { operation: 'buildOffer', buildInput: { ...BUILD, ancillaries: [{ ancillaryId: 'A1', amount: '50.00', currency: 'USD', description: 'Bag' }] }, currentTime: '2026-04-01T12:00:00Z' } });
    expect(r.data.offer!.ancillaryTotal).toBe('50.00');
    expect(r.data.offer!.totalAmount).toBe('1260.00');
  });
  it('perPassengerTotal correct', async () => {
    const r = await agent.execute({ data: { operation: 'buildOffer', buildInput: BUILD, currentTime: '2026-04-01T12:00:00Z' } });
    expect(r.data.offer!.perPassengerTotal).toBe('605.00');
  });
  it('GDS TTL = 30min', async () => {
    const r = await agent.execute({ data: { operation: 'buildOffer', buildInput: BUILD, currentTime: '2026-04-01T12:00:00Z' } });
    const exp = new Date(r.data.offer!.expiresAt);
    const cre = new Date(r.data.offer!.createdAt);
    expect(exp.getTime() - cre.getTime()).toBe(30 * 60000);
  });
  it('NDC TTL = 15min', async () => {
    const r = await agent.execute({ data: { operation: 'buildOffer', buildInput: { ...BUILD, pricingSource: 'NDC' as const }, currentTime: '2026-04-01T12:00:00Z' } });
    const exp = new Date(r.data.offer!.expiresAt);
    const cre = new Date(r.data.offer!.createdAt);
    expect(exp.getTime() - cre.getTime()).toBe(15 * 60000);
  });
  it('custom TTL', async () => {
    const r = await agent.execute({ data: { operation: 'buildOffer', buildInput: { ...BUILD, ttlMinutes: 60 }, currentTime: '2026-04-01T12:00:00Z' } });
    const exp = new Date(r.data.offer!.expiresAt);
    const cre = new Date(r.data.offer!.createdAt);
    expect(exp.getTime() - cre.getTime()).toBe(60 * 60000);
  });
  it('getOffer returns stored offer', async () => {
    const id = await buildOffer();
    const r = await agent.execute({ data: { operation: 'getOffer', offerId: id } });
    expect(r.data.offer!.offerId).toBe(id);
  });
  it('getOffer throws for unknown', async () => {
    await expect(agent.execute({ data: { operation: 'getOffer', offerId: 'NONE' } })).rejects.toThrow('OFFER_NOT_FOUND');
  });
  it('validateOffer returns valid for active', async () => {
    const id = await buildOffer();
    const r = await agent.execute({ data: { operation: 'validateOffer', offerId: id, currentTime: '2026-04-01T12:05:00Z' } });
    expect(r.data.valid).toBe(true);
  });
  it('validateOffer returns expired after TTL', async () => {
    const id = await buildOffer();
    const r = await agent.execute({ data: { operation: 'validateOffer', offerId: id, currentTime: '2026-04-01T13:00:00Z' } });
    expect(r.data.valid).toBe(false);
    expect(r.data.reason).toBe('OFFER_EXPIRED');
  });
  it('markUsed changes status', async () => {
    const id = await buildOffer();
    await agent.execute({ data: { operation: 'markUsed', offerId: id, currentTime: '2026-04-01T12:05:00Z' } });
    const r = await agent.execute({ data: { operation: 'getOffer', offerId: id } });
    expect(r.data.offer!.status).toBe('USED');
  });
  it('markUsed twice throws ALREADY_USED', async () => {
    const id = await buildOffer();
    await agent.execute({ data: { operation: 'markUsed', offerId: id, currentTime: '2026-04-01T12:05:00Z' } });
    await expect(agent.execute({ data: { operation: 'markUsed', offerId: id, currentTime: '2026-04-01T12:06:00Z' } })).rejects.toThrow('OFFER_ALREADY_USED');
  });
  it('expireOffer changes status', async () => {
    const id = await buildOffer();
    await agent.execute({ data: { operation: 'expireOffer', offerId: id } });
    const r = await agent.execute({ data: { operation: 'getOffer', offerId: id } });
    expect(r.data.offer!.status).toBe('EXPIRED');
  });
  it('cleanExpired cleans past-TTL offers', async () => {
    await buildOffer();
    const r = await agent.execute({ data: { operation: 'cleanExpired', currentTime: '2026-04-01T13:00:00Z' } });
    expect(r.data.cleanedCount).toBe(1);
  });
  it('rejects invalid fare amount', async () => {
    await expect(agent.execute({ data: { operation: 'buildOffer', buildInput: { ...BUILD, fare: { ...BUILD.fare, baseAmount: 'abc' } } } })).rejects.toThrow('INVALID_FARE_AMOUNT');
  });
  it('status is ACTIVE on create', async () => {
    const id = await buildOffer();
    const r = await agent.execute({ data: { operation: 'getOffer', offerId: id } });
    expect(r.data.offer!.status).toBe('ACTIVE');
  });
  it('DIRECT TTL = 20min', async () => {
    const r = await agent.execute({ data: { operation: 'buildOffer', buildInput: { ...BUILD, pricingSource: 'DIRECT' as const }, currentTime: '2026-04-01T12:00:00Z' } });
    const exp = new Date(r.data.offer!.expiresAt);
    const cre = new Date(r.data.offer!.createdAt);
    expect(exp.getTime() - cre.getTime()).toBe(20 * 60000);
  });
  it('has correct id', () => { expect(agent.id).toBe('2.4'); });
  it('reports healthy', async () => { expect((await agent.health()).status).toBe('healthy'); });
  it('throws when not initialized', async () => {
    const u = new OfferBuilderAgent();
    await expect(u.execute({ data: { operation: 'getOffer', offerId: 'X' } })).rejects.toThrow('not been initialized');
  });
  it('validates used offer returns ALREADY_USED', async () => {
    const id = await buildOffer();
    await agent.execute({ data: { operation: 'markUsed', offerId: id, currentTime: '2026-04-01T12:05:00Z' } });
    const r = await agent.execute({ data: { operation: 'validateOffer', offerId: id, currentTime: '2026-04-01T12:06:00Z' } });
    expect(r.data.valid).toBe(false);
    expect(r.data.reason).toBe('OFFER_ALREADY_USED');
  });
  it('validateOffer not found', async () => {
    const r = await agent.execute({ data: { operation: 'validateOffer', offerId: 'NONE', currentTime: '2026-04-01T12:00:00Z' } });
    expect(r.data.valid).toBe(false);
    expect(r.data.reason).toBe('OFFER_NOT_FOUND');
  });
  it('no ancillaries defaults to empty', async () => {
    const r = await agent.execute({ data: { operation: 'buildOffer', buildInput: BUILD, currentTime: '2026-04-01T12:00:00Z' } });
    expect(r.data.offer!.ancillaries).toHaveLength(0);
    expect(r.data.offer!.ancillaryTotal).toBe('0.00');
  });
});
