import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { RevenueAccountingAgent } from '../index.js';
import type { CouponLiftInput } from '../types.js';

let agent: RevenueAccountingAgent;
beforeAll(async () => { agent = new RevenueAccountingAgent(); await agent.initialize(); });
afterAll(() => { agent.destroy(); });
beforeEach(() => { agent.getStore().clear(); });

function makeCoupon(overrides: Partial<CouponLiftInput> = {}): CouponLiftInput {
  return { ticketNumber: '1251234567890', couponNumber: 1, flightNumber: 'BA115', flightDate: '2026-06-15', origin: 'LHR', destination: 'JFK', passengerName: 'SMITH/JOHN', cabin: 'Y', fareAmount: '500.00', currency: 'USD', liftedAt: '2026-06-15T09:00:00Z', ...overrides };
}

async function lift(overrides: Partial<CouponLiftInput> = {}): Promise<string> {
  const r = await agent.execute({ data: { operation: 'recordLift', coupon: makeCoupon(overrides) } });
  return r.data.lift!.liftId;
}

describe('RevenueAccountingAgent', () => {
  it('records a lift', async () => { const id = await lift(); expect(id).toMatch(/^LFT/); });
  it('lift status is LIFTED', async () => { const r = await agent.execute({ data: { operation: 'recordLift', coupon: makeCoupon() } }); expect(r.data.lift!.status).toBe('LIFTED'); });
  it('rejects duplicate lift', async () => { await lift(); await expect(agent.execute({ data: { operation: 'recordLift', coupon: makeCoupon() } })).rejects.toThrow('COUPON_ALREADY_LIFTED'); });
  it('recognizes revenue for flight', async () => {
    await lift();
    await lift({ couponNumber: 2, fareAmount: '300.00' });
    const r = await agent.execute({ data: { operation: 'recognizeRevenue', flightRef: 'BA115-2026-06-15' } });
    expect(r.data.recognition!.couponsLifted).toBe(2);
    expect(r.data.recognition!.totalRevenue).toBe('800.00');
  });
  it('uplift report for period', async () => {
    await lift();
    const r = await agent.execute({ data: { operation: 'getUpliftReport', period: { from: '2026-06-01', to: '2026-06-30' } } });
    expect(r.data.uplift!.totalCoupons).toBe(1);
    expect(r.data.uplift!.totalRevenue).toBe('500.00');
  });
  it('uplift byRoute populated', async () => {
    await lift();
    const r = await agent.execute({ data: { operation: 'getUpliftReport', period: { from: '2026-06-01', to: '2026-06-30' } } });
    expect(r.data.uplift!.byRoute[0]!.route).toBe('LHR-JFK');
  });
  it('averageYield calculated', async () => {
    await lift();
    const r = await agent.execute({ data: { operation: 'getUpliftReport', period: { from: '2026-06-01', to: '2026-06-30' } } });
    expect(r.data.uplift!.averageYield).toBe('500.00');
  });
  it('deferred revenue for open coupons', async () => {
    // Manually add an OPEN coupon
    agent.getStore().set('1251234567890-1', { liftId: 'LFT001', ticketNumber: '1251234567890', couponNumber: 1, flightNumber: 'BA115', flightDate: '2026-07-15', origin: 'LHR', destination: 'JFK', fareAmount: '500.00', currency: 'USD', status: 'OPEN' });
    const r = await agent.execute({ data: { operation: 'getDeferredRevenue', currentDate: '2026-06-15' } });
    expect(r.data.deferred!.openCoupons).toBe(1);
    expect(r.data.deferred!.deferredAmount).toBe('500.00');
  });
  it('deferred byFutureDate populated', async () => {
    agent.getStore().set('1251234567890-1', { liftId: 'LFT001', ticketNumber: '1251234567890', couponNumber: 1, flightNumber: 'BA115', flightDate: '2026-07-15', origin: 'LHR', destination: 'JFK', fareAmount: '500.00', currency: 'USD', status: 'OPEN' });
    const r = await agent.execute({ data: { operation: 'getDeferredRevenue', currentDate: '2026-06-15' } });
    expect(r.data.deferred!.byFutureDate.length).toBe(1);
  });
  it('recordVoid sets status VOID', async () => {
    await lift();
    await agent.execute({ data: { operation: 'recordVoid', ticketNumber: '1251234567890' } });
    const rec = agent.getStore().get('1251234567890-1');
    expect(rec!.status).toBe('VOID');
  });
  it('recordVoid for unknown ticket throws', async () => {
    await expect(agent.execute({ data: { operation: 'recordVoid', ticketNumber: 'NONEXISTENT' } })).rejects.toThrow('COUPON_NOT_FOUND');
  });
  it('recordRefund sets status REFUNDED', async () => {
    await lift();
    await agent.execute({ data: { operation: 'recordRefund', ticketNumber: '1251234567890', refundAmount: '500.00' } });
    const rec = agent.getStore().get('1251234567890-1');
    expect(rec!.status).toBe('REFUNDED');
  });
  it('cannot lift voided coupon', async () => {
    await lift();
    await agent.execute({ data: { operation: 'recordVoid', ticketNumber: '1251234567890' } });
    await expect(agent.execute({ data: { operation: 'recordLift', coupon: makeCoupon() } })).rejects.toThrow('COUPON_VOIDED');
  });
  it('cannot lift refunded coupon', async () => {
    await lift();
    await agent.execute({ data: { operation: 'recordRefund', ticketNumber: '1251234567890', refundAmount: '500.00' } });
    await expect(agent.execute({ data: { operation: 'recordLift', coupon: makeCoupon() } })).rejects.toThrow('COUPON_REFUNDED');
  });
  it('empty period returns 0 in uplift', async () => {
    const r = await agent.execute({ data: { operation: 'getUpliftReport', period: { from: '2020-01-01', to: '2020-01-31' } } });
    expect(r.data.uplift!.totalCoupons).toBe(0);
  });
  it('multiple flights recognized separately', async () => {
    await lift();
    await lift({ flightNumber: 'BA200', flightDate: '2026-06-16', couponNumber: 2 });
    const r1 = await agent.execute({ data: { operation: 'recognizeRevenue', flightRef: 'BA115-2026-06-15' } });
    const r2 = await agent.execute({ data: { operation: 'recognizeRevenue', flightRef: 'BA200-2026-06-16' } });
    expect(r1.data.recognition!.couponsLifted).toBe(1);
    expect(r2.data.recognition!.couponsLifted).toBe(1);
  });
  it('has correct id', () => { expect(agent.id).toBe('7.6'); });
  it('reports healthy', async () => { expect((await agent.health()).status).toBe('healthy'); });
  it('throws when not initialized', async () => { const u = new RevenueAccountingAgent(); await expect(u.execute({ data: { operation: 'getDeferredRevenue' } })).rejects.toThrow('not been initialized'); });
  it('recognizeRevenue sets recognizedAt', async () => {
    await lift();
    const r = await agent.execute({ data: { operation: 'recognizeRevenue', flightRef: 'BA115-2026-06-15' } });
    expect(r.data.recognition!.recognizedAt).toBeTruthy();
  });
  it('deferred revenue empty when no open coupons', async () => {
    const r = await agent.execute({ data: { operation: 'getDeferredRevenue', currentDate: '2026-06-15' } });
    expect(r.data.deferred!.openCoupons).toBe(0);
    expect(r.data.deferred!.deferredAmount).toBe('0.00');
  });
});
