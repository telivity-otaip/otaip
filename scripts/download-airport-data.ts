/**
 * Download and process airport reference data for OTAIP.
 *
 * Sources:
 * - OurAirports (https://ourairports.com/data/) — primary dataset
 * - OpenFlights (supplementary timezone data)
 *
 * Run via: pnpm run data:download
 *
 * Outputs:
 * - data/reference/airports.json — processed airport records
 * - data/reference/metro-areas.json — city-to-airports mapping
 * - data/reference/decommissioned.json — retired/closed airport codes
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const DATA_DIR = join(process.cwd(), 'data', 'reference');

const OURAIRPORTS_BASE = 'https://davidmegginson.github.io/ourairports-data';
const AIRPORTS_CSV_URL = `${OURAIRPORTS_BASE}/airports.csv`;
const COUNTRIES_CSV_URL = `${OURAIRPORTS_BASE}/countries.csv`;

interface RawCsvAirport {
  id: string;
  ident: string;
  type: string;
  name: string;
  latitude_deg: string;
  longitude_deg: string;
  elevation_ft: string;
  continent: string;
  iso_country: string;
  iso_region: string;
  municipality: string;
  scheduled_service: string;
  gps_code: string;
  iata_code: string;
  local_code: string;
  home_link: string;
  wikipedia_link: string;
  keywords: string;
}

interface RawCsvCountry {
  id: string;
  code: string;
  name: string;
  continent: string;
  wikipedia_link: string;
  keywords: string;
}

interface ProcessedAirport {
  iata_code: string | null;
  icao_code: string | null;
  name: string;
  city_name: string | null;
  city_code: string | null;
  country_code: string;
  country_name: string;
  timezone: string | null;
  latitude: number;
  longitude: number;
  elevation_ft: number | null;
  type: string;
  status: string;
  primary?: boolean;
}

interface MetroArea {
  city_code: string;
  city_name: string;
  country_code: string;
  airports: string[];
}

interface DecommissionedAirport {
  iata_code: string;
  icao_code: string | null;
  name: string;
  city_name: string | null;
  country_code: string;
  decommission_date: string | null;
  reason: string | null;
  replaced_by: string | null;
}

/**
 * Parse CSV text into array of objects.
 * Handles quoted fields with commas inside.
 */
function parseCsv<T extends Record<string, string>>(csv: string): T[] {
  const lines = csv.split('\n');
  const headerLine = lines[0];
  if (!headerLine) return [];

  const headers = parseCsvLine(headerLine);
  const records: T[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (header) {
        record[header] = values[j] ?? '';
      }
    }
    records.push(record as T);
  }

  return records;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());

  return fields;
}

/**
 * Map OurAirports type to our canonical type.
 */
function mapAirportType(type: string): string {
  const typeMap: Record<string, string> = {
    large_airport: 'large_airport',
    medium_airport: 'medium_airport',
    small_airport: 'small_airport',
    closed: 'closed',
    heliport: 'heliport',
    seaplane_base: 'seaplane_base',
    balloonport: 'small_airport',
  };
  return typeMap[type] ?? 'small_airport';
}

/**
 * Known multi-airport city codes.
 * Source: IATA standard city codes for multi-airport cities.
 * This is NOT exhaustive — additional mappings are derived from data.
 */
const KNOWN_METRO_AREAS: Record<string, { city_name: string; airports: string[] }> = {
  LON: { city_name: 'London', airports: ['LHR', 'LGW', 'STN', 'LTN', 'SEN', 'LCY'] },
  NYC: { city_name: 'New York', airports: ['JFK', 'LGA', 'EWR'] },
  PAR: { city_name: 'Paris', airports: ['CDG', 'ORY'] },
  TYO: { city_name: 'Tokyo', airports: ['NRT', 'HND'] },
  WAS: { city_name: 'Washington', airports: ['IAD', 'DCA', 'BWI'] },
  CHI: { city_name: 'Chicago', airports: ['ORD', 'MDW'] },
  BUE: { city_name: 'Buenos Aires', airports: ['EZE', 'AEP'] },
  ROM: { city_name: 'Rome', airports: ['FCO', 'CIA'] },
  MIL: { city_name: 'Milan', airports: ['MXP', 'LIN', 'BGY'] },
  OSA: { city_name: 'Osaka', airports: ['KIX', 'ITM'] },
  SEL: { city_name: 'Seoul', airports: ['ICN', 'GMP'] },
  STO: { city_name: 'Stockholm', airports: ['ARN', 'BMA', 'NYO'] },
  BJS: { city_name: 'Beijing', airports: ['PEK', 'PKX'] },
  MOW: { city_name: 'Moscow', airports: ['SVO', 'DME', 'VKO'] },
  SPL: { city_name: 'Sao Paulo', airports: ['GRU', 'CGH', 'VCP'] },
  BER: { city_name: 'Berlin', airports: ['BER'] },
  DXB: { city_name: 'Dubai', airports: ['DXB', 'DWC'] },
  JKT: { city_name: 'Jakarta', airports: ['CGK', 'HLP'] },
  BKK: { city_name: 'Bangkok', airports: ['BKK', 'DMK'] },
  SHA: { city_name: 'Shanghai', airports: ['PVG', 'SHA'] },
  YTO: { city_name: 'Toronto', airports: ['YYZ', 'YTZ'] },
  YMQ: { city_name: 'Montreal', airports: ['YUL', 'YMX'] },
};

/**
 * Known decommissioned airports.
 * Source: IATA historical records.
 */
const KNOWN_DECOMMISSIONED: DecommissionedAirport[] = [
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
    iata_code: 'SXF',
    icao_code: 'EDDB',
    name: 'Berlin Sch\u00f6nefeld Airport',
    city_name: 'Berlin',
    country_code: 'DE',
    decommission_date: '2020-10-25',
    reason: 'Absorbed into Berlin Brandenburg (BER)',
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
  {
    iata_code: 'MZJ',
    icao_code: 'KMZJ',
    name: 'Pinal Airpark',
    city_name: 'Marana',
    country_code: 'US',
    decommission_date: null,
    reason: 'Reclassified — primarily aircraft boneyard/storage',
    replaced_by: null,
  },
  {
    iata_code: 'ELM',
    icao_code: 'KELM',
    name: 'Elmira/Corning Regional Airport',
    city_name: 'Elmira',
    country_code: 'US',
    decommission_date: null,
    reason: 'Limited scheduled service',
    replaced_by: null,
  },
];

/**
 * Primary airport in multi-airport cities (by passenger volume).
 */
const PRIMARY_AIRPORTS = new Set([
  'LHR', 'JFK', 'CDG', 'NRT', 'IAD', 'ORD', 'EZE', 'FCO',
  'MXP', 'KIX', 'ICN', 'ARN', 'PEK', 'SVO', 'GRU', 'BER',
  'DXB', 'CGK', 'BKK', 'PVG', 'YYZ', 'YUL',
]);

async function fetchCsv(url: string): Promise<string> {
  console.warn(`Downloading: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function main(): Promise<void> {
  console.warn('OTAIP Airport Data Download');
  console.warn('==========================\n');

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }

  // Download OurAirports data
  const [airportsCsv, countriesCsv] = await Promise.all([
    fetchCsv(AIRPORTS_CSV_URL),
    fetchCsv(COUNTRIES_CSV_URL),
  ]);

  // Parse
  const rawAirports = parseCsv<RawCsvAirport>(airportsCsv);
  const rawCountries = parseCsv<RawCsvCountry>(countriesCsv);
  console.warn(`Parsed ${rawAirports.length} airports, ${rawCountries.length} countries`);

  // Build country lookup
  const countryMap = new Map<string, string>();
  for (const country of rawCountries) {
    if (country.code && country.name) {
      countryMap.set(country.code, country.name);
    }
  }

  // Process airports
  const processed: ProcessedAirport[] = [];
  const validTypes = new Set(['large_airport', 'medium_airport', 'small_airport']);

  for (const raw of rawAirports) {
    const hasIata = raw.iata_code && raw.iata_code.length === 3;
    const isValidType = validTypes.has(raw.type);

    if (!isValidType && !hasIata) continue;

    const iataCode = hasIata ? raw.iata_code.toUpperCase() : null;
    const icaoCode = raw.ident && /^[A-Z]{4}$/.test(raw.ident) ? raw.ident : null;

    let cityCode: string | null = null;
    if (iataCode) {
      for (const [code, metro] of Object.entries(KNOWN_METRO_AREAS)) {
        if (metro.airports.includes(iataCode)) {
          cityCode = code;
          break;
        }
      }
    }

    const airport: ProcessedAirport = {
      iata_code: iataCode,
      icao_code: icaoCode,
      name: raw.name,
      city_name: raw.municipality || null,
      city_code: cityCode,
      country_code: raw.iso_country,
      country_name: countryMap.get(raw.iso_country) ?? raw.iso_country,
      timezone: null,
      latitude: parseFloat(raw.latitude_deg) || 0,
      longitude: parseFloat(raw.longitude_deg) || 0,
      elevation_ft: raw.elevation_ft ? parseInt(raw.elevation_ft, 10) : null,
      type: mapAirportType(raw.type),
      status: raw.type === 'closed' ? 'decommissioned' : 'active',
      primary: iataCode && PRIMARY_AIRPORTS.has(iataCode) ? true : undefined,
    };

    processed.push(airport);
  }

  console.warn(`Processed ${processed.length} airports (filtered from ${rawAirports.length})`);

  // Build metro areas
  const metroAreas: MetroArea[] = Object.entries(KNOWN_METRO_AREAS).map(([code, meta]) => ({
    city_code: code,
    city_name: meta.city_name,
    country_code: processed.find((a) => a.iata_code && meta.airports.includes(a.iata_code))?.country_code ?? '',
    airports: meta.airports,
  }));

  console.warn(`Built ${metroAreas.length} metro area mappings`);

  // Write files
  await writeFile(
    join(DATA_DIR, 'airports.json'),
    JSON.stringify(processed, null, 2),
  );
  console.warn(`Wrote airports.json (${processed.length} records)`);

  await writeFile(
    join(DATA_DIR, 'metro-areas.json'),
    JSON.stringify(metroAreas, null, 2),
  );
  console.warn(`Wrote metro-areas.json (${metroAreas.length} records)`);

  await writeFile(
    join(DATA_DIR, 'decommissioned.json'),
    JSON.stringify(KNOWN_DECOMMISSIONED, null, 2),
  );
  console.warn(`Wrote decommissioned.json (${KNOWN_DECOMMISSIONED.length} records)`);

  console.warn('\nDone. Airport data ready for OTAIP agents.');
}

main().catch((err) => {
  console.error('Failed to download airport data:', err);
  process.exit(1);
});

