import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { CommissionManagementAgent } from '../index.js';
import type { CommissionManagementInput } from '../types.js';

let agent: CommissionManagementAgent;
beforeAll(async () => {
  agent = new CommissionManagementAgent();
  await agent.initialize();
});
afterAll(() => {
  agent.destroy();
});
beforeEach(() => {
  agent.getAgreements().clear();
});

async function registerStandard(): Promise<string> {
  const r = await agent.execute({
    data: {
      operation: 'registerAgreement',
      agreement: {
        agentId: '12345678',
        airline: 'BA',
        type: 'STANDARD',
        rate: '7.00',
        basis: 'PERCENT_OF_FARE',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
        currencyCode: 'USD',
      },
    },
  });
  return r.data.agreement!.agreementId;
}

describe('CommissionManagementAgent', () => {
  it('registers agreement', async () => {
    const id = await registerStandard();
    expect(id).toMatch(/^CMA/);
  });
  it('rejects duplicate', async () => {
    await registerStandard();
    await expect(
      agent.execute({
        data: {
          operation: 'registerAgreement',
          agreement: {
            agentId: '12345678',
            airline: 'BA',
            type: 'STANDARD',
            rate: '7.00',
            basis: 'PERCENT_OF_FARE',
            effectiveFrom: '2026-01-01',
            currencyCode: 'USD',
          },
        },
      }),
    ).rejects.toThrow('DUPLICATE');
  });
  it('gets rate', async () => {
    await registerStandard();
    const r = await agent.execute({
      data: { operation: 'getRate', airline: 'BA', agentId: '12345678', ticketDate: '2026-06-15' },
    });
    expect(r.data.rate!.rate).toBe('7.00');
  });
  it('no rate for unknown airline', async () => {
    await registerStandard();
    const r = await agent.execute({
      data: { operation: 'getRate', airline: 'LH', agentId: '12345678', ticketDate: '2026-06-15' },
    });
    expect(r.data.rate).toBeUndefined();
  });
  it('no rate outside date range', async () => {
    await registerStandard();
    const r = await agent.execute({
      data: { operation: 'getRate', airline: 'BA', agentId: '12345678', ticketDate: '2027-06-15' },
    });
    expect(r.data.rate).toBeUndefined();
  });
  it('fare basis pattern matching', async () => {
    await agent.execute({
      data: {
        operation: 'registerAgreement',
        agreement: {
          agentId: '12345678',
          airline: 'BA',
          type: 'OVERRIDE',
          rate: '12.00',
          basis: 'PERCENT_OF_FARE',
          fareBasisPatterns: ['Y*'],
          effectiveFrom: '2026-01-01',
          currencyCode: 'USD',
        },
      },
    });
    const r = await agent.execute({
      data: {
        operation: 'getRate',
        airline: 'BA',
        agentId: '12345678',
        fareBasis: 'YOWUS',
        ticketDate: '2026-06-15',
      },
    });
    expect(r.data.rate!.rate).toBe('12.00');
  });
  it('highest rate wins', async () => {
    await registerStandard();
    await agent.execute({
      data: {
        operation: 'registerAgreement',
        agreement: {
          agentId: '12345678',
          airline: 'BA',
          type: 'OVERRIDE',
          rate: '12.00',
          basis: 'PERCENT_OF_FARE',
          effectiveFrom: '2026-01-01',
          currencyCode: 'USD',
        },
      },
    });
    const r = await agent.execute({
      data: { operation: 'getRate', airline: 'BA', agentId: '12345678', ticketDate: '2026-06-15' },
    });
    expect(r.data.rate!.rate).toBe('12.00');
  });
  it('validates commission MATCH', async () => {
    await registerStandard();
    const r = await agent.execute({
      data: {
        operation: 'validateCommission',
        airline: 'BA',
        agentId: '12345678',
        ticketDate: '2026-06-15',
        fareAmount: '1000.00',
        claimedCommission: '70.00',
      },
    });
    expect(r.data.validation!.status).toBe('MATCH');
  });
  it('validates commission OVERSTATED', async () => {
    await registerStandard();
    const r = await agent.execute({
      data: {
        operation: 'validateCommission',
        airline: 'BA',
        agentId: '12345678',
        ticketDate: '2026-06-15',
        fareAmount: '1000.00',
        claimedCommission: '100.00',
      },
    });
    expect(r.data.validation!.status).toBe('OVERSTATED');
  });
  it('validates commission UNDERSTATED', async () => {
    await registerStandard();
    const r = await agent.execute({
      data: {
        operation: 'validateCommission',
        airline: 'BA',
        agentId: '12345678',
        ticketDate: '2026-06-15',
        fareAmount: '1000.00',
        claimedCommission: '50.00',
      },
    });
    expect(r.data.validation!.status).toBe('UNDERSTATED');
  });
  it('validates commission NO_AGREEMENT', async () => {
    const r = await agent.execute({
      data: {
        operation: 'validateCommission',
        airline: 'LH',
        agentId: '99999999',
        ticketDate: '2026-06-15',
        fareAmount: '1000.00',
        claimedCommission: '50.00',
      },
    });
    expect(r.data.validation!.status).toBe('NO_AGREEMENT');
  });
  it('calculates incentive - threshold met', async () => {
    await agent.execute({
      data: {
        operation: 'registerAgreement',
        agreement: {
          agentId: '12345678',
          airline: 'BA',
          type: 'INCENTIVE',
          rate: '2.00',
          basis: 'PERCENT_OF_FARE',
          effectiveFrom: '2026-01-01',
          minimumTickets: 5,
          currencyCode: 'USD',
        },
      },
    });
    const tickets = Array.from({ length: 6 }, (_, i) => ({
      fareAmount: '500.00',
      ticketDate: `2026-06-${String(i + 1).padStart(2, '0')}`,
    }));
    const r = await agent.execute({
      data: {
        operation: 'calculateIncentive',
        agentId: '12345678',
        airline: 'BA',
        period: { from: '2026-06-01', to: '2026-06-30' },
        tickets,
      },
    });
    expect(r.data.incentive!.thresholdMet).toBe(true);
    expect(r.data.incentive!.incentiveEarned).toBe('60.00');
  });
  it('calculates incentive - threshold not met', async () => {
    await agent.execute({
      data: {
        operation: 'registerAgreement',
        agreement: {
          agentId: '12345678',
          airline: 'BA',
          type: 'INCENTIVE',
          rate: '2.00',
          basis: 'PERCENT_OF_FARE',
          effectiveFrom: '2026-01-01',
          minimumTickets: 10,
          currencyCode: 'USD',
        },
      },
    });
    const r = await agent.execute({
      data: {
        operation: 'calculateIncentive',
        agentId: '12345678',
        airline: 'BA',
        period: { from: '2026-06-01', to: '2026-06-30' },
        tickets: [{ fareAmount: '500.00', ticketDate: '2026-06-01' }],
      },
    });
    expect(r.data.incentive!.thresholdMet).toBe(false);
    expect(r.data.incentive!.incentiveEarned).toBe('0.00');
  });
  it('lists agreements', async () => {
    await registerStandard();
    const r = await agent.execute({ data: { operation: 'listAgreements' } });
    expect(r.data.agreements!.length).toBe(1);
  });
  it('filters agreements by airline', async () => {
    await registerStandard();
    await agent.execute({
      data: {
        operation: 'registerAgreement',
        agreement: {
          agentId: '12345678',
          airline: 'LH',
          type: 'STANDARD',
          rate: '5.00',
          basis: 'PERCENT_OF_FARE',
          effectiveFrom: '2026-01-01',
          currencyCode: 'EUR',
        },
      },
    });
    const r = await agent.execute({
      data: { operation: 'listAgreements', filter: { airline: 'BA' } },
    });
    expect(r.data.agreements!.length).toBe(1);
  });
  it('has correct id', () => {
    expect(agent.id).toBe('7.3');
  });
  it('reports healthy', async () => {
    expect((await agent.health()).status).toBe('healthy');
  });
  it('throws when not initialized', async () => {
    const u = new CommissionManagementAgent();
    await expect(u.execute({ data: { operation: 'listAgreements' } })).rejects.toThrow(
      'not been initialized',
    );
  });
  it('match threshold is ±0.01', async () => {
    await registerStandard();
    const r = await agent.execute({
      data: {
        operation: 'validateCommission',
        airline: 'BA',
        agentId: '12345678',
        ticketDate: '2026-06-15',
        fareAmount: '1000.00',
        claimedCommission: '70.01',
      },
    });
    expect(r.data.validation!.status).toBe('MATCH');
  });
  it('variance calculated correctly', async () => {
    await registerStandard();
    const r = await agent.execute({
      data: {
        operation: 'validateCommission',
        airline: 'BA',
        agentId: '12345678',
        ticketDate: '2026-06-15',
        fareAmount: '1000.00',
        claimedCommission: '80.00',
      },
    });
    expect(r.data.validation!.variance).toBe('10.00');
  });
});
