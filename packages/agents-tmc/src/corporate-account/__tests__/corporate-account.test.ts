/**
 * Corporate Account — Unit Tests (Agent 8.2)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { CorporateAccountAgent } from '../index.js';
import type { CorporateAccountInput, TravelPolicy, NegotiatedFare } from '../types.js';

let agent: CorporateAccountAgent;

beforeAll(async () => {
  agent = new CorporateAccountAgent();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});
beforeEach(() => {
  agent.getAccounts().clear();
});

const DEFAULT_POLICY: TravelPolicy = {
  max_cabin_domestic: 'economy',
  max_cabin_international_under_6h: 'economy',
  max_cabin_international_over_6h: 'business',
  advance_booking_requirement_days: 14,
  advance_booking_exception_threshold_days: 3,
  max_fare_domestic_usd: 1000,
  max_fare_international_usd: 5000,
  require_approval_above_usd: 3000,
  preferred_airlines: ['BA', 'AA'],
  blacklisted_airlines: ['FR'],
  out_of_policy_booking_allowed: true,
  out_of_policy_requires_reason: true,
};

function createAccount(): CorporateAccountInput {
  return {
    operation: 'create_account',
    account_data: {
      company_name: 'Acme Corp',
      policy: DEFAULT_POLICY,
      negotiated_fares: [
        {
          airline: 'BA',
          fare_basis: 'YBAACME',
          cabin: 'economy',
          discount_percent: 15,
          valid_from: '2026-01-01',
          valid_to: '2026-12-31',
        },
      ],
      contact_email: 'travel@acme.com',
      contact_name: 'Travel Manager',
    },
    current_date: '2026-04-01T12:00:00Z',
  };
}

async function createAndGetId(): Promise<string> {
  const res = await agent.execute({ data: createAccount() });
  return res.data.account!.account_id;
}

describe('Corporate Account', () => {
  describe('create / get / update / list', () => {
    it('creates account with ID', async () => {
      const res = await agent.execute({ data: createAccount() });
      expect(res.data.account!.account_id).toMatch(/^CORP\d{6}$/);
      expect(res.data.account!.company_name).toBe('Acme Corp');
    });

    it('rejects duplicate company name', async () => {
      await agent.execute({ data: createAccount() });
      await expect(agent.execute({ data: createAccount() })).rejects.toThrow('DUPLICATE_ACCOUNT');
    });

    it('gets account by ID', async () => {
      const id = await createAndGetId();
      const res = await agent.execute({ data: { operation: 'get_account', account_id: id } });
      expect(res.data.account!.company_name).toBe('Acme Corp');
    });

    it('throws ACCOUNT_NOT_FOUND', async () => {
      await expect(
        agent.execute({ data: { operation: 'get_account', account_id: 'NONE' } }),
      ).rejects.toThrow('ACCOUNT_NOT_FOUND');
    });

    it('updates account', async () => {
      const id = await createAndGetId();
      const res = await agent.execute({
        data: {
          operation: 'update_account',
          account_id: id,
          account_data: { contact_name: 'New Manager' },
          current_date: '2026-04-02',
        },
      });
      expect(res.data.account!.contact_name).toBe('New Manager');
    });

    it('lists accounts', async () => {
      await agent.execute({ data: createAccount() });
      const res = await agent.execute({ data: { operation: 'list_accounts' } });
      expect(res.data.accounts!.length).toBe(1);
    });

    it('gets preferred suppliers', async () => {
      const id = await createAndGetId();
      const res = await agent.execute({
        data: { operation: 'get_preferred_suppliers', account_id: id },
      });
      expect(res.data.preferred_suppliers).toEqual(['BA', 'AA']);
    });

    it('gets policy', async () => {
      const id = await createAndGetId();
      const res = await agent.execute({ data: { operation: 'get_policy', account_id: id } });
      expect(res.data.policy!.max_cabin_domestic).toBe('economy');
    });
  });

  describe('validate_booking', () => {
    it('in-policy booking passes', async () => {
      const id = await createAndGetId();
      const res = await agent.execute({
        data: {
          operation: 'validate_booking',
          account_id: id,
          booking: {
            segments: [
              {
                carrier: 'BA',
                origin: 'LHR',
                destination: 'JFK',
                origin_country: 'GB',
                destination_country: 'US',
                departure_date: '2026-05-15',
                cabin: 'business',
                flight_duration_hours: 8,
              },
            ],
            fare_amount_usd: '2500.00',
            airline: 'BA',
          },
          current_date: '2026-04-01',
        },
      });
      expect(res.data.validation!.in_policy).toBe(true);
    });

    it('detects cabin violation (domestic business)', async () => {
      const id = await createAndGetId();
      const res = await agent.execute({
        data: {
          operation: 'validate_booking',
          account_id: id,
          booking: {
            segments: [
              {
                carrier: 'AA',
                origin: 'JFK',
                destination: 'LAX',
                origin_country: 'US',
                destination_country: 'US',
                departure_date: '2026-05-15',
                cabin: 'business',
                flight_duration_hours: 5,
              },
            ],
            fare_amount_usd: '800.00',
            airline: 'AA',
          },
          current_date: '2026-04-01',
        },
      });
      expect(
        res.data.validation!.violations.some(
          (v) => v.rule === 'cabin_class' && v.severity === 'hard',
        ),
      ).toBe(true);
    });

    it('detects advance booking soft violation', async () => {
      const id = await createAndGetId();
      const res = await agent.execute({
        data: {
          operation: 'validate_booking',
          account_id: id,
          booking: {
            segments: [
              {
                carrier: 'BA',
                origin: 'LHR',
                destination: 'JFK',
                origin_country: 'GB',
                destination_country: 'US',
                departure_date: '2026-04-08',
                cabin: 'economy',
                flight_duration_hours: 8,
              },
            ],
            fare_amount_usd: '500.00',
            airline: 'BA',
          },
          current_date: '2026-04-01',
        },
      });
      expect(
        res.data.validation!.violations.some(
          (v) => v.rule === 'advance_booking' && v.severity === 'soft',
        ),
      ).toBe(true);
    });

    it('detects advance booking hard violation (under exception threshold)', async () => {
      const id = await createAndGetId();
      const res = await agent.execute({
        data: {
          operation: 'validate_booking',
          account_id: id,
          booking: {
            segments: [
              {
                carrier: 'BA',
                origin: 'LHR',
                destination: 'JFK',
                origin_country: 'GB',
                destination_country: 'US',
                departure_date: '2026-04-02',
                cabin: 'economy',
                flight_duration_hours: 8,
              },
            ],
            fare_amount_usd: '500.00',
            airline: 'BA',
          },
          current_date: '2026-04-01',
        },
      });
      expect(
        res.data.validation!.violations.some(
          (v) => v.rule === 'advance_booking' && v.severity === 'hard',
        ),
      ).toBe(true);
    });

    it('requires approval above threshold', async () => {
      const id = await createAndGetId();
      const res = await agent.execute({
        data: {
          operation: 'validate_booking',
          account_id: id,
          booking: {
            segments: [
              {
                carrier: 'BA',
                origin: 'LHR',
                destination: 'JFK',
                origin_country: 'GB',
                destination_country: 'US',
                departure_date: '2026-05-15',
                cabin: 'business',
                flight_duration_hours: 8,
              },
            ],
            fare_amount_usd: '4000.00',
            airline: 'BA',
          },
          current_date: '2026-04-01',
        },
      });
      expect(res.data.validation!.requires_approval).toBe(true);
    });

    it('includes negotiated fare when available', async () => {
      const id = await createAndGetId();
      const res = await agent.execute({
        data: {
          operation: 'validate_booking',
          account_id: id,
          booking: {
            segments: [
              {
                carrier: 'BA',
                origin: 'LHR',
                destination: 'JFK',
                origin_country: 'GB',
                destination_country: 'US',
                departure_date: '2026-05-15',
                cabin: 'economy',
                flight_duration_hours: 8,
              },
            ],
            fare_amount_usd: '1000.00',
            airline: 'BA',
          },
          current_date: '2026-04-01',
        },
      });
      expect(res.data.validation!.preferred_fare_available).toBeDefined();
      expect(res.data.validation!.preferred_fare_available!.discount_percent).toBe(15);
      expect(res.data.validation!.preferred_fare_available!.estimated_saving_usd).toBe('150.00');
    });

    it('blocks when out_of_policy_booking_allowed=false with hard violation', async () => {
      const input = createAccount();
      input.account_data!.policy = { ...DEFAULT_POLICY, out_of_policy_booking_allowed: false };
      input.account_data!.company_name = 'Strict Corp';
      const res = await agent.execute({ data: input });
      const id = res.data.account!.account_id;

      const valRes = await agent.execute({
        data: {
          operation: 'validate_booking',
          account_id: id,
          booking: {
            segments: [
              {
                carrier: 'AA',
                origin: 'JFK',
                destination: 'LAX',
                origin_country: 'US',
                destination_country: 'US',
                departure_date: '2026-05-15',
                cabin: 'business',
                flight_duration_hours: 5,
              },
            ],
            fare_amount_usd: '800.00',
            airline: 'AA',
          },
          current_date: '2026-04-01',
        },
      });
      expect(valRes.data.validation!.blocked).toBe(true);
    });

    it('rejects blacklisted airline', async () => {
      const id = await createAndGetId();
      await expect(
        agent.execute({
          data: {
            operation: 'validate_booking',
            account_id: id,
            booking: {
              segments: [
                {
                  carrier: 'FR',
                  origin: 'DUB',
                  destination: 'STN',
                  origin_country: 'IE',
                  destination_country: 'GB',
                  departure_date: '2026-05-15',
                  cabin: 'economy',
                  flight_duration_hours: 1.5,
                },
              ],
              fare_amount_usd: '50.00',
              airline: 'FR',
            },
            current_date: '2026-04-01',
          },
        }),
      ).rejects.toThrow('AIRLINE_BLACKLISTED');
    });

    it('international under 6h uses correct policy', async () => {
      const id = await createAndGetId();
      const res = await agent.execute({
        data: {
          operation: 'validate_booking',
          account_id: id,
          booking: {
            segments: [
              {
                carrier: 'BA',
                origin: 'LHR',
                destination: 'CDG',
                origin_country: 'GB',
                destination_country: 'FR',
                departure_date: '2026-05-15',
                cabin: 'business',
                flight_duration_hours: 1.5,
              },
            ],
            fare_amount_usd: '500.00',
            airline: 'BA',
          },
          current_date: '2026-04-01',
        },
      });
      // max_cabin_international_under_6h = economy, so business = violation
      expect(res.data.validation!.violations.some((v) => v.rule === 'cabin_class')).toBe(true);
    });
  });

  describe('agent compliance', () => {
    it('has correct id/name', () => {
      expect(agent.id).toBe('8.2');
    });
    it('reports healthy', async () => {
      expect((await agent.health()).status).toBe('healthy');
    });
    it('throws when not initialized', async () => {
      const u = new CorporateAccountAgent();
      await expect(u.execute({ data: { operation: 'list_accounts' } })).rejects.toThrow(
        'not been initialized',
      );
    });
  });
});
