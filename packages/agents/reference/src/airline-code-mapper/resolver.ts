/**
 * Core resolution logic for Airline Code & Alliance Mapper.
 *
 * Classifies input, looks up against in-memory indexes, and returns canonical records.
 * All domain rules from the spec (agents/specs/0-2-airline-code-alliance-mapper.yaml).
 */

import type {
  AirlineCodeMapperInput,
  AirlineCodeMapperOutput,
  AirlineRecord,
  CodeshareMapping,
  CodesharePartner,
  ResolvedAirline,
  AirlineCodeType,
} from './types.js';
import { fuzzyAirlineSearch } from './data.js';

/** Indexes built from the static dataset for O(1) lookups */
export interface AirlineIndexes {
  byIata: Map<string, AirlineRecord>;
  byIcao: Map<string, AirlineRecord>;
  codesharesByIata: Map<string, CodeshareMapping>;
  allAirlines: readonly AirlineRecord[];
}

/**
 * Build lookup indexes from the static dataset.
 */
export function buildIndexes(
  airlines: readonly AirlineRecord[],
  codeshares: readonly CodeshareMapping[],
): AirlineIndexes {
  const byIata = new Map<string, AirlineRecord>();
  const byIcao = new Map<string, AirlineRecord>();

  for (const airline of airlines) {
    if (airline.iata_code) {
      byIata.set(airline.iata_code.toUpperCase(), airline);
    }
    if (airline.icao_code) {
      byIcao.set(airline.icao_code.toUpperCase(), airline);
    }
  }

  const codesharesByIata = new Map<string, CodeshareMapping>();
  for (const cs of codeshares) {
    codesharesByIata.set(cs.airline_iata.toUpperCase(), cs);
  }

  return { byIata, byIcao, codesharesByIata, allAirlines: airlines };
}

const IATA_AIRLINE_PATTERN = /^[A-Z0-9]{2}$/;
const ICAO_AIRLINE_PATTERN = /^[A-Z]{3}$/;

/**
 * Classify what type of code the input is.
 * If code_type is provided, use it. Otherwise auto-detect.
 */
export function classifyInput(code: string, codeType?: AirlineCodeType): AirlineCodeType {
  if (codeType && codeType !== 'auto') {
    return codeType;
  }

  const upper = code.toUpperCase();

  // 2-char alphanumeric = IATA airline designator
  if (IATA_AIRLINE_PATTERN.test(upper)) {
    return 'iata';
  }
  // 3-char alpha = ICAO airline designator
  if (ICAO_AIRLINE_PATTERN.test(upper)) {
    return 'icao';
  }

  return 'name';
}

/**
 * Convert an AirlineRecord to a ResolvedAirline for output.
 */
function toResolvedAirline(record: AirlineRecord): ResolvedAirline {
  return {
    iata_code: record.iata_code,
    icao_code: record.icao_code,
    name: record.name,
    callsign: record.callsign,
    country_code: record.country_code,
    country_name: record.country_name,
    alliance: record.alliance,
    alliance_status: record.alliance_status,
    is_operating: record.is_operating,
    hub_airports: [...record.hub_airports],
    website: record.website,
    founded_year: record.founded_year,
    status: record.status,
    merged_into: record.merged_into,
    defunct_date: record.defunct_date,
  };
}

/**
 * Build codeshare partner output from a codeshare mapping.
 */
function buildCodesharePartners(
  mapping: CodeshareMapping,
  indexes: AirlineIndexes,
): CodesharePartner[] {
  return mapping.partners
    .map((entry) => {
      const partner = indexes.byIata.get(entry.iata_code.toUpperCase());
      if (!partner) return null;
      return {
        iata_code: entry.iata_code,
        name: partner.name,
        alliance: partner.alliance,
        relationship: entry.relationship,
      };
    })
    .filter((p): p is CodesharePartner => p !== null);
}

/**
 * Check if an airline should be excluded based on defunct status and input flags.
 */
function isExcludedDefunct(airline: AirlineRecord, includeDefunct: boolean): boolean {
  if (airline.status === 'defunct' || airline.status === 'merged') {
    return !includeDefunct;
  }
  return false;
}

/**
 * Resolve an airline code to canonical records.
 */
export function resolve(
  input: AirlineCodeMapperInput,
  indexes: AirlineIndexes,
): AirlineCodeMapperOutput {
  const code = input.code.trim();
  const includeCodeshares = input.include_codeshares ?? false;
  const includeDefunct = input.include_defunct ?? false;

  const detectedType = classifyInput(code, input.code_type);
  const upper = code.toUpperCase();

  // Step 1: Try IATA lookup
  if (detectedType === 'iata') {
    const iataMatch = indexes.byIata.get(upper);
    if (iataMatch) {
      if (isExcludedDefunct(iataMatch, includeDefunct)) {
        return {
          airline: null,
          codeshare_partners: null,
          match_confidence: 0,
        };
      }

      const codesharePartners = includeCodeshares
        ? buildCodesharePartnersForAirline(upper, indexes)
        : null;

      return {
        airline: toResolvedAirline(iataMatch),
        codeshare_partners: codesharePartners,
        match_confidence: 1.0,
      };
    }
  }

  // Step 2: Try ICAO lookup
  if (detectedType === 'icao') {
    const icaoMatch = indexes.byIcao.get(upper);
    if (icaoMatch) {
      if (isExcludedDefunct(icaoMatch, includeDefunct)) {
        return {
          airline: null,
          codeshare_partners: null,
          match_confidence: 0,
        };
      }

      const iataCode = icaoMatch.iata_code?.toUpperCase();
      const codesharePartners = includeCodeshares && iataCode
        ? buildCodesharePartnersForAirline(iataCode, indexes)
        : null;

      return {
        airline: toResolvedAirline(icaoMatch),
        codeshare_partners: codesharePartners,
        match_confidence: 1.0,
      };
    }
  }

  // Step 3: Fuzzy name search
  if (detectedType === 'name' || (detectedType === 'iata' && !indexes.byIata.has(upper)) || (detectedType === 'icao' && !indexes.byIcao.has(upper))) {
    const fuzzyResults = fuzzyAirlineSearch(code, 5);

    // Filter out defunct if not requested
    const filtered = fuzzyResults.filter(
      (r) => !isExcludedDefunct(r.airline, includeDefunct),
    );

    if (filtered.length > 0) {
      const best = filtered[0]!;
      if (best.confidence >= 0.5) {
        const iataCode = best.airline.iata_code?.toUpperCase();
        const codesharePartners = includeCodeshares && iataCode
          ? buildCodesharePartnersForAirline(iataCode, indexes)
          : null;

        return {
          airline: toResolvedAirline(best.airline),
          codeshare_partners: codesharePartners,
          match_confidence: best.confidence,
        };
      }
    }
  }

  // Step 4: Not found
  return {
    airline: null,
    codeshare_partners: null,
    match_confidence: 0,
  };
}

/**
 * Build codeshare partners list for a given airline IATA code.
 */
function buildCodesharePartnersForAirline(
  iataCode: string,
  indexes: AirlineIndexes,
): CodesharePartner[] | null {
  const mapping = indexes.codesharesByIata.get(iataCode);
  if (!mapping) {
    return null;
  }
  const partners = buildCodesharePartners(mapping, indexes);
  return partners.length > 0 ? partners : null;
}
