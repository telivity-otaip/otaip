import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CorporatePolicyValidationAgent } from '../index.js';
import type { PolicyValidationInput, CorporatePolicy } from '../types.js';

let agent: CorporatePolicyValidationAgent;
beforeAll(async () => { agent = new CorporatePolicyValidationAgent(); await agent.initialize(); });
afterAll(() => { agent.destroy(); });

const POLICY: CorporatePolicy = {
  corporateId: 'CORP001',
  cabinRules: { domestic: 'Y', international: 'W', longHaulThresholdMinutes: 360, longHaul: 'C' },
  fareRules: { maxFareAmount: '5000.00', blockedCarriers: ['FR'] },
  bookingRules: { minAdvanceDays: 14, minAdvanceDaysHard: 3 },
  bypassCodes: ['BYPASS123'],
};

function makeInput(overrides: Partial<PolicyValidationInput['offer']> = {}): PolicyValidationInput {
  return {
    offer: { offerId: 'OFR1', cabin: 'Y', fareAmount: '1000.00', currency: 'USD', carrier: 'BA', fareBasis: 'YOWUS', advanceBookingDays: 21, segments: [{ origin: 'LHR', destination: 'JFK', durationMinutes: 480 }], ...overrides },
    policy: POLICY,
  };
}

describe('CorporatePolicyValidationAgent', () => {
  it('approves compliant booking', async () => {
    const r = await agent.execute({ data: makeInput() });
    expect(r.data.result).toBe('APPROVED');
    expect(r.data.violations).toHaveLength(0);
  });
  it('detects cabin violation (F on intl short-haul)', async () => {
    const r = await agent.execute({ data: makeInput({ cabin: 'F', segments: [{ origin: 'LHR', destination: 'CDG', durationMinutes: 90 }] }) });
    expect(r.data.result).toBe('HARD_VIOLATION');
    expect(r.data.violations[0]!.rule).toBe('CABIN_CLASS');
  });
  it('allows C on long-haul', async () => {
    const r = await agent.execute({ data: makeInput({ cabin: 'C', segments: [{ origin: 'LHR', destination: 'JFK', durationMinutes: 480 }] }) });
    expect(r.data.result).toBe('APPROVED');
  });
  it('detects fare ceiling violation', async () => {
    const r = await agent.execute({ data: makeInput({ fareAmount: '6000.00' }) });
    expect(r.data.violations.some((v) => v.rule === 'FARE_CEILING')).toBe(true);
  });
  it('detects blocked carrier', async () => {
    const r = await agent.execute({ data: makeInput({ carrier: 'FR' }) });
    expect(r.data.violations.some((v) => v.rule === 'BLOCKED_CARRIER')).toBe(true);
  });
  it('soft violation for advance booking', async () => {
    const r = await agent.execute({ data: makeInput({ advanceBookingDays: 7 }) });
    expect(r.data.result).toBe('SOFT_VIOLATION');
    expect(r.data.violations[0]!.severity).toBe('SOFT');
  });
  it('hard violation for advance booking under threshold', async () => {
    const r = await agent.execute({ data: makeInput({ advanceBookingDays: 1 }) });
    expect(r.data.violations.some((v) => v.rule === 'ADVANCE_BOOKING' && v.severity === 'HARD')).toBe(true);
  });
  it('bypass code converts soft to approved', async () => {
    const r = await agent.execute({ data: { ...makeInput({ advanceBookingDays: 7 }), bypassCode: 'BYPASS123' } });
    expect(r.data.result).toBe('APPROVED');
    expect(r.data.bypassApplied).toBe(true);
  });
  it('bypass does not override hard violation', async () => {
    const r = await agent.execute({ data: { ...makeInput({ carrier: 'FR' }), bypassCode: 'BYPASS123' } });
    expect(r.data.result).toBe('HARD_VIOLATION');
  });
  it('invalid bypass code not applied', async () => {
    const r = await agent.execute({ data: { ...makeInput({ advanceBookingDays: 7 }), bypassCode: 'WRONG' } });
    expect(r.data.bypassApplied).toBe(false);
    expect(r.data.result).toBe('SOFT_VIOLATION');
  });
  it('multiple violations returned', async () => {
    const r = await agent.execute({ data: makeInput({ cabin: 'F', fareAmount: '6000.00', carrier: 'FR' }) });
    expect(r.data.violations.length).toBeGreaterThanOrEqual(3);
  });
  it('W cabin allowed on short-haul international', async () => {
    const r = await agent.execute({ data: makeInput({ cabin: 'W', segments: [{ origin: 'LHR', destination: 'CDG', durationMinutes: 90 }] }) });
    expect(r.data.result).toBe('APPROVED');
  });
  it('C cabin violates short-haul international policy (max W)', async () => {
    const r = await agent.execute({ data: makeInput({ cabin: 'C', segments: [{ origin: 'LHR', destination: 'CDG', durationMinutes: 90 }] }) });
    expect(r.data.result).toBe('HARD_VIOLATION');
  });
  it('has correct id', () => { expect(agent.id).toBe('2.5'); });
  it('reports healthy', async () => { expect((await agent.health()).status).toBe('healthy'); });
  it('throws when not initialized', async () => {
    const u = new CorporatePolicyValidationAgent();
    await expect(u.execute({ data: makeInput() })).rejects.toThrow('not been initialized');
  });
  it('F cabin on long-haul exceeds C policy', async () => {
    const r = await agent.execute({ data: makeInput({ cabin: 'F', segments: [{ origin: 'LHR', destination: 'JFK', durationMinutes: 480 }] }) });
    expect(r.data.result).toBe('HARD_VIOLATION');
  });
  it('Y cabin always passes cabin check', async () => {
    const r = await agent.execute({ data: makeInput({ cabin: 'Y' }) });
    expect(r.data.violations.some((v) => v.rule === 'CABIN_CLASS')).toBe(false);
  });
  it('fare at ceiling is OK', async () => {
    const r = await agent.execute({ data: makeInput({ fareAmount: '5000.00' }) });
    expect(r.data.violations.some((v) => v.rule === 'FARE_CEILING')).toBe(false);
  });
  it('no fare ceiling rule if not set', async () => {
    const r = await agent.execute({ data: { offer: makeInput().offer, policy: { ...POLICY, fareRules: { blockedCarriers: [] } } } });
    expect(r.data.violations.some((v) => v.rule === 'FARE_CEILING')).toBe(false);
  });
  it('preferred carriers are not violations', async () => {
    const r = await agent.execute({ data: makeInput({ carrier: 'AA' }) });
    expect(r.data.violations.some((v) => v.rule === 'BLOCKED_CARRIER')).toBe(false);
  });
  it('14 days advance exactly passes soft check', async () => {
    const r = await agent.execute({ data: makeInput({ advanceBookingDays: 14 }) });
    expect(r.data.violations.some((v) => v.rule === 'ADVANCE_BOOKING')).toBe(false);
  });
  it('3 days advance exactly passes hard check', async () => {
    const r = await agent.execute({ data: makeInput({ advanceBookingDays: 3 }) });
    // 3 >= minAdvanceDaysHard(3) so not hard. But 3 < minAdvanceDays(14) so soft.
    expect(r.data.violations.some((v) => v.rule === 'ADVANCE_BOOKING' && v.severity === 'HARD')).toBe(false);
    expect(r.data.violations.some((v) => v.rule === 'ADVANCE_BOOKING' && v.severity === 'SOFT')).toBe(true);
  });
});
