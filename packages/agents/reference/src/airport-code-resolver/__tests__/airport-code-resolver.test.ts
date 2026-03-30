/**
 * Airport Code Resolver — Unit Tests
 *
 * Test cases derived from the agent spec (agents/specs/0-1-airport-code-resolver.yaml).
 * Uses a minimal test dataset to avoid depending on downloaded data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AirportCodeResolver } from '../index.js';
import type { ProcessedAirport, MetroArea, DecommissionedAirport } from '../types.js';

// --- Test fixtures ---

const TEST_AIRPORTS: ProcessedAirport[] = [
  {
    iata_code: 'JFK',
    icao_code: 'KJFK',
    name: 'John F Kennedy International Airport',
    city_name: 'New York',
    city_code: 'NYC',
    country_code: 'US',
    country_name: 'United States',
    timezone: 'America/New_York',
    latitude: 40.6413,
    longitude: -73.7781,
    elevation_ft: 13,
    type: 'large_airport',
    status: 'active',
    primary: true,
  },
  {
    iata_code: 'LGA',
    icao_code: 'KLGA',
    name: 'LaGuardia Airport',
    city_name: 'New York',
    city_code: 'NYC',
    country_code: 'US',
    country_name: 'United States',
    timezone: 'America/New_York',
    latitude: 40.7772,
    longitude: -73.8726,
    elevation_ft: 21,
    type: 'large_airport',
    status: 'active',
  },
  {
    iata_code: 'EWR',
    icao_code: 'KEWR',
    name: 'Newark Liberty International Airport',
    city_name: 'Newark',
    city_code: 'NYC',
    country_code: 'US',
    country_name: 'United States',
    timezone: 'America/New_York',
    latitude: 40.6925,
    longitude: -74.1687,
    elevation_ft: 18,
    type: 'large_airport',
    status: 'active',
  },
  {
    iata_code: 'LHR',
    icao_code: 'EGLL',
    name: 'London Heathrow Airport',
    city_name: 'London',
    city_code: 'LON',
    country_code: 'GB',
    country_name: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 51.4706,
    longitude: -0.4619,
    elevation_ft: 83,
    type: 'large_airport',
    status: 'active',
    primary: true,
  },
  {
    iata_code: 'LGW',
    icao_code: 'EGKK',
    name: 'London Gatwick Airport',
    city_name: 'London',
    city_code: 'LON',
    country_code: 'GB',
    country_name: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 51.1537,
    longitude: -0.1821,
    elevation_ft: 202,
    type: 'large_airport',
    status: 'active',
  },
  {
    iata_code: 'STN',
    icao_code: 'EGSS',
    name: 'London Stansted Airport',
    city_name: 'London',
    city_code: 'LON',
    country_code: 'GB',
    country_name: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 51.885,
    longitude: 0.235,
    elevation_ft: 348,
    type: 'large_airport',
    status: 'active',
  },
  {
    iata_code: 'LTN',
    icao_code: 'EGGW',
    name: 'London Luton Airport',
    city_name: 'London',
    city_code: 'LON',
    country_code: 'GB',
    country_name: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 51.8747,
    longitude: -0.3684,
    elevation_ft: 526,
    type: 'medium_airport',
    status: 'active',
  },
  {
    iata_code: 'SEN',
    icao_code: 'EGMC',
    name: 'Southend Airport',
    city_name: 'Southend-on-Sea',
    city_code: 'LON',
    country_code: 'GB',
    country_name: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 51.5714,
    longitude: 0.6956,
    elevation_ft: 49,
    type: 'small_airport',
    status: 'active',
  },
  {
    iata_code: 'LCY',
    icao_code: 'EGLC',
    name: 'London City Airport',
    city_name: 'London',
    city_code: 'LON',
    country_code: 'GB',
    country_name: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 51.5048,
    longitude: 0.0495,
    elevation_ft: 19,
    type: 'medium_airport',
    status: 'active',
  },
  {
    iata_code: null,
    icao_code: 'EGVN',
    name: 'RAF Brize Norton',
    city_name: 'Brize Norton',
    city_code: null,
    country_code: 'GB',
    country_name: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 51.75,
    longitude: -1.5836,
    elevation_ft: 288,
    type: 'medium_airport',
    status: 'active',
  },
];

const TEST_METRO_AREAS: MetroArea[] = [
  { city_code: 'LON', city_name: 'London', country_code: 'GB', airports: ['LHR', 'LGW', 'STN', 'LTN', 'SEN', 'LCY'] },
  { city_code: 'NYC', city_name: 'New York', country_code: 'US', airports: ['JFK', 'LGA', 'EWR'] },
];

const TEST_DECOMMISSIONED: DecommissionedAirport[] = [
  {
    iata_code: 'TXL',
    icao_code: 'EDDT',
    name: 'Berlin Tegel Airport',
    city_name: 'Berlin',
    country_code: 'DE',
    decommission_date: '2020-11-08',
    reason: 'Replaced by Berlin Brandenburg (BER)',
    replaced_by: 'BER',
  },
  {
    iata_code: 'THF',
    icao_code: 'EDDI',
    name: 'Berlin Tempelhof Airport',
    city_name: 'Berlin',
    country_code: 'DE',
    decommission_date: '2008-10-30',
    reason: 'Closed permanently',
    replaced_by: null,
  },
];

// --- Test setup ---

let testDataDir: string;
let resolver: AirportCodeResolver;

beforeAll(async () => {
  // Write test data to a temp directory
  testDataDir = join(tmpdir(), `otaip-test-${Date.now()}`);
  await mkdir(testDataDir, { recursive: true });

  await writeFile(join(testDataDir, 'airports.json'), JSON.stringify(TEST_AIRPORTS));
  await writeFile(join(testDataDir, 'metro-areas.json'), JSON.stringify(TEST_METRO_AREAS));
  await writeFile(join(testDataDir, 'decommissioned.json'), JSON.stringify(TEST_DECOMMISSIONED));

  resolver = new AirportCodeResolver({ dataDir: testDataDir });
  await resolver.initialize();
});

afterAll(async () => {
  resolver.destroy();
  await rm(testDataDir, { recursive: true, force: true });
});

// --- Tests per spec ---

describe('Airport Code Resolver', () => {
  describe('Spec test: Exact IATA code lookup', () => {
    it('resolves JFK to John F Kennedy International Airport', async () => {
      const result = await resolver.execute({
        data: { code: 'JFK', code_type: 'iata' },
      });

      expect(result.data.resolved_airport).not.toBeNull();
      expect(result.data.resolved_airport!.iata_code).toBe('JFK');
      expect(result.data.resolved_airport!.icao_code).toBe('KJFK');
      expect(result.data.resolved_airport!.city_code).toBe('NYC');
      expect(result.data.resolved_airport!.name).toContain('John F Kennedy');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('resolves LHR to London Heathrow Airport', async () => {
      const result = await resolver.execute({
        data: { code: 'LHR', code_type: 'iata' },
      });

      expect(result.data.resolved_airport!.iata_code).toBe('LHR');
      expect(result.data.resolved_airport!.icao_code).toBe('EGLL');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('is case-insensitive', async () => {
      const result = await resolver.execute({
        data: { code: 'jfk' },
      });

      expect(result.data.resolved_airport!.iata_code).toBe('JFK');
      expect(result.data.match_confidence).toBe(1.0);
    });
  });

  describe('Spec test: Metro/city code expansion', () => {
    it('expands LON to 6 London airports', async () => {
      const result = await resolver.execute({
        data: { code: 'LON', include_metro: true },
      });

      expect(result.data.metro_airports).not.toBeNull();
      expect(result.data.metro_airports!.length).toBe(6);

      const iataCodes = result.data.metro_airports!.map((a) => a.iata_code);
      expect(iataCodes).toContain('LHR');
      expect(iataCodes).toContain('LGW');
      expect(iataCodes).toContain('STN');
      expect(iataCodes).toContain('LTN');
      expect(iataCodes).toContain('SEN');
      expect(iataCodes).toContain('LCY');
    });

    it('sorts metro airports by type (large > medium > small)', async () => {
      const result = await resolver.execute({
        data: { code: 'LON', include_metro: true },
      });

      const types = result.data.metro_airports!.map((a) => a.type);
      const largeCount = types.filter((t) => t === 'large_airport').length;
      const mediumStart = types.indexOf('medium_airport');
      const smallStart = types.indexOf('small_airport');

      // All large airports should come before medium, medium before small
      expect(largeCount).toBeGreaterThan(0);
      if (mediumStart >= 0) expect(mediumStart).toBeGreaterThanOrEqual(largeCount);
      if (smallStart >= 0) expect(smallStart).toBeGreaterThan(mediumStart);
    });

    it('expands NYC to 3 airports', async () => {
      const result = await resolver.execute({
        data: { code: 'NYC', include_metro: true },
      });

      expect(result.data.metro_airports!.length).toBe(3);
      const iataCodes = result.data.metro_airports!.map((a) => a.iata_code);
      expect(iataCodes).toContain('JFK');
      expect(iataCodes).toContain('LGA');
      expect(iataCodes).toContain('EWR');
    });
  });

  describe('Spec test: ICAO code lookup', () => {
    it('resolves EGLL to LHR (London Heathrow)', async () => {
      const result = await resolver.execute({
        data: { code: 'EGLL', code_type: 'icao' },
      });

      expect(result.data.resolved_airport).not.toBeNull();
      expect(result.data.resolved_airport!.iata_code).toBe('LHR');
      expect(result.data.resolved_airport!.icao_code).toBe('EGLL');
      expect(result.data.match_confidence).toBe(1.0);
    });

    it('resolves ICAO-only airports (no IATA code)', async () => {
      const result = await resolver.execute({
        data: { code: 'EGVN', code_type: 'icao' },
      });

      expect(result.data.resolved_airport).not.toBeNull();
      expect(result.data.resolved_airport!.iata_code).toBeNull();
      expect(result.data.resolved_airport!.icao_code).toBe('EGVN');
      expect(result.data.resolved_airport!.name).toContain('Brize Norton');
    });
  });

  describe('Spec test: Fuzzy name match', () => {
    it('resolves "heathrow" to LHR with high confidence', async () => {
      const result = await resolver.execute({
        data: { code: 'heathrow', code_type: 'name' },
      });

      expect(result.data.resolved_airport).not.toBeNull();
      expect(result.data.resolved_airport!.iata_code).toBe('LHR');
      expect(result.data.match_confidence).toBeGreaterThanOrEqual(0.5);
      expect(result.data.match_confidence).toBeLessThan(1.0);
    });

    it('resolves "gatwick" to LGW', async () => {
      const result = await resolver.execute({
        data: { code: 'gatwick', code_type: 'name' },
      });

      expect(result.data.resolved_airport).not.toBeNull();
      expect(result.data.resolved_airport!.iata_code).toBe('LGW');
    });
  });

  describe('Spec test: Decommissioned code handling', () => {
    it('resolves TXL with include_decommissioned=true', async () => {
      const result = await resolver.execute({
        data: { code: 'TXL', include_decommissioned: true },
      });

      expect(result.data.resolved_airport).not.toBeNull();
      expect(result.data.resolved_airport!.iata_code).toBe('TXL');
      expect(result.data.resolved_airport!.status).toBe('decommissioned');
      expect(result.data.resolved_airport!.name).toContain('Tegel');
    });

    it('returns suggestion for TXL with include_decommissioned=false', async () => {
      const result = await resolver.execute({
        data: { code: 'TXL', include_decommissioned: false },
      });

      expect(result.data.resolved_airport).toBeNull();
      expect(result.data.match_confidence).toBe(0);
      expect(result.data.suggestion).toContain('decommissioned');
    });
  });

  describe('Spec test: Unknown code', () => {
    it('returns null with confidence 0 for ZZZ', async () => {
      const result = await resolver.execute({
        data: { code: 'ZZZ' },
      });

      expect(result.data.resolved_airport).toBeNull();
      expect(result.data.match_confidence).toBe(0);
    });
  });

  describe('Input validation', () => {
    it('rejects empty code', async () => {
      await expect(
        resolver.execute({ data: { code: '' } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects code longer than 50 characters', async () => {
      await expect(
        resolver.execute({ data: { code: 'a'.repeat(51) } }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid code_type', async () => {
      await expect(
        resolver.execute({
          data: { code: 'LHR', code_type: 'invalid' as 'iata' },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('Agent interface compliance', () => {
    it('has correct agent metadata', () => {
      expect(resolver.id).toBe('0.1');
      expect(resolver.name).toBe('Airport/City Code Resolver');
      expect(resolver.version).toBe('0.1.0');
    });

    it('reports healthy status', async () => {
      const health = await resolver.health();
      expect(health.status).toBe('healthy');
    });

    it('returns metadata in output', async () => {
      const result = await resolver.execute({
        data: { code: 'JFK' },
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata!['agent_id']).toBe('0.1');
      expect(result.metadata!['agent_version']).toBe('0.1.0');
    });

    it('throws when not initialized', async () => {
      const uninitResolver = new AirportCodeResolver({ dataDir: testDataDir });
      await expect(
        uninitResolver.execute({ data: { code: 'JFK' } }),
      ).rejects.toThrow('not been initialized');
    });
  });

  describe('Edge cases', () => {
    it('handles whitespace in input', async () => {
      const result = await resolver.execute({
        data: { code: '  LHR  ' },
      });

      expect(result.data.resolved_airport!.iata_code).toBe('LHR');
    });

    it('terminals field is null (not populated in static data)', async () => {
      const result = await resolver.execute({
        data: { code: 'JFK' },
      });

      expect(result.data.resolved_airport!.terminals).toBeNull();
    });
  });
});

