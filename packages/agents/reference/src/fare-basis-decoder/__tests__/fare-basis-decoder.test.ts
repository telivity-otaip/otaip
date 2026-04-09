/**
 * Fare Basis Code Decoder — Unit Tests
 *
 * Test cases derived from the agent spec (agents/specs/0-3-fare-basis-code-decoder.yaml).
 * Pure logic tests — no external data required.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FareBasisDecoder } from '../index.js';

let decoder: FareBasisDecoder;

beforeAll(async () => {
  decoder = new FareBasisDecoder();
  await decoder.initialize();
});

afterAll(() => {
  decoder.destroy();
});

describe('Fare Basis Code Decoder', () => {
  describe('Spec test: Single-letter primary codes', () => {
    it('decodes Y as economy, normal fare', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'Y' } });
      expect(result.data.decoded).not.toBeNull();
      expect(result.data.decoded!.primary_code).toBe('Y');
      expect(result.data.decoded!.cabin_class).toBe('economy');
      expect(result.data.decoded!.fare_type).toBe('normal');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('decodes J as business class', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'J' } });
      expect(result.data.decoded!.cabin_class).toBe('business');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('decodes F as first class', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'F' } });
      expect(result.data.decoded!.cabin_class).toBe('first');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('decodes W as premium economy', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'W' } });
      expect(result.data.decoded!.cabin_class).toBe('premium_economy');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('decodes C as business class', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'C' } });
      expect(result.data.decoded!.cabin_class).toBe('business');
    });

    it('decodes P as first class', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'P' } });
      expect(result.data.decoded!.cabin_class).toBe('first');
    });
  });

  describe('Spec test: Compound fare basis codes', () => {
    it('decodes YOW as economy (OW = one-way indicator)', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'YOW' } });
      expect(result.data.decoded!.cabin_class).toBe('economy');
      expect(result.data.decoded!.primary_code).toBe('Y');
    });

    it('decodes HLXP14NR — economy, 14-day AP, non-refundable', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'HLXP14NR' } });
      expect(result.data.decoded!.cabin_class).toBe('economy');
      expect(result.data.decoded!.advance_purchase).not.toBeNull();
      expect(result.data.decoded!.advance_purchase!.days).toBe(14);
      expect(result.data.decoded!.penalties.refundable).toBe(false);
    });

    it('decodes B14NR — economy, 14-day advance, non-refundable', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'B14NR' } });
      expect(result.data.decoded!.cabin_class).toBe('economy');
      expect(result.data.decoded!.advance_purchase!.days).toBe(14);
      expect(result.data.decoded!.penalties.refundable).toBe(false);
    });

    it('decodes QAP7NR — economy, 7-day advance, non-refundable', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'Q7NR' } });
      expect(result.data.decoded!.cabin_class).toBe('economy');
      expect(result.data.decoded!.advance_purchase!.days).toBe(7);
      expect(result.data.decoded!.penalties.refundable).toBe(false);
    });
  });

  describe('Spec test: Non-refundable and advance purchase', () => {
    it('detects NR as non-refundable', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'VNR' } });
      expect(result.data.decoded!.penalties.refundable).toBe(false);
    });

    it('detects AP as advance purchase required', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'MAP' } });
      expect(result.data.decoded!.advance_purchase).not.toBeNull();
      expect(result.data.decoded!.advance_purchase!.description.toLowerCase()).toContain(
        'advance purchase',
      );
    });

    it('default is refundable when no NR detected', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'Y' } });
      expect(result.data.decoded!.penalties.refundable).toBe(true);
    });
  });

  describe('Spec test: Confidence scoring', () => {
    it('single known letter returns confidence 1.0', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'Y' } });
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('fully parsed compound returns confidence 1.0', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'Y14NR' } });
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('partially parsed returns confidence 0.7-0.9', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'YABCDEF' } });
      expect(result.data.match_confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.data.match_confidence).toBeLessThanOrEqual(0.9);
    });

    it('unknown primary code returns confidence 0.5', async () => {
      // Use a letter not in the ATPCO map
      const result = await decoder.execute({ data: { fare_basis: 'XFOO' } });
      expect(result.data.match_confidence).toBe(0.5);
    });
  });

  describe('Spec test: Unparsed segments', () => {
    it('returns unparsed segments for unrecognized modifiers', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'YZZZ' } });
      expect(result.data.unparsed_segments.length).toBeGreaterThan(0);
    });

    it('returns empty unparsed for fully decoded codes', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'Y' } });
      expect(result.data.unparsed_segments).toEqual([]);
    });
  });

  describe('Input validation', () => {
    it('rejects empty fare_basis', async () => {
      await expect(decoder.execute({ data: { fare_basis: '' } })).rejects.toThrow('Invalid input');
    });

    it('rejects fare_basis longer than 15 characters', async () => {
      await expect(decoder.execute({ data: { fare_basis: 'A'.repeat(16) } })).rejects.toThrow(
        'Invalid input',
      );
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(decoder.id).toBe('0.3');
      expect(decoder.name).toBe('Fare Basis Code Decoder');
      expect(decoder.version).toBe('0.1.0');
    });

    it('reports healthy status', async () => {
      const health = await decoder.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'Y' } });
      expect(result.metadata).toBeDefined();
      expect(result.metadata!['agent_id']).toBe('0.3');
    });

    it('throws when not initialized', async () => {
      const uninitDecoder = new FareBasisDecoder();
      await expect(uninitDecoder.execute({ data: { fare_basis: 'Y' } })).rejects.toThrow(
        'not been initialized',
      );
    });
  });

  describe('Edge cases', () => {
    it('handles lowercase input', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'yow' } });
      expect(result.data.decoded!.primary_code).toBe('Y');
      expect(result.data.decoded!.cabin_class).toBe('economy');
    });

    it('handles whitespace in input', async () => {
      const result = await decoder.execute({ data: { fare_basis: '  J  ' } });
      expect(result.data.decoded!.cabin_class).toBe('business');
    });

    it('preserves original fare_basis in output (uppercased)', async () => {
      const result = await decoder.execute({ data: { fare_basis: 'y14nr' } });
      expect(result.data.decoded!.fare_basis).toBe('Y14NR');
    });
  });
});
