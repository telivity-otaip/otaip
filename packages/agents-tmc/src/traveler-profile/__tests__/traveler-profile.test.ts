/**
 * Traveler Profile — Unit Tests (Agent 8.1)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TravelerProfileAgent } from '../index.js';
import type { TravelerProfileInput } from '../types.js';

let agent: TravelerProfileAgent;

beforeAll(async () => {
  agent = new TravelerProfileAgent();
  await agent.initialize();
});

afterAll(() => { agent.destroy(); });
beforeEach(() => { agent.getStore().clear(); });

function createProfile(): TravelerProfileInput {
  return {
    operation: 'create',
    profile_data: {
      given_name: 'JOHN', surname: 'SMITH', date_of_birth: '1985-01-12',
      nationality: 'US', passport_number: 'A12345678', passport_expiry: '2029-06-15',
      passport_issuing_country: 'US', loyalty_numbers: { BA: 'BA123456', AA: 'AA789012' },
      seat_preference: 'AISLE', meal_preference: 'VGML',
      contact_email: 'john@example.com', contact_phone: '+14155551234',
      corporate_id: 'CORP001', department: 'Engineering',
    },
    current_date: '2026-04-01T12:00:00Z',
  };
}

describe('Traveler Profile', () => {
  describe('create', () => {
    it('creates a profile with generated ID', async () => {
      const result = await agent.execute({ data: createProfile() });
      expect(result.data.profile).toBeDefined();
      expect(result.data.profile!.traveler_id).toMatch(/^TVL\d{8}$/);
      expect(result.data.profile!.given_name).toBe('JOHN');
    });

    it('rejects invalid meal code', async () => {
      const input = createProfile();
      input.profile_data!.meal_preference = 'INVALID' as 'VGML';
      await expect(agent.execute({ data: input })).rejects.toThrow('INVALID_MEAL_CODE');
    });

    it('rejects duplicate email', async () => {
      await agent.execute({ data: createProfile() });
      await expect(agent.execute({ data: createProfile() })).rejects.toThrow('DUPLICATE_PROFILE');
    });

    it('rejects duplicate passport', async () => {
      await agent.execute({ data: createProfile() });
      const second = createProfile();
      second.profile_data!.contact_email = 'different@example.com';
      await expect(agent.execute({ data: second })).rejects.toThrow('DUPLICATE_PROFILE');
    });
  });

  describe('get', () => {
    it('retrieves existing profile', async () => {
      const created = await agent.execute({ data: createProfile() });
      const id = created.data.profile!.traveler_id;
      const result = await agent.execute({ data: { operation: 'get', traveler_id: id } });
      expect(result.data.profile!.surname).toBe('SMITH');
    });

    it('throws TRAVELER_NOT_FOUND', async () => {
      await expect(agent.execute({ data: { operation: 'get', traveler_id: 'NONEXISTENT' } })).rejects.toThrow('TRAVELER_NOT_FOUND');
    });
  });

  describe('update', () => {
    it('updates profile fields', async () => {
      const created = await agent.execute({ data: createProfile() });
      const id = created.data.profile!.traveler_id;
      const result = await agent.execute({ data: { operation: 'update', traveler_id: id, profile_data: { department: 'Sales' }, current_date: '2026-04-02T00:00:00Z' } });
      expect(result.data.profile!.department).toBe('Sales');
    });

    it('rejects invalid meal on update', async () => {
      const created = await agent.execute({ data: createProfile() });
      const id = created.data.profile!.traveler_id;
      await expect(agent.execute({ data: { operation: 'update', traveler_id: id, profile_data: { meal_preference: 'BAD' as 'VGML' } } })).rejects.toThrow('INVALID_MEAL_CODE');
    });
  });

  describe('search', () => {
    it('finds profiles by name', async () => {
      await agent.execute({ data: createProfile() });
      const result = await agent.execute({ data: { operation: 'search', search_query: 'SMITH' } });
      expect(result.data.profiles!.length).toBe(1);
    });

    it('returns empty for no match', async () => {
      const result = await agent.execute({ data: { operation: 'search', search_query: 'NOBODY' } });
      expect(result.data.profiles!.length).toBe(0);
    });
  });

  describe('apply_to_pnr', () => {
    it('injects SSR DOCS for international', async () => {
      const created = await agent.execute({ data: createProfile() });
      const id = created.data.profile!.traveler_id;
      const result = await agent.execute({ data: {
        operation: 'apply_to_pnr', traveler_id: id,
        pnr_segments: [{ carrier: 'BA', flight_number: '115', origin: 'LHR', destination: 'JFK', departure_date: '2026-06-15', is_international: true }],
      } });
      const docs = result.data.ssr_injections!.find((s) => s.ssr_type === 'DOCS');
      expect(docs).toBeDefined();
      expect(docs!.injected).toBe(true);
    });

    it('injects FQTV only for airlines in PNR', async () => {
      const created = await agent.execute({ data: createProfile() });
      const id = created.data.profile!.traveler_id;
      const result = await agent.execute({ data: {
        operation: 'apply_to_pnr', traveler_id: id,
        pnr_segments: [{ carrier: 'BA', flight_number: '115', origin: 'LHR', destination: 'JFK', departure_date: '2026-06-15', is_international: true }],
      } });
      const baFqtv = result.data.ssr_injections!.find((s) => s.ssr_type === 'FQTV' && s.content.includes('BA'));
      const aaFqtv = result.data.ssr_injections!.find((s) => s.ssr_type === 'FQTV' && s.content.includes('AA'));
      expect(baFqtv!.injected).toBe(true);
      expect(aaFqtv!.injected).toBe(false);
      expect(aaFqtv!.skipped_reason).toContain('not in PNR');
    });

    it('injects SSR MEAL', async () => {
      const created = await agent.execute({ data: createProfile() });
      const id = created.data.profile!.traveler_id;
      const result = await agent.execute({ data: {
        operation: 'apply_to_pnr', traveler_id: id,
        pnr_segments: [{ carrier: 'BA', flight_number: '115', origin: 'LHR', destination: 'JFK', departure_date: '2026-06-15', is_international: true }],
      } });
      const meal = result.data.ssr_injections!.find((s) => s.ssr_type === 'MEAL');
      expect(meal!.injected).toBe(true);
      expect(meal!.content).toBe('VGML');
    });

    it('injects SSR SEAT', async () => {
      const created = await agent.execute({ data: createProfile() });
      const id = created.data.profile!.traveler_id;
      const result = await agent.execute({ data: {
        operation: 'apply_to_pnr', traveler_id: id,
        pnr_segments: [{ carrier: 'BA', flight_number: '115', origin: 'LHR', destination: 'JFK', departure_date: '2026-06-15', is_international: true }],
      } });
      const seat = result.data.ssr_injections!.find((s) => s.ssr_type === 'SEAT');
      expect(seat!.injected).toBe(true);
    });
  });

  describe('passport expiry warning', () => {
    it('warns when passport expires within 6 months', async () => {
      const input = createProfile();
      input.profile_data!.passport_expiry = '2026-08-01';
      input.current_date = '2026-04-01T00:00:00Z';
      const result = await agent.execute({ data: input });
      expect(result.data.passport_expiry_warning).toBe(true);
      expect(result.warnings).toBeDefined();
    });

    it('no warning when passport valid for > 6 months', async () => {
      const input = createProfile();
      input.profile_data!.passport_expiry = '2029-06-15';
      const result = await agent.execute({ data: input });
      expect(result.data.passport_expiry_warning).toBeUndefined();
    });
  });

  describe('agent compliance', () => {
    it('has correct id/name', () => {
      expect(agent.id).toBe('8.1');
      expect(agent.name).toBe('Traveler Profile');
    });

    it('reports healthy', async () => {
      expect((await agent.health()).status).toBe('healthy');
    });

    it('throws when not initialized', async () => {
      const u = new TravelerProfileAgent();
      await expect(u.execute({ data: createProfile() })).rejects.toThrow('not been initialized');
    });
  });
});
