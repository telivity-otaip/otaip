/**
 * GDS/NDC Router — Unit Tests
 *
 * Agent 3.1: Routes booking requests to GDS vs NDC vs DIRECT.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GdsNdcRouter } from '../index.js';

let agent: GdsNdcRouter;

beforeAll(async () => {
  agent = new GdsNdcRouter();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

describe('GDS/NDC Router', () => {
  describe('GDS-preferred carriers', () => {
    it('routes Delta to GDS (GDS-only carrier)', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'DL', origin: 'JFK', destination: 'LAX' }],
          transaction_type: 'shopping',
          include_fallbacks: true,
        },
      });

      expect(result.data.routings[0]!.primary_channel).toBe('GDS');
      expect(result.data.routings[0]!.gds_system).toBe('AMADEUS');
      expect(result.data.routings[0]!.ndc_version).toBeNull();
      expect(result.data.routings[0]!.booking_format).toBe('GDS_PNR');
    });

    it('routes United to GDS (GDS-preferred)', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'UA', origin: 'SFO', destination: 'LHR' }],
          transaction_type: 'shopping',
          include_fallbacks: true,
        },
      });

      expect(result.data.routings[0]!.primary_channel).toBe('GDS');
      expect(result.data.routings[0]!.fallbacks).toContain('NDC');
    });

    it('routes Emirates to GDS (no NDC support)', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'EK', origin: 'DXB', destination: 'LHR' }],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.routings[0]!.primary_channel).toBe('GDS');
      expect(result.data.routings[0]!.ndc_capable).toBeUndefined();
    });

    it('routes Alaska Airlines to SABRE', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'AS', origin: 'SEA', destination: 'LAX' }],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.routings[0]!.gds_system).toBe('SABRE');
    });
  });

  describe('NDC-preferred carriers', () => {
    it('routes British Airways to NDC (NDC-preferred)', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
          transaction_type: 'shopping',
          include_fallbacks: true,
        },
      });

      expect(result.data.routings[0]!.primary_channel).toBe('NDC');
      expect(result.data.routings[0]!.ndc_version).toBe('21.3');
      expect(result.data.routings[0]!.ndc_provider_id).toBe('NDC_BA');
      expect(result.data.routings[0]!.booking_format).toBe('NDC_ORDER');
      expect(result.data.routings[0]!.fallbacks).toContain('GDS');
    });

    it('routes Lufthansa to NDC with v21.3', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'LH', origin: 'FRA', destination: 'JFK' }],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.routings[0]!.primary_channel).toBe('NDC');
      expect(result.data.routings[0]!.ndc_version).toBe('21.3');
      expect(result.data.routings[0]!.ndc_provider_id).toBe('NDC_LH');
    });

    it('routes American Airlines to NDC', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'AA', origin: 'DFW', destination: 'LHR' }],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.routings[0]!.primary_channel).toBe('NDC');
      expect(result.data.routings[0]!.ndc_version).toBe('21.3');
    });

    it('routes Singapore Airlines to NDC with v18.1', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'SQ', origin: 'SIN', destination: 'LHR' }],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.routings[0]!.ndc_version).toBe('18.1');
    });
  });

  describe('DIRECT-only carriers', () => {
    it('routes Southwest to DIRECT', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'WN', origin: 'LAX', destination: 'LAS' }],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.routings[0]!.primary_channel).toBe('DIRECT');
      expect(result.data.routings[0]!.booking_format).toBe('DIRECT_API');
    });

    it('routes Ryanair to DIRECT', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'FR', origin: 'STN', destination: 'DUB' }],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.routings[0]!.primary_channel).toBe('DIRECT');
    });

    it('warns about DIRECT-only segments', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'WN', origin: 'LAX', destination: 'LAS' }],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('DIRECT'))).toBe(true);
    });
  });

  describe('Codeshare routing', () => {
    it('routes by operating carrier when codeshare is detected', async () => {
      const result = await agent.execute({
        data: {
          segments: [
            {
              marketing_carrier: 'QF',
              operating_carrier: 'BA',
              origin: 'LHR',
              destination: 'SYD',
            },
          ],
          transaction_type: 'shopping',
          include_fallbacks: true,
        },
      });

      // BA is NDC-preferred, so should route via NDC
      expect(result.data.routings[0]!.primary_channel).toBe('NDC');
      expect(result.data.routings[0]!.routed_carrier).toBe('BA');
      expect(result.data.routings[0]!.codeshare_applied).toBe(true);
    });

    it('falls back to marketing carrier when operating carrier unknown', async () => {
      const result = await agent.execute({
        data: {
          segments: [
            {
              marketing_carrier: 'BA',
              operating_carrier: 'XX',
              origin: 'LHR',
              destination: 'JFK',
            },
          ],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.routings[0]!.routed_carrier).toBe('BA');
      expect(result.data.routings[0]!.codeshare_applied).toBe(false);
    });

    it('warns about codeshare routing', async () => {
      const result = await agent.execute({
        data: {
          segments: [
            {
              marketing_carrier: 'QF',
              operating_carrier: 'BA',
              origin: 'LHR',
              destination: 'SYD',
            },
          ],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('Codeshare'))).toBe(true);
    });
  });

  describe('Channel preference override', () => {
    it('overrides to GDS when preferred', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
          preferred_channel: 'GDS',
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.routings[0]!.primary_channel).toBe('GDS');
    });

    it('overrides GDS system to SABRE', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'DL', origin: 'JFK', destination: 'LAX' }],
          preferred_gds: 'SABRE',
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.routings[0]!.gds_system).toBe('SABRE');
    });

    it('ignores unavailable channel preference', async () => {
      // Southwest only supports DIRECT
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'WN', origin: 'LAX', destination: 'LAS' }],
          preferred_channel: 'GDS',
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      // Falls back to default (DIRECT)
      expect(result.data.routings[0]!.primary_channel).toBe('DIRECT');
    });
  });

  describe('Channel fallbacks', () => {
    it('includes fallbacks when requested', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
          transaction_type: 'shopping',
          include_fallbacks: true,
        },
      });

      expect(result.data.routings[0]!.fallbacks.length).toBeGreaterThan(0);
      expect(result.data.routings[0]!.fallbacks).toContain('GDS');
    });

    it('excludes fallbacks when not requested', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.routings[0]!.fallbacks.length).toBe(0);
    });
  });

  describe('Multi-segment routing', () => {
    it('detects unified channel for same-carrier segments', async () => {
      const result = await agent.execute({
        data: {
          segments: [
            { marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' },
            { marketing_carrier: 'BA', origin: 'JFK', destination: 'LHR' },
          ],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.unified_channel).toBe(true);
      expect(result.data.recommended_channel).toBe('NDC');
    });

    it('detects mixed channels for different carriers', async () => {
      const result = await agent.execute({
        data: {
          segments: [
            { marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' },
            { marketing_carrier: 'WN', origin: 'JFK', destination: 'LAX' },
          ],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.unified_channel).toBe(false);
      expect(result.data.recommended_channel).toBeNull();
    });

    it('warns about mixed channel routing', async () => {
      const result = await agent.execute({
        data: {
          segments: [
            { marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' },
            { marketing_carrier: 'DL', origin: 'JFK', destination: 'LAX' },
          ],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('Mixed channel'))).toBe(true);
    });
  });

  describe('Format translation stubs', () => {
    it('produces GDS PNR format for GDS routing', async () => {
      const result = await agent.execute({
        data: {
          segments: [
            { marketing_carrier: 'DL', origin: 'JFK', destination: 'LAX', flight_number: '100' },
          ],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.gds_format).not.toBeNull();
      expect(result.data.gds_format!.format).toBe('GDS_PNR');
      expect(result.data.gds_format!.segments.length).toBe(1);
    });

    it('produces NDC Order format for NDC routing', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.ndc_format).not.toBeNull();
      expect(result.data.ndc_format!.format).toBe('NDC_ORDER');
      expect(result.data.ndc_format!.ndc_version).toBe('21.3');
    });

    it('returns null GDS format for NDC-only routing', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.gds_format).toBeNull();
    });
  });

  describe('Unknown carrier', () => {
    it('returns DOMAIN_INPUT_REQUIRED for unknown carrier (no invented default)', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'ZZ', origin: 'LHR', destination: 'JFK' }],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });

      expect(result.data.routings[0]!.domain_input_required).toBe(true);
      expect(result.data.routings[0]!.missing_inputs).toBeDefined();
      expect(result.warnings!.some((w) => w.includes('DOMAIN_INPUT_REQUIRED'))).toBe(true);
    });

    it('uses caller-supplied capability_overrides for unknown carrier', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'ZZ', origin: 'LHR', destination: 'JFK' }],
          transaction_type: 'shopping',
          capability_overrides: {
            ZZ: {
              shopping: {
                name: 'Unknown Carrier',
                channels: ['GDS'],
                channel_priority: ['GDS'],
                ndc_version: null,
                gds_preference: 'SABRE',
                ndc_capable: false,
                ndc_provider_id: null,
              },
            },
          },
          include_fallbacks: false,
        },
      });
      expect(result.data.routings[0]!.domain_input_required).toBeUndefined();
      expect(result.data.routings[0]!.primary_channel).toBe('GDS');
      expect(result.data.routings[0]!.gds_system).toBe('SABRE');
    });
  });

  describe('Per-transaction routing (CLAUDE.md compliance)', () => {
    it('returns DOMAIN_INPUT_REQUIRED for group transactions on NDC carrier', async () => {
      // Built-in carrier defaults cover shopping/booking only. Groups
      // routinely need GDS for NDC carriers.
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
          transaction_type: 'group',
          include_fallbacks: false,
        },
      });
      expect(result.data.routings[0]!.domain_input_required).toBe(true);
      expect(result.data.routings[0]!.missing_inputs![0]).toContain('group');
    });

    it('routes BA group transaction via GDS when override supplied', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
          transaction_type: 'group',
          capability_overrides: {
            BA: {
              group: {
                name: 'British Airways',
                channels: ['GDS'],
                channel_priority: ['GDS'],
                ndc_version: null,
                gds_preference: 'AMADEUS',
                ndc_capable: false,
                ndc_provider_id: null,
              },
            },
          },
          include_fallbacks: false,
        },
      });
      expect(result.data.routings[0]!.domain_input_required).toBeUndefined();
      expect(result.data.routings[0]!.primary_channel).toBe('GDS');
    });

    it('returns DOMAIN_INPUT_REQUIRED for servicing of an NDC carrier without override', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'LH', origin: 'FRA', destination: 'JFK' }],
          transaction_type: 'servicing',
          include_fallbacks: false,
        },
      });
      expect(result.data.routings[0]!.domain_input_required).toBe(true);
    });

    it('returns DOMAIN_INPUT_REQUIRED for corporate transactions without override', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'AA', origin: 'DFW', destination: 'LHR' }],
          transaction_type: 'corporate',
          include_fallbacks: false,
        },
      });
      expect(result.data.routings[0]!.domain_input_required).toBe(true);
    });

    it('caller override beats built-in default for shopping', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
          transaction_type: 'shopping',
          capability_overrides: {
            BA: {
              shopping: {
                name: 'British Airways',
                channels: ['GDS'],
                channel_priority: ['GDS'],
                ndc_version: null,
                gds_preference: 'SABRE',
                ndc_capable: false,
                ndc_provider_id: null,
              },
            },
          },
          include_fallbacks: false,
        },
      });
      // Built-in default is NDC for BA; override forces GDS/SABRE.
      expect(result.data.routings[0]!.primary_channel).toBe('GDS');
      expect(result.data.routings[0]!.gds_system).toBe('SABRE');
    });
  });

  describe('Input validation', () => {
    it('rejects empty segments', async () => {
      await expect(
        agent.execute({
          data: { segments: [], transaction_type: 'shopping', include_fallbacks: false },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects missing transaction_type', async () => {
      await expect(
        agent.execute({
          data: {
            segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
            include_fallbacks: false,
          } as Parameters<typeof agent.execute>[0]['data'],
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid transaction_type', async () => {
      await expect(
        agent.execute({
          data: {
            segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
            transaction_type: 'unknown' as 'shopping',
            include_fallbacks: false,
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid carrier code', async () => {
      await expect(
        agent.execute({
          data: {
            segments: [{ marketing_carrier: 'TOOLONG', origin: 'JFK', destination: 'LHR' }],
            transaction_type: 'shopping',
          include_fallbacks: false,
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid preferred channel', async () => {
      await expect(
        agent.execute({
          data: {
            segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
            preferred_channel: 'INVALID' as 'GDS',
            transaction_type: 'shopping',
          include_fallbacks: false,
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid origin', async () => {
      await expect(
        agent.execute({
          data: {
            segments: [{ marketing_carrier: 'BA', origin: '1', destination: 'JFK' }],
            transaction_type: 'shopping',
          include_fallbacks: false,
          },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('3.1');
      expect(agent.name).toBe('GDS/NDC Router');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await agent.execute({
        data: {
          segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
          transaction_type: 'shopping',
          include_fallbacks: false,
        },
      });
      expect(result.metadata!['agent_id']).toBe('3.1');
    });

    it('throws when not initialized', async () => {
      const uninit = new GdsNdcRouter();
      await expect(
        uninit.execute({
          data: {
            segments: [{ marketing_carrier: 'BA', origin: 'LHR', destination: 'JFK' }],
            transaction_type: 'shopping',
          include_fallbacks: false,
          },
        }),
      ).rejects.toThrow('not been initialized');
    });
  });
});
