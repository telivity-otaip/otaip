/**
 * Fare Construction — Unit Tests
 *
 * Agent 2.2: NUC × ROE, mileage validation, HIP, BHC, CTM, surcharges, IATA rounding.
 * All amounts verified with decimal.js precision.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FareConstruction } from '../index.js';
import { Decimal } from 'decimal.js';

let agent: FareConstruction;

beforeAll(async () => {
  agent = new FareConstruction();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

describe('Fare Construction', () => {
  describe('One-way (OW) fare construction', () => {
    it('constructs JFK-LHR OW fare in USD', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'UA',
              fare_basis: 'V14NR',
              nuc_amount: '450.00',
            },
          ],
          selling_currency: 'USD',
        },
      });

      expect(result.data.total_nuc).toBe('450.00');
      expect(result.data.roe).toBe('1.000000');
      // USD ROE=1, so local = NUC = 450.00
      expect(result.data.local_amount).toBe('450');
      expect(result.data.currency).toBe('USD');
    });

    it('constructs JFK-LHR OW fare in GBP', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'BA',
              fare_basis: 'Y',
              nuc_amount: '1200.00',
            },
          ],
          selling_currency: 'GBP',
        },
      });

      // NUC 1200 × ROE 0.79365 = GBP 952.38
      const expectedRaw = new Decimal('1200.00').mul('0.793650');
      expect(result.data.roe).toBe('0.793650');
      expect(new Decimal(result.data.local_amount_raw).toFixed(2)).toBe(expectedRaw.toFixed(2));
    });

    it('constructs fare in JPY with correct rounding (round to 1)', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'SFO',
              destination: 'NRT',
              carrier: 'NH',
              fare_basis: 'V14NR',
              nuc_amount: '500.00',
            },
          ],
          selling_currency: 'JPY',
        },
      });

      // NUC 500 × ROE 149.52 = JPY 74760
      expect(result.data.rounding_unit).toBe('1');
      // Should be a whole number
      expect(result.data.local_amount).toMatch(/^\d+$/);
    });

    it('constructs fare in CHF with 0.05 rounding', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'UA',
              fare_basis: 'Y',
              nuc_amount: '333.33',
            },
          ],
          selling_currency: 'CHF',
        },
      });

      expect(result.data.rounding_unit).toBe('0.05');
      // Verify rounding: amount should be divisible by 0.05
      const amount = new Decimal(result.data.local_amount);
      expect(amount.mod('0.05').eq(0)).toBe(true);
    });

    it('constructs fare in KRW with 100-unit rounding', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'UA',
              fare_basis: 'Y',
              nuc_amount: '100.00',
            },
          ],
          selling_currency: 'KRW',
        },
      });

      expect(result.data.rounding_unit).toBe('100');
      const amount = new Decimal(result.data.local_amount);
      expect(amount.mod('100').eq(0)).toBe(true);
    });
  });

  describe('Round-trip (RT) fare construction', () => {
    it('constructs JFK-LHR-JFK RT fare', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'RT',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'BA',
              fare_basis: 'V14NR',
              nuc_amount: '450.00',
            },
            {
              origin: 'LHR',
              destination: 'JFK',
              carrier: 'BA',
              fare_basis: 'V14NR',
              nuc_amount: '450.00',
            },
          ],
          selling_currency: 'USD',
        },
      });

      expect(result.data.total_nuc).toBe('900.00');
      expect(result.data.local_amount).toBe('900');
    });

    it('has mileage checks for each segment', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'RT',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'BA',
              fare_basis: 'Y',
              nuc_amount: '600.00',
            },
            {
              origin: 'LHR',
              destination: 'JFK',
              carrier: 'BA',
              fare_basis: 'Y',
              nuc_amount: '600.00',
            },
          ],
          selling_currency: 'USD',
        },
      });

      expect(result.data.mileage_checks.length).toBe(2);
      expect(result.data.mileage_checks[0]!.data_available).toBe(true);
      expect(result.data.mileage_checks[0]!.tpm).toBe(3459);
    });
  });

  describe('Circle trip (CT) fare construction', () => {
    it('constructs JFK-LHR-CDG-JFK CT fare', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'CT',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'BA',
              fare_basis: 'Y',
              nuc_amount: '500.00',
            },
            {
              origin: 'LHR',
              destination: 'CDG',
              carrier: 'AF',
              fare_basis: 'Y',
              nuc_amount: '100.00',
            },
            {
              origin: 'CDG',
              destination: 'JFK',
              carrier: 'AF',
              fare_basis: 'Y',
              nuc_amount: '480.00',
            },
          ],
          selling_currency: 'USD',
        },
      });

      expect(result.data.total_nuc).toBe('1080.00');
      expect(result.data.ctm_check.applies).toBe(true);
    });

    it('CTM not applied for OW journey', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'BA',
              fare_basis: 'Y',
              nuc_amount: '500.00',
            },
          ],
          selling_currency: 'USD',
        },
      });

      expect(result.data.ctm_check.applies).toBe(false);
    });
  });

  describe('Mileage exceeded and surcharges', () => {
    it('detects mileage not exceeded for direct JFK-LHR', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'UA',
              fare_basis: 'Y',
              nuc_amount: '500.00',
            },
          ],
          selling_currency: 'USD',
        },
      });

      expect(result.data.mileage_exceeded).toBe(false);
      expect(result.data.mileage_surcharge.applies).toBe(false);
    });

    it('warns when mileage data is unavailable', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'XXX',
              destination: 'YYY',
              carrier: 'UA',
              fare_basis: 'Y',
              nuc_amount: '100.00',
            },
          ],
          selling_currency: 'USD',
        },
      });

      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('No mileage data'))).toBe(true);
    });
  });

  describe('HIP single-component', () => {
    it('detects no HIP for simple direct fare', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'BA',
              fare_basis: 'Y',
              nuc_amount: '500.00',
            },
          ],
          selling_currency: 'USD',
        },
      });

      if ('status' in result.data && result.data.status === 'DOMAIN_INPUT_REQUIRED') {
        throw new Error('Expected normal output');
      }
      expect(result.data.hip_check.detected).toBe(false);
      expect(result.data.hip_check.missing_inputs).toBeUndefined();
    });
  });

  describe('BHC detection', () => {
    it('reports BHC undetected with DOMAIN_INPUT_REQUIRED for multi-component fares', async () => {
      // Real BHC requires geographic-direction analysis. Simple
      // city-revisited heuristics were a CLAUDE.md violation and removed.
      const result = await agent.execute({
        data: {
          journey_type: 'CT',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'BA',
              fare_basis: 'Y',
              nuc_amount: '400.00',
            },
            {
              origin: 'LHR',
              destination: 'CDG',
              carrier: 'AF',
              fare_basis: 'Y',
              nuc_amount: '100.00',
            },
            {
              origin: 'CDG',
              destination: 'LHR',
              carrier: 'BA',
              fare_basis: 'Y',
              nuc_amount: '100.00',
            },
            {
              origin: 'LHR',
              destination: 'JFK',
              carrier: 'BA',
              fare_basis: 'Y',
              nuc_amount: '400.00',
            },
          ],
          selling_currency: 'USD',
        },
      });

      if ('status' in result.data && result.data.status === 'DOMAIN_INPUT_REQUIRED') {
        throw new Error('Expected normal output, got DOMAIN_INPUT_REQUIRED');
      }
      expect(result.data.bhc_check.detected).toBe(false);
      expect(result.data.bhc_check.missing_inputs).toBeDefined();
      expect(result.data.bhc_check.missing_inputs!.length).toBeGreaterThan(0);
      expect(result.warnings!.some((w) => w.includes('DOMAIN_INPUT_REQUIRED (BHC)'))).toBe(true);
    });
  });

  describe('HIP detection', () => {
    it('reports HIP undetected with DOMAIN_INPUT_REQUIRED for multi-component fares', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'BA',
              fare_basis: 'Y',
              nuc_amount: '500.00',
            },
            {
              origin: 'LHR',
              destination: 'CDG',
              carrier: 'AF',
              fare_basis: 'Y',
              nuc_amount: '200.00',
            },
          ],
          selling_currency: 'USD',
        },
      });
      if ('status' in result.data && result.data.status === 'DOMAIN_INPUT_REQUIRED') {
        throw new Error('Expected normal output, got DOMAIN_INPUT_REQUIRED');
      }
      expect(result.data.hip_check.detected).toBe(false);
      expect(result.data.hip_check.missing_inputs).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('DOMAIN_INPUT_REQUIRED (HIP)'))).toBe(true);
    });
  });

  describe('Audit trail', () => {
    it('produces a 12-step audit trail', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'UA',
              fare_basis: 'Y',
              nuc_amount: '500.00',
            },
          ],
          selling_currency: 'USD',
        },
      });

      expect(result.data.audit_trail.length).toBe(12);
      expect(result.data.audit_trail[0]!.step).toBe(1);
      expect(result.data.audit_trail[11]!.step).toBe(12);
      expect(result.data.audit_trail[11]!.name).toBe('Final Fare');
    });
  });

  describe('ROE conversion', () => {
    it('uses correct ROE for EUR', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'JFK',
              destination: 'CDG',
              carrier: 'AF',
              fare_basis: 'Y',
              nuc_amount: '1000.00',
            },
          ],
          selling_currency: 'EUR',
        },
      });

      expect(result.data.roe).toBe('0.920830');
      const expected = new Decimal('1000.00').mul('0.920830');
      expect(new Decimal(result.data.local_amount_raw).toFixed(2)).toBe(expected.toFixed(2));
    });

    it('returns DOMAIN_INPUT_REQUIRED for unknown currency (no ROE fallback)', async () => {
      // Previous behaviour silently fell back to 1.0, producing wrong fares.
      // Now refuses to construct without an authoritative ROE.
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'UA',
              fare_basis: 'Y',
              nuc_amount: '100.00',
            },
          ],
          selling_currency: 'XYZ',
        },
      });

      expect('status' in result.data && result.data.status).toBe('DOMAIN_INPUT_REQUIRED');
      if ('status' in result.data && result.data.status === 'DOMAIN_INPUT_REQUIRED') {
        expect(result.data.missing).toContain('roe_table_entry:XYZ');
        expect(result.data.references).toContain('IATA monthly ROE publication');
      }
      expect(result.confidence).toBe(0);
      expect(result.warnings!.some((w) => w.includes('DOMAIN_INPUT_REQUIRED'))).toBe(true);
    });
  });

  describe('Input validation', () => {
    it('rejects invalid journey_type', async () => {
      await expect(
        agent.execute({
          data: {
            journey_type: 'XX' as 'OW',
            components: [
              {
                origin: 'JFK',
                destination: 'LHR',
                carrier: 'UA',
                fare_basis: 'Y',
                nuc_amount: '100',
              },
            ],
            selling_currency: 'USD',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects empty components', async () => {
      await expect(
        agent.execute({
          data: { journey_type: 'OW', components: [], selling_currency: 'USD' },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid origin in component', async () => {
      await expect(
        agent.execute({
          data: {
            journey_type: 'OW',
            components: [
              {
                origin: '1',
                destination: 'LHR',
                carrier: 'UA',
                fare_basis: 'Y',
                nuc_amount: '100',
              },
            ],
            selling_currency: 'USD',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid NUC amount', async () => {
      await expect(
        agent.execute({
          data: {
            journey_type: 'OW',
            components: [
              {
                origin: 'JFK',
                destination: 'LHR',
                carrier: 'UA',
                fare_basis: 'Y',
                nuc_amount: 'abc',
              },
            ],
            selling_currency: 'USD',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid currency', async () => {
      await expect(
        agent.execute({
          data: {
            journey_type: 'OW',
            components: [
              {
                origin: 'JFK',
                destination: 'LHR',
                carrier: 'UA',
                fare_basis: 'Y',
                nuc_amount: '100',
              },
            ],
            selling_currency: 'us',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('2.2');
      expect(agent.name).toBe('Fare Construction');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({
        data: {
          journey_type: 'OW',
          components: [
            {
              origin: 'JFK',
              destination: 'LHR',
              carrier: 'UA',
              fare_basis: 'Y',
              nuc_amount: '100',
            },
          ],
          selling_currency: 'USD',
        },
      });
      expect(result.metadata!['agent_id']).toBe('2.2');
    });

    it('throws when not initialized', async () => {
      const uninit = new FareConstruction();
      await expect(
        uninit.execute({
          data: {
            journey_type: 'OW',
            components: [
              {
                origin: 'JFK',
                destination: 'LHR',
                carrier: 'UA',
                fare_basis: 'Y',
                nuc_amount: '100',
              },
            ],
            selling_currency: 'USD',
          },
        }),
      ).rejects.toThrow('not been initialized');
    });
  });
});
