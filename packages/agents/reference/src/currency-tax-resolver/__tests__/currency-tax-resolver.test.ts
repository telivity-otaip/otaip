/**
 * Currency & Tax Code Resolver — Unit Tests
 *
 * Test cases derived from the agent spec (agents/specs/0-6-currency-tax-code-resolver.yaml).
 * Uses inline static data — no external files required.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CurrencyTaxResolver } from '../index.js';

let resolver: CurrencyTaxResolver;

beforeAll(async () => {
  resolver = new CurrencyTaxResolver();
  await resolver.initialize();
});

afterAll(() => {
  resolver.destroy();
});

describe('Currency & Tax Code Resolver', () => {
  describe('Spec test: Currency resolution', () => {
    it('resolves USD to US Dollar', async () => {
      const result = await resolver.execute({
        data: { code: 'USD', code_type: 'currency' },
      });
      expect(result.data.currency).not.toBeNull();
      expect(result.data.currency!.code).toBe('USD');
      expect(result.data.currency!.name).toBe('US Dollar');
      expect(result.data.currency!.symbol).toBe('$');
      expect(result.data.currency!.minor_units).toBe(2);
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('resolves EUR to Euro', async () => {
      const result = await resolver.execute({ data: { code: 'EUR' } });
      expect(result.data.currency!.code).toBe('EUR');
      expect(result.data.currency!.name).toBe('Euro');
      expect(result.data.currency!.minor_units).toBe(2);
    });

    it('resolves GBP to Pound Sterling', async () => {
      const result = await resolver.execute({ data: { code: 'GBP' } });
      expect(result.data.currency!.code).toBe('GBP');
      expect(result.data.currency!.symbol).toBe('£');
    });

    it('resolves JPY with 0 minor units', async () => {
      const result = await resolver.execute({ data: { code: 'JPY' } });
      expect(result.data.currency!.code).toBe('JPY');
      expect(result.data.currency!.minor_units).toBe(0);
    });

    it('resolves KWD with 3 minor units', async () => {
      const result = await resolver.execute({ data: { code: 'KWD' } });
      expect(result.data.currency!.code).toBe('KWD');
      expect(result.data.currency!.minor_units).toBe(3);
    });

    it('resolves historical currency DEM', async () => {
      const result = await resolver.execute({ data: { code: 'DEM' } });
      expect(result.data.currency!.name).toBe('Deutsche Mark');
      expect(result.data.currency!.is_active).toBe(false);
    });
  });

  describe('Spec test: Tax code resolution', () => {
    it('resolves YQ as carrier surcharge', async () => {
      const result = await resolver.execute({
        data: { code: 'YQ', code_type: 'tax' },
      });
      expect(result.data.tax).not.toBeNull();
      expect(result.data.tax!.code).toBe('YQ');
      expect(result.data.tax!.category).toBe('carrier_surcharge');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('resolves GB as UK Air Passenger Duty', async () => {
      const result = await resolver.execute({
        data: { code: 'GB', code_type: 'tax' },
      });
      expect(result.data.tax!.code).toBe('GB');
      expect(result.data.tax!.category).toBe('government_tax');
      expect(result.data.tax!.country_code).toBe('GB');
    });

    it('resolves US as US Transportation Tax', async () => {
      const result = await resolver.execute({
        data: { code: 'US', code_type: 'tax' },
      });
      expect(result.data.tax!.code).toBe('US');
      expect(result.data.tax!.category).toBe('government_tax');
      expect(result.data.tax!.country_code).toBe('US');
      expect(result.data.tax!.is_percentage).toBe(true);
    });

    it('resolves US2 as September 11th Security Fee', async () => {
      const result = await resolver.execute({
        data: { code: 'US2', code_type: 'tax' },
      });
      expect(result.data.tax!.code).toBe('US2');
      expect(result.data.tax!.category).toBe('security_fee');
    });

    it('resolves XF as US Passenger Facility Charge', async () => {
      const result = await resolver.execute({
        data: { code: 'XF', code_type: 'tax' },
      });
      expect(result.data.tax!.code).toBe('XF');
      expect(result.data.tax!.category).toBe('airport_fee');
    });
  });

  describe('Spec test: Auto-detection', () => {
    it('auto-detects YQ as tax (2-letter code)', async () => {
      const result = await resolver.execute({ data: { code: 'YQ' } });
      expect(result.data.tax).not.toBeNull();
      expect(result.data.currency).toBeNull();
    });

    it('auto-detects USD as currency (3-letter known currency)', async () => {
      const result = await resolver.execute({ data: { code: 'USD' } });
      expect(result.data.currency).not.toBeNull();
      expect(result.data.tax).toBeNull();
    });
  });

  describe('Spec test: Country filter', () => {
    it('returns GB tax when country=GB', async () => {
      const result = await resolver.execute({
        data: { code: 'GB', code_type: 'tax', country: 'GB' },
      });
      expect(result.data.tax).not.toBeNull();
    });

    it('returns null for GB tax when country=US', async () => {
      const result = await resolver.execute({
        data: { code: 'GB', code_type: 'tax', country: 'US' },
      });
      expect(result.data.tax).toBeNull();
      expect(result.data.match_confidence).toBe(0);
    });

    it('carrier surcharges (YQ) are not filtered by country', async () => {
      const result = await resolver.execute({
        data: { code: 'YQ', code_type: 'tax', country: 'JP' },
      });
      expect(result.data.tax).not.toBeNull();
    });
  });

  describe('Spec test: Unknown code', () => {
    it('returns null with confidence 0 for unknown code', async () => {
      const result = await resolver.execute({ data: { code: 'ZZZ' } });
      expect(result.data.currency).toBeNull();
      expect(result.data.tax).toBeNull();
      expect(result.data.match_confidence).toBe(0);
    });
  });

  describe('Input validation', () => {
    it('rejects empty code', async () => {
      await expect(
        resolver.execute({ data: { code: '' } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects code longer than 10 characters', async () => {
      await expect(
        resolver.execute({ data: { code: 'A'.repeat(11) } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid code_type', async () => {
      await expect(
        resolver.execute({
          data: { code: 'USD', code_type: 'invalid' as 'currency' },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(resolver.id).toBe('0.6');
      expect(resolver.name).toBe('Currency & Tax Code Resolver');
      expect(resolver.version).toBe('0.1.0');
    });

    it('reports healthy status', async () => {
      const health = await resolver.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await resolver.execute({ data: { code: 'USD' } });
      expect(result.metadata).toBeDefined();
      expect(result.metadata!['agent_id']).toBe('0.6');
    });

    it('throws when not initialized', async () => {
      const uninitResolver = new CurrencyTaxResolver();
      await expect(
        uninitResolver.execute({ data: { code: 'USD' } }),
      ).rejects.toThrow('not been initialized');
    });
  });

  describe('Edge cases', () => {
    it('is case-insensitive', async () => {
      const result = await resolver.execute({ data: { code: 'usd' } });
      expect(result.data.currency!.code).toBe('USD');
    });

    it('handles whitespace in input', async () => {
      const result = await resolver.execute({ data: { code: '  EUR  ' } });
      expect(result.data.currency!.code).toBe('EUR');
    });
  });
});
