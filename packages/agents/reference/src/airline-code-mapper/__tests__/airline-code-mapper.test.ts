/**
 * Airline Code & Alliance Mapper — Unit Tests
 *
 * Test cases derived from the agent spec (agents/specs/0-2-airline-code-alliance-mapper.yaml).
 * Uses static inline data — no temp files or external datasets needed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AirlineCodeMapper } from '../index.js';

// --- Test setup ---

let mapper: AirlineCodeMapper;

beforeAll(async () => {
  mapper = new AirlineCodeMapper();
  await mapper.initialize();
});

afterAll(() => {
  mapper.destroy();
});

// --- Tests per spec ---

describe('Airline Code & Alliance Mapper', () => {
  describe('Spec test: Exact IATA code lookup', () => {
    it('resolves UA to United Airlines', async () => {
      const result = await mapper.execute({
        data: { code: 'UA', code_type: 'iata' },
      });

      expect(result.data.airline).not.toBeNull();
      expect(result.data.airline!.iata_code).toBe('UA');
      expect(result.data.airline!.icao_code).toBe('UAL');
      expect(result.data.airline!.name).toBe('United Airlines');
      expect(result.data.airline!.alliance).toBe('star_alliance');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('resolves AA to American Airlines', async () => {
      const result = await mapper.execute({
        data: { code: 'AA', code_type: 'iata' },
      });

      expect(result.data.airline!.iata_code).toBe('AA');
      expect(result.data.airline!.name).toBe('American Airlines');
      expect(result.data.airline!.alliance).toBe('oneworld');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('resolves DL to Delta Air Lines (SkyTeam)', async () => {
      const result = await mapper.execute({
        data: { code: 'DL', code_type: 'iata' },
      });

      expect(result.data.airline!.iata_code).toBe('DL');
      expect(result.data.airline!.name).toBe('Delta Air Lines');
      expect(result.data.airline!.alliance).toBe('skyteam');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('is case-insensitive', async () => {
      const result = await mapper.execute({
        data: { code: 'ua' },
      });

      expect(result.data.airline!.iata_code).toBe('UA');
      expect(result.data.match_confidence).toBe(1.0);
    });
  });

  describe('Spec test: Exact ICAO code lookup', () => {
    it('resolves BAW to British Airways', async () => {
      const result = await mapper.execute({
        data: { code: 'BAW', code_type: 'icao' },
      });

      expect(result.data.airline).not.toBeNull();
      expect(result.data.airline!.iata_code).toBe('BA');
      expect(result.data.airline!.icao_code).toBe('BAW');
      expect(result.data.airline!.alliance).toBe('oneworld');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('resolves UAL to United Airlines', async () => {
      const result = await mapper.execute({
        data: { code: 'UAL', code_type: 'icao' },
      });

      expect(result.data.airline!.iata_code).toBe('UA');
      expect(result.data.airline!.icao_code).toBe('UAL');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('resolves DAL to Delta Air Lines', async () => {
      const result = await mapper.execute({
        data: { code: 'DAL', code_type: 'icao' },
      });

      expect(result.data.airline!.iata_code).toBe('DL');
      expect(result.data.airline!.icao_code).toBe('DAL');
    });
  });

  describe('Spec test: Fuzzy name match', () => {
    it('resolves "delta" to Delta Air Lines', async () => {
      const result = await mapper.execute({
        data: { code: 'delta', code_type: 'name' },
      });

      expect(result.data.airline).not.toBeNull();
      expect(result.data.airline!.iata_code).toBe('DL');
      expect(result.data.airline!.alliance).toBe('skyteam');
      expect(result.data.match_confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('resolves "lufthansa" to LH', async () => {
      const result = await mapper.execute({
        data: { code: 'lufthansa', code_type: 'name' },
      });

      expect(result.data.airline).not.toBeNull();
      expect(result.data.airline!.iata_code).toBe('LH');
    });

    it('resolves "emirates" to EK', async () => {
      const result = await mapper.execute({
        data: { code: 'emirates', code_type: 'name' },
      });

      expect(result.data.airline).not.toBeNull();
      expect(result.data.airline!.iata_code).toBe('EK');
      expect(result.data.airline!.alliance).toBeNull();
    });
  });

  describe('Spec test: Alliance mapping', () => {
    it('maps UA to Star Alliance', async () => {
      const result = await mapper.execute({
        data: { code: 'UA' },
      });

      expect(result.data.airline!.alliance).toBe('star_alliance');
      expect(result.data.airline!.alliance_status).toBe('full_member');
    });

    it('maps BA to oneworld', async () => {
      const result = await mapper.execute({
        data: { code: 'BA' },
      });

      expect(result.data.airline!.alliance).toBe('oneworld');
      expect(result.data.airline!.alliance_status).toBe('full_member');
    });

    it('maps AF to SkyTeam', async () => {
      const result = await mapper.execute({
        data: { code: 'AF' },
      });

      expect(result.data.airline!.alliance).toBe('skyteam');
      expect(result.data.airline!.alliance_status).toBe('full_member');
    });

    it('EK has no alliance', async () => {
      const result = await mapper.execute({
        data: { code: 'EK' },
      });

      expect(result.data.airline!.alliance).toBeNull();
      expect(result.data.airline!.alliance_status).toBeNull();
    });
  });

  describe('Spec test: Codeshare partners', () => {
    it('returns codeshare partners for UA when include_codeshares=true', async () => {
      const result = await mapper.execute({
        data: { code: 'UA', include_codeshares: true },
      });

      expect(result.data.codeshare_partners).not.toBeNull();
      expect(result.data.codeshare_partners!.length).toBeGreaterThan(0);

      const partnerCodes = result.data.codeshare_partners!.map((p) => p.iata_code);
      expect(partnerCodes).toContain('LH');
      expect(partnerCodes).toContain('AC');
      expect(partnerCodes).toContain('NH');
    });

    it('returns null codeshare_partners when include_codeshares=false', async () => {
      const result = await mapper.execute({
        data: { code: 'UA', include_codeshares: false },
      });

      expect(result.data.codeshare_partners).toBeNull();
    });

    it('returns null codeshare_partners for airlines without mappings', async () => {
      const result = await mapper.execute({
        data: { code: 'EK', include_codeshares: true },
      });

      expect(result.data.codeshare_partners).toBeNull();
    });

    it('includes relationship type in codeshare data', async () => {
      const result = await mapper.execute({
        data: { code: 'AA', include_codeshares: true },
      });

      expect(result.data.codeshare_partners).not.toBeNull();
      const baPartner = result.data.codeshare_partners!.find((p) => p.iata_code === 'BA');
      expect(baPartner).toBeDefined();
      expect(baPartner!.relationship).toBe('joint_venture');
    });
  });

  describe('Spec test: Defunct airline handling', () => {
    it('resolves PA with include_defunct=true', async () => {
      const result = await mapper.execute({
        data: { code: 'PA', include_defunct: true },
      });

      expect(result.data.airline).not.toBeNull();
      expect(result.data.airline!.name).toBe('Pan American World Airways');
      expect(result.data.airline!.status).toBe('defunct');
      expect(result.data.airline!.defunct_date).toBe('1991-12-04');
      expect(result.data.airline!.merged_into).toBe('DL');
    });

    it('returns null for PA with include_defunct=false', async () => {
      const result = await mapper.execute({
        data: { code: 'PA', include_defunct: false },
      });

      expect(result.data.airline).toBeNull();
      expect(result.data.match_confidence).toBe(0);
    });

    it('resolves TW (merged into AA) with include_defunct=true', async () => {
      const result = await mapper.execute({
        data: { code: 'TW', include_defunct: true },
      });

      expect(result.data.airline).not.toBeNull();
      expect(result.data.airline!.name).toBe('Trans World Airlines');
      expect(result.data.airline!.status).toBe('merged');
      expect(result.data.airline!.merged_into).toBe('AA');
    });
  });

  describe('Spec test: Unknown code', () => {
    it('returns null with confidence 0 for ZZ', async () => {
      const result = await mapper.execute({
        data: { code: 'ZZ' },
      });

      expect(result.data.airline).toBeNull();
      expect(result.data.match_confidence).toBe(0);
    });

    it('returns null with confidence 0 for unknown ICAO code', async () => {
      const result = await mapper.execute({
        data: { code: 'ZZZ', code_type: 'icao' },
      });

      expect(result.data.airline).toBeNull();
      expect(result.data.match_confidence).toBe(0);
    });
  });

  describe('Input validation', () => {
    it('rejects empty code', async () => {
      await expect(mapper.execute({ data: { code: '' } })).rejects.toThrow('Invalid input');
    });

    it('rejects code longer than 100 characters', async () => {
      await expect(mapper.execute({ data: { code: 'a'.repeat(101) } })).rejects.toThrow(
        'Invalid input',
      );
    });

    it('rejects invalid code_type', async () => {
      await expect(
        mapper.execute({
          data: { code: 'UA', code_type: 'invalid' as 'iata' },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(mapper.id).toBe('0.2');
      expect(mapper.name).toBe('Airline Code & Alliance Mapper');
      expect(mapper.version).toBe('0.1.0');
    });

    it('reports healthy status', async () => {
      const health = await mapper.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await mapper.execute({
        data: { code: 'UA' },
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata!['agent_id']).toBe('0.2');
      expect(result.metadata!['agent_version']).toBe('0.1.0');
    });

    it('throws when not initialized', async () => {
      const uninitMapper = new AirlineCodeMapper();
      await expect(uninitMapper.execute({ data: { code: 'UA' } })).rejects.toThrow(
        'not been initialized',
      );
    });

    it('reports unhealthy when not initialized', async () => {
      const uninitMapper = new AirlineCodeMapper();
      const health = await uninitMapper.health();
      expect(health.status).toBe('unhealthy');
    });
  });

  describe('Edge cases', () => {
    it('handles whitespace in input', async () => {
      const result = await mapper.execute({
        data: { code: '  UA  ' },
      });

      expect(result.data.airline!.iata_code).toBe('UA');
    });

    it('returns hub_airports as array', async () => {
      const result = await mapper.execute({
        data: { code: 'UA' },
      });

      expect(Array.isArray(result.data.airline!.hub_airports)).toBe(true);
      expect(result.data.airline!.hub_airports.length).toBeGreaterThan(0);
    });

    it('non-alliance carrier has null alliance fields', async () => {
      const result = await mapper.execute({
        data: { code: 'WN' },
      });

      expect(result.data.airline!.alliance).toBeNull();
      expect(result.data.airline!.alliance_status).toBeNull();
    });

    it('auto-detects 2-char code as IATA', async () => {
      const result = await mapper.execute({
        data: { code: 'BA' },
      });

      expect(result.data.airline!.iata_code).toBe('BA');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('auto-detects 3-char alpha code as ICAO', async () => {
      const result = await mapper.execute({
        data: { code: 'BAW' },
      });

      expect(result.data.airline!.icao_code).toBe('BAW');
      expect(result.data.match_confidence).toBe(1.0);
    });
  });
});
