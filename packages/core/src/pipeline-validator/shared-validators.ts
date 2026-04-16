/**
 * Shared semantic validators.
 *
 * These helpers compose into each agent contract's `validate()` method.
 * Two flavors:
 *  - Pure functions (no external data): `validateFutureDate`, `validateIataCode`.
 *  - Reference-backed async helpers that call `ReferenceDataProvider`:
 *    `resolveAirportStrict`, `resolveAirlineStrict`, `resolveFareBasisStrict`.
 *
 * All return `SemanticIssue[]` so a contract's `validate()` can concatenate
 * the results of several calls before deciding pass/fail.
 */

import type { ReferenceDataProvider, SemanticIssue } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pure validators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check that an ISO date string represents a date that is not in the past
 * (relative to `now`). Accepts `YYYY-MM-DD` (date-only) and full ISO 8601
 * timestamps. Returns an empty array on success.
 */
export function validateFutureDate(
  date: string,
  now: Date,
  path: readonly PropertyKey[] = ['date'],
): SemanticIssue[] {
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) {
    return [
      {
        code: 'DATE_INVALID',
        path,
        message: `Value '${date}' is not a valid ISO 8601 date`,
        severity: 'error',
      },
    ];
  }
  const parsedDate = new Date(parsed);
  // For date-only strings, compare at UTC day granularity (Date.parse treats
  // 'YYYY-MM-DD' as UTC midnight). This avoids timezone flipping that would
  // otherwise mark "today" as past when the local clock is behind UTC.
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const nowCompare = isDateOnly
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    : now;
  if (parsedDate.getTime() < nowCompare.getTime()) {
    return [
      {
        code: 'DATE_IN_PAST',
        path,
        message: `Date '${date}' is in the past (now=${now.toISOString()})`,
        suggestion: 'Use a future date',
        severity: 'error',
      },
    ];
  }
  return [];
}

/**
 * Check that a string is structurally a 3-letter IATA airport/airline code.
 * Does NOT check existence — use `resolveAirportStrict`/`resolveAirlineStrict`
 * for that.
 */
export function validateIataCode(
  code: string,
  path: readonly PropertyKey[] = ['code'],
): SemanticIssue[] {
  if (typeof code !== 'string' || !/^[A-Z0-9]{3}$/.test(code)) {
    return [
      {
        code: 'IATA_CODE_INVALID_FORMAT',
        path,
        message: `'${code}' is not a valid 3-character IATA code (uppercase alphanumeric)`,
        suggestion: 'IATA codes are 3 uppercase letters/digits, e.g. JFK, LHR',
        severity: 'error',
      },
    ];
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference-backed validators
// ─────────────────────────────────────────────────────────────────────────────

export interface ReferenceStrictOptions {
  /** Minimum match confidence to accept. Defaults to 0.9. */
  readonly minConfidence?: number;
}

/**
 * Resolve an airport code and require a strict match.
 *
 * @returns empty array on success; issues on failure or low confidence.
 */
export async function resolveAirportStrict(
  code: string,
  reference: ReferenceDataProvider,
  path: readonly PropertyKey[] = ['airport'],
  options: ReferenceStrictOptions = {},
): Promise<SemanticIssue[]> {
  const minConfidence = options.minConfidence ?? 0.9;
  // Format check first.
  const formatIssues = validateIataCode(code, path);
  if (formatIssues.length > 0) return formatIssues;

  const resolved = await reference.resolveAirport(code);
  if (resolved === null) {
    return [
      {
        code: 'AIRPORT_NOT_FOUND',
        path,
        message: `Airport code '${code}' was not found in the reference dataset`,
        suggestion: 'Verify the IATA/ICAO code; common airports use IATA (e.g. JFK, LHR)',
        severity: 'error',
      },
    ];
  }
  if (resolved.matchConfidence < minConfidence) {
    return [
      {
        code: 'AIRPORT_AMBIGUOUS',
        path,
        message: `Airport code '${code}' resolved with low confidence ${resolved.matchConfidence.toFixed(2)} (threshold ${minConfidence})`,
        suggestion: `Did you mean ${resolved.iataCode} (${resolved.name})?`,
        severity: 'error',
      },
    ];
  }
  return [];
}

/**
 * Resolve an airline code and require a strict match.
 */
export async function resolveAirlineStrict(
  code: string,
  reference: ReferenceDataProvider,
  path: readonly PropertyKey[] = ['carrier'],
  options: ReferenceStrictOptions = {},
): Promise<SemanticIssue[]> {
  const minConfidence = options.minConfidence ?? 0.9;
  // Airlines can be 2 or 3 chars (IATA vs ICAO); format check is loose here.
  if (typeof code !== 'string' || !/^[A-Z0-9]{2,3}$/.test(code)) {
    return [
      {
        code: 'AIRLINE_CODE_INVALID_FORMAT',
        path,
        message: `'${code}' is not a valid 2- or 3-character airline code`,
        severity: 'error',
      },
    ];
  }
  const resolved = await reference.resolveAirline(code);
  if (resolved === null) {
    return [
      {
        code: 'AIRLINE_NOT_FOUND',
        path,
        message: `Airline code '${code}' was not found in the reference dataset`,
        severity: 'error',
      },
    ];
  }
  if (resolved.matchConfidence < minConfidence) {
    return [
      {
        code: 'AIRLINE_AMBIGUOUS',
        path,
        message: `Airline code '${code}' resolved with low confidence ${resolved.matchConfidence.toFixed(2)}`,
        suggestion: `Did you mean ${resolved.iataCode} (${resolved.name})?`,
        severity: 'error',
      },
    ];
  }
  return [];
}

/**
 * Resolve (decode) a fare basis string and require a strict match.
 */
export async function resolveFareBasisStrict(
  code: string,
  reference: ReferenceDataProvider,
  carrier?: string,
  path: readonly PropertyKey[] = ['fareBasis'],
  options: ReferenceStrictOptions = {},
): Promise<SemanticIssue[]> {
  const minConfidence = options.minConfidence ?? 0.7;
  if (typeof code !== 'string' || code.length === 0) {
    return [
      {
        code: 'FARE_BASIS_INVALID_FORMAT',
        path,
        message: `Fare basis must be a non-empty string`,
        severity: 'error',
      },
    ];
  }
  const resolved = await reference.decodeFareBasis(code, carrier);
  if (resolved === null) {
    return [
      {
        code: 'FARE_BASIS_NOT_DECODABLE',
        path,
        message: `Fare basis '${code}' could not be decoded${carrier ? ` for carrier '${carrier}'` : ''}`,
        severity: 'error',
      },
    ];
  }
  if (resolved.matchConfidence < minConfidence) {
    return [
      {
        code: 'FARE_BASIS_LOW_CONFIDENCE',
        path,
        message: `Fare basis '${code}' decoded with low confidence ${resolved.matchConfidence.toFixed(2)}`,
        severity: 'warning',
      },
    ];
  }
  return [];
}
