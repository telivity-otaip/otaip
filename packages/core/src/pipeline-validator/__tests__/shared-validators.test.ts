import { describe, expect, it } from 'vitest';
import {
  resolveAirportStrict,
  validateFutureDate,
  validateIataCode,
} from '../shared-validators.js';
import type { ReferenceDataProvider } from '../types.js';

describe('validateFutureDate', () => {
  const now = new Date('2026-04-16T12:00:00Z');

  it('returns no issues for a future date', () => {
    expect(validateFutureDate('2026-12-31', now)).toEqual([]);
  });

  it('rejects a past date', () => {
    const issues = validateFutureDate('2025-01-01', now);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('DATE_IN_PAST');
  });

  it('rejects an invalid date string', () => {
    const issues = validateFutureDate('not-a-date', now);
    expect(issues[0]?.code).toBe('DATE_INVALID');
  });

  it('accepts today (date-only) as future', () => {
    expect(validateFutureDate('2026-04-16', now)).toEqual([]);
  });
});

describe('validateIataCode', () => {
  it('accepts 3-letter uppercase codes', () => {
    expect(validateIataCode('JFK')).toEqual([]);
    expect(validateIataCode('LHR')).toEqual([]);
  });

  it('rejects lowercase, wrong length, or non-alphanumeric', () => {
    expect(validateIataCode('jfk')[0]?.code).toBe('IATA_CODE_INVALID_FORMAT');
    expect(validateIataCode('JF')[0]?.code).toBe('IATA_CODE_INVALID_FORMAT');
    expect(validateIataCode('JFKK')[0]?.code).toBe('IATA_CODE_INVALID_FORMAT');
    expect(validateIataCode('JF!')[0]?.code).toBe('IATA_CODE_INVALID_FORMAT');
  });
});

describe('resolveAirportStrict', () => {
  const mkRef = (map: Record<string, { name: string; confidence: number }>) =>
    ({
      async resolveAirport(code) {
        const v = map[code];
        return v
          ? { iataCode: code, name: v.name, matchConfidence: v.confidence }
          : null;
      },
      async resolveAirline() {
        return null;
      },
      async decodeFareBasis() {
        return null;
      },
    }) satisfies ReferenceDataProvider;

  it('returns no issues for a confident match', async () => {
    const ref = mkRef({ JFK: { name: 'John F Kennedy', confidence: 1.0 } });
    expect(await resolveAirportStrict('JFK', ref)).toEqual([]);
  });

  it('rejects unknown codes', async () => {
    const ref = mkRef({});
    const issues = await resolveAirportStrict('XYZ', ref);
    expect(issues[0]?.code).toBe('AIRPORT_NOT_FOUND');
  });

  it('rejects ambiguous matches with a suggestion', async () => {
    const ref = mkRef({ NYC: { name: 'New York City (metro)', confidence: 0.33 } });
    const issues = await resolveAirportStrict('NYC', ref);
    expect(issues[0]?.code).toBe('AIRPORT_AMBIGUOUS');
    expect(issues[0]?.suggestion).toContain('NYC');
  });

  it('rejects format errors before hitting the reference data', async () => {
    const ref = mkRef({});
    const issues = await resolveAirportStrict('jfk', ref);
    expect(issues[0]?.code).toBe('IATA_CODE_INVALID_FORMAT');
  });
});
