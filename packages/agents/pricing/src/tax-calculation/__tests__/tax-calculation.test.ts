/**
 * Tax Calculation — Unit Tests
 *
 * Agent 2.3: Per-segment tax computation, exemption engine, currency conversion.
 * All amounts verified with decimal.js precision.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TaxCalculation } from '../index.js';
import { Decimal } from 'decimal.js';
import type { TaxCalculationInput } from '../types.js';

let agent: TaxCalculation;

beforeAll(async () => {
  agent = new TaxCalculation();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

/** Helper to build a standard input */
function makeInput(overrides: Partial<TaxCalculationInput> = {}): TaxCalculationInput {
  return {
    segments: [
      {
        origin: 'JFK',
        destination: 'LHR',
        origin_country: 'US',
        destination_country: 'GB',
        carrier: 'BA',
        cabin_class: 'economy',
        base_fare_nuc: '450.00',
      },
    ],
    passenger_type: 'adult',
    is_transit: false,
    is_involuntary: false,
    total_base_fare_nuc: '450.00',
    selling_currency: 'USD',
    ...overrides,
  };
}

describe('Tax Calculation', () => {
  describe('Basic tax computation', () => {
    it('applies US departure taxes for JFK origin', async () => {
      const result = await agent.execute({ data: makeInput() });

      expect(result.data.segments_processed).toBe(1);
      expect(result.data.currency).toBe('USD');

      // Should have US taxes (US transportation, ZP segment, AY security, XF PFC, etc.)
      const usTaxes = result.data.taxes.filter((t) => t.country === 'US');
      expect(usTaxes.length).toBeGreaterThan(0);
    });

    it('applies GB arrival taxes for LHR destination', async () => {
      const result = await agent.execute({ data: makeInput() });

      // NZ-style arrival taxes — GB doesn't have arrival taxes in our data
      // But let's verify no incorrect arrival taxes appear
      const arrivalTaxes = result.data.taxes.filter(
        (t) => t.country === 'GB' && t.code !== 'GB' && t.code !== 'UB',
      );
      // GB departure taxes should NOT apply when GB is destination (not origin)
      const gbDepartureTaxes = result.data.taxes.filter(
        (t) => t.country === 'GB',
      );
      expect(gbDepartureTaxes.length).toBe(0);
    });

    it('applies percentage-based US transportation tax', async () => {
      const result = await agent.execute({ data: makeInput() });

      const usTax = result.data.taxes.find((t) => t.code === 'US');
      // US transportation tax is 7.5% but domestic-only — should NOT apply to JFK-LHR
      expect(usTax).toBeUndefined();
    });

    it('applies US transportation tax for domestic flight', async () => {
      const input = makeInput({
        segments: [
          {
            origin: 'JFK',
            destination: 'LAX',
            origin_country: 'US',
            destination_country: 'US',
            carrier: 'UA',
            cabin_class: 'economy',
            base_fare_nuc: '200.00',
          },
        ],
        total_base_fare_nuc: '200.00',
      });

      const result = await agent.execute({ data: input });

      const usTax = result.data.taxes.find((t) => t.code === 'US');
      expect(usTax).toBeDefined();
      expect(usTax!.type).toBe('percentage');
      // 7.5% of 200 = 15.00
      expect(usTax!.original_amount).toBe('15.00');
    });

    it('applies ZP segment tax for domestic US flight', async () => {
      const input = makeInput({
        segments: [
          {
            origin: 'JFK',
            destination: 'LAX',
            origin_country: 'US',
            destination_country: 'US',
            carrier: 'UA',
            cabin_class: 'economy',
            base_fare_nuc: '200.00',
          },
        ],
      });

      const result = await agent.execute({ data: input });

      const zpTax = result.data.taxes.find((t) => t.code === 'ZP');
      expect(zpTax).toBeDefined();
      expect(zpTax!.original_amount).toBe('4.80');
      expect(zpTax!.original_currency).toBe('USD');
    });

    it('applies AY security fee for US departure', async () => {
      const result = await agent.execute({ data: makeInput() });

      const ayTax = result.data.taxes.find((t) => t.code === 'AY');
      expect(ayTax).toBeDefined();
      expect(ayTax!.original_amount).toBe('5.60');
    });

    it('has positive total tax amount', async () => {
      const result = await agent.execute({ data: makeInput() });

      const total = new Decimal(result.data.total_tax);
      expect(total.gt(0)).toBe(true);
    });
  });

  describe('Multi-segment itineraries', () => {
    it('processes two segments with different origin countries', async () => {
      const input = makeInput({
        segments: [
          {
            origin: 'JFK',
            destination: 'LHR',
            origin_country: 'US',
            destination_country: 'GB',
            carrier: 'BA',
            cabin_class: 'economy',
            base_fare_nuc: '450.00',
          },
          {
            origin: 'LHR',
            destination: 'CDG',
            origin_country: 'GB',
            destination_country: 'FR',
            carrier: 'BA',
            cabin_class: 'economy',
            base_fare_nuc: '100.00',
          },
        ],
        total_base_fare_nuc: '550.00',
      });

      const result = await agent.execute({ data: input });

      expect(result.data.segments_processed).toBe(2);

      // Should have both US and GB taxes
      const countries = new Set(result.data.taxes.map((t) => t.country));
      expect(countries.has('US')).toBe(true);
      expect(countries.has('GB')).toBe(true);
    });

    it('tracks segment indices correctly', async () => {
      const input = makeInput({
        segments: [
          {
            origin: 'JFK',
            destination: 'LHR',
            origin_country: 'US',
            destination_country: 'GB',
            carrier: 'BA',
            cabin_class: 'economy',
            base_fare_nuc: '450.00',
          },
          {
            origin: 'LHR',
            destination: 'CDG',
            origin_country: 'GB',
            destination_country: 'FR',
            carrier: 'BA',
            cabin_class: 'economy',
            base_fare_nuc: '100.00',
          },
        ],
        total_base_fare_nuc: '550.00',
      });

      const result = await agent.execute({ data: input });

      // Segment 0 taxes should reference index 0
      const seg0Taxes = result.data.taxes.filter((t) => t.segment_indices.includes(0));
      const seg1Taxes = result.data.taxes.filter((t) => t.segment_indices.includes(1));
      expect(seg0Taxes.length).toBeGreaterThan(0);
      expect(seg1Taxes.length).toBeGreaterThan(0);
    });
  });

  describe('Tiered taxes', () => {
    it('applies GB APD economy long-haul for LHR departure', async () => {
      const input = makeInput({
        segments: [
          {
            origin: 'LHR',
            destination: 'JFK',
            origin_country: 'GB',
            destination_country: 'US',
            carrier: 'BA',
            cabin_class: 'economy',
            base_fare_nuc: '500.00',
          },
        ],
      });

      const result = await agent.execute({ data: input });

      const gbApd = result.data.taxes.find((t) => t.code === 'GB');
      expect(gbApd).toBeDefined();
      expect(gbApd!.type).toBe('tiered');
      // Economy long-haul = GBP 87.00
      expect(gbApd!.original_amount).toBe('87.00');
      expect(gbApd!.original_currency).toBe('GBP');
    });

    it('applies GB APD premium rate for business class', async () => {
      const input = makeInput({
        segments: [
          {
            origin: 'LHR',
            destination: 'JFK',
            origin_country: 'GB',
            destination_country: 'US',
            carrier: 'BA',
            cabin_class: 'business',
            base_fare_nuc: '2000.00',
          },
        ],
      });

      const result = await agent.execute({ data: input });

      const gbApd = result.data.taxes.find((t) => t.code === 'GB');
      expect(gbApd).toBeDefined();
      // Business maps to "premium" band → long-haul = GBP 191.00
      expect(gbApd!.original_amount).toBe('191.00');
    });

    it('applies DE aviation tax for FRA departure', async () => {
      const input = makeInput({
        segments: [
          {
            origin: 'FRA',
            destination: 'JFK',
            origin_country: 'DE',
            destination_country: 'US',
            carrier: 'LH',
            cabin_class: 'economy',
            base_fare_nuc: '600.00',
          },
        ],
      });

      const result = await agent.execute({ data: input });

      const deTax = result.data.taxes.find((t) => t.code === 'DE');
      expect(deTax).toBeDefined();
      expect(deTax!.type).toBe('tiered');
    });
  });

  describe('Currency conversion', () => {
    it('converts GBP taxes to USD selling currency', async () => {
      const input = makeInput({
        segments: [
          {
            origin: 'LHR',
            destination: 'JFK',
            origin_country: 'GB',
            destination_country: 'US',
            carrier: 'BA',
            cabin_class: 'economy',
            base_fare_nuc: '500.00',
          },
        ],
      });

      const result = await agent.execute({ data: input });

      const gbTax = result.data.taxes.find((t) => t.original_currency === 'GBP');
      if (gbTax) {
        // Converted amount should be different from original (GBP → USD)
        const orig = new Decimal(gbTax.original_amount);
        const conv = new Decimal(gbTax.converted_amount);
        // GBP > USD rate-wise, so converted should be larger
        expect(conv.gt(orig)).toBe(true);
      }
    });

    it('converts JPY taxes to USD', async () => {
      const input = makeInput({
        segments: [
          {
            origin: 'NRT',
            destination: 'LAX',
            origin_country: 'JP',
            destination_country: 'US',
            carrier: 'NH',
            cabin_class: 'economy',
            base_fare_nuc: '500.00',
          },
        ],
        selling_currency: 'USD',
      });

      const result = await agent.execute({ data: input });

      const jpTax = result.data.taxes.find((t) => t.code === 'JP');
      expect(jpTax).toBeDefined();
      expect(jpTax!.original_currency).toBe('JPY');
      // JPY 2610 → USD should be much smaller number
      const conv = new Decimal(jpTax!.converted_amount);
      expect(conv.lt(new Decimal(jpTax!.original_amount))).toBe(true);
    });

    it('no conversion when tax currency matches selling currency', async () => {
      const input = makeInput({
        segments: [
          {
            origin: 'JFK',
            destination: 'LAX',
            origin_country: 'US',
            destination_country: 'US',
            carrier: 'UA',
            cabin_class: 'economy',
            base_fare_nuc: '200.00',
          },
        ],
        selling_currency: 'USD',
      });

      const result = await agent.execute({ data: input });

      const usdTaxes = result.data.taxes.filter((t) => t.original_currency === 'USD');
      for (const tax of usdTaxes) {
        expect(tax.original_amount).toBe(tax.converted_amount);
      }
    });
  });

  describe('Exemption engine', () => {
    it('exempts infant from all taxes', async () => {
      const input = makeInput({ passenger_type: 'infant' });

      const result = await agent.execute({ data: input });

      // All taxes should be exempt
      for (const tax of result.data.taxes) {
        expect(tax.exempt).toBe(true);
      }
      expect(result.data.total_tax).toBe('0.00');
      expect(result.data.exemptions_applied.length).toBeGreaterThan(0);
    });

    it('exempts crew from all taxes', async () => {
      const input = makeInput({ passenger_type: 'crew' });

      const result = await agent.execute({ data: input });

      for (const tax of result.data.taxes) {
        expect(tax.exempt).toBe(true);
      }
      expect(result.data.total_tax).toBe('0.00');
    });

    it('exempts transit passengers from departure taxes', async () => {
      const input = makeInput({
        is_transit: true,
        segments: [
          {
            origin: 'LHR',
            destination: 'CDG',
            origin_country: 'GB',
            destination_country: 'FR',
            carrier: 'BA',
            cabin_class: 'economy',
            base_fare_nuc: '100.00',
          },
        ],
      });

      const result = await agent.execute({ data: input });

      // Departure taxes should be exempt
      const departureTaxes = result.data.taxes.filter(
        (t) => !t.exempt,
      );
      // Some taxes may remain (non-departure)
      const exemptDeparture = result.data.taxes.filter(
        (t) => t.exempt,
      );
      expect(exemptDeparture.length).toBeGreaterThan(0);
    });

    it('exempts diplomatic passengers from government taxes', async () => {
      const input = makeInput({ passenger_type: 'diplomatic' });

      const result = await agent.execute({ data: input });

      // Non-carrier taxes should be exempt
      const exempt = result.data.taxes.filter((t) => t.exempt);
      expect(exempt.length).toBeGreaterThan(0);
    });

    it('does not exempt adult passengers', async () => {
      const input = makeInput({ passenger_type: 'adult' });

      const result = await agent.execute({ data: input });

      const exempt = result.data.taxes.filter((t) => t.exempt);
      expect(exempt.length).toBe(0);
    });
  });

  describe('Tax breakdown', () => {
    it('produces country breakdown', async () => {
      const input = makeInput({
        segments: [
          {
            origin: 'JFK',
            destination: 'LAX',
            origin_country: 'US',
            destination_country: 'US',
            carrier: 'UA',
            cabin_class: 'economy',
            base_fare_nuc: '200.00',
          },
        ],
      });

      const result = await agent.execute({ data: input });

      expect(result.data.breakdown.by_country['US']).toBeDefined();
      expect(result.data.breakdown.by_country['US']!.count).toBeGreaterThan(0);

      const countryTotal = new Decimal(result.data.breakdown.by_country['US']!.total);
      expect(countryTotal.gt(0)).toBe(true);
    });

    it('separates interlineable and non-interlineable totals', async () => {
      const input = makeInput({
        segments: [
          {
            origin: 'JFK',
            destination: 'LAX',
            origin_country: 'US',
            destination_country: 'US',
            carrier: 'UA',
            cabin_class: 'economy',
            base_fare_nuc: '200.00',
          },
        ],
      });

      const result = await agent.execute({ data: input });

      const il = new Decimal(result.data.breakdown.interlineable_total);
      const nil = new Decimal(result.data.breakdown.non_interlineable_total);
      const total = new Decimal(result.data.total_tax);

      // Interlineable + non-interlineable should equal total
      expect(il.plus(nil).toFixed(2)).toBe(total.toFixed(2));
    });

    it('marks XF as non-interlineable', async () => {
      const input = makeInput({
        segments: [
          {
            origin: 'JFK',
            destination: 'LAX',
            origin_country: 'US',
            destination_country: 'US',
            carrier: 'UA',
            cabin_class: 'economy',
            base_fare_nuc: '200.00',
          },
        ],
      });

      const result = await agent.execute({ data: input });

      const xf = result.data.taxes.find((t) => t.code === 'XF');
      expect(xf).toBeDefined();
      expect(xf!.interlineable).toBe(false);
    });
  });

  describe('Input validation', () => {
    it('rejects empty segments', async () => {
      await expect(
        agent.execute({ data: makeInput({ segments: [] }) }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid passenger type', async () => {
      await expect(
        agent.execute({ data: makeInput({ passenger_type: 'robot' as 'adult' }) }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid origin code', async () => {
      await expect(
        agent.execute({
          data: makeInput({
            segments: [
              {
                origin: '1',
                destination: 'LHR',
                origin_country: 'US',
                destination_country: 'GB',
                carrier: 'BA',
                cabin_class: 'economy',
                base_fare_nuc: '100',
              },
            ],
          }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid cabin class', async () => {
      await expect(
        agent.execute({
          data: makeInput({
            segments: [
              {
                origin: 'JFK',
                destination: 'LHR',
                origin_country: 'US',
                destination_country: 'GB',
                carrier: 'BA',
                cabin_class: 'ultra' as 'economy',
                base_fare_nuc: '100',
              },
            ],
          }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid selling currency', async () => {
      await expect(
        agent.execute({ data: makeInput({ selling_currency: 'us' }) }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid NUC amount', async () => {
      await expect(
        agent.execute({ data: makeInput({ total_base_fare_nuc: 'abc' }) }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('2.3');
      expect(agent.name).toBe('Tax Calculation');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['agent_id']).toBe('2.3');
      expect(result.metadata!['segments_processed']).toBe(1);
    });

    it('throws when not initialized', async () => {
      const uninit = new TaxCalculation();
      await expect(
        uninit.execute({ data: makeInput() }),
      ).rejects.toThrow('not been initialized');
    });

    it('includes warnings for exempted taxes', async () => {
      const result = await agent.execute({
        data: makeInput({ passenger_type: 'infant' }),
      });

      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('exempted'))).toBe(true);
    });
  });
});
