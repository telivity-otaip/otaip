/**
 * Airline Code & Alliance Mapper — Input/Output types
 *
 * Agent 0.2: Resolves IATA/ICAO airline designator codes to canonical records,
 * maps alliance memberships and codeshare partner networks.
 * All types derived from the approved spec (agents/specs/0-2-airline-code-alliance-mapper.yaml).
 */

/** The type of code being resolved */
export type AirlineCodeType = 'iata' | 'icao' | 'name' | 'auto';

/** Airline operational status */
export type AirlineStatus = 'active' | 'defunct' | 'suspended' | 'merged';

/** Alliance name identifiers */
export type AllianceName = 'star_alliance' | 'oneworld' | 'skyteam';

/** Alliance membership level */
export type AllianceStatus = 'full_member' | 'affiliate' | 'connect_partner';

/** Codeshare relationship type */
export type CodeshareRelationship = 'codeshare' | 'joint_venture' | 'franchise' | 'wet_lease';

export interface AirlineCodeMapperInput {
  /** IATA 2-letter (e.g., "UA"), ICAO 3-letter (e.g., "UAL"), or airline name */
  code: string;
  /** Hint for resolution. Auto-detected if omitted. */
  code_type?: AirlineCodeType;
  /** If true, include known codeshare partners in output. Default: false */
  include_codeshares?: boolean;
  /** If true, include airlines that have ceased operations. Default: false */
  include_defunct?: boolean;
}

export interface ResolvedAirline {
  /** IATA 2-letter designator code */
  iata_code: string | null;
  /** ICAO 3-letter designator code */
  icao_code: string | null;
  /** Full airline name */
  name: string;
  /** Radio telephony callsign */
  callsign: string | null;
  /** ISO 3166-1 alpha-2 country code of registration */
  country_code: string;
  /** Full country name */
  country_name: string;
  /** Alliance membership, if any */
  alliance: AllianceName | null;
  /** Membership level within alliance */
  alliance_status: AllianceStatus | null;
  /** False if marketing carrier only / virtual airline */
  is_operating: boolean;
  /** IATA codes of primary hub airports */
  hub_airports: string[];
  /** Airline website URL */
  website: string | null;
  /** Year airline was founded */
  founded_year: number | null;
  /** Current operational status */
  status: AirlineStatus;
  /** IATA code of successor airline if merged */
  merged_into: string | null;
  /** ISO date when airline ceased operations, if applicable */
  defunct_date: string | null;
}

export interface CodesharePartner {
  /** IATA 2-letter code of partner airline */
  iata_code: string;
  /** Partner airline name */
  name: string;
  /** Partner's alliance membership */
  alliance: AllianceName | null;
  /** Type of partnership relationship */
  relationship: CodeshareRelationship;
}

export interface AirlineCodeMapperOutput {
  /** Canonical airline record, null if not found */
  airline: ResolvedAirline | null;
  /** Known codeshare partners (when include_codeshares=true) */
  codeshare_partners: CodesharePartner[] | null;
  /** 1.0 = exact code match, 0.5-0.9 = fuzzy name, 0 = not found */
  match_confidence: number;
}

/**
 * Internal airline record stored in static data.
 */
export interface AirlineRecord {
  iata_code: string | null;
  icao_code: string | null;
  name: string;
  callsign: string | null;
  country_code: string;
  country_name: string;
  alliance: AllianceName | null;
  alliance_status: AllianceStatus | null;
  is_operating: boolean;
  hub_airports: string[];
  website: string | null;
  founded_year: number | null;
  status: AirlineStatus;
  merged_into: string | null;
  defunct_date: string | null;
}

/**
 * Internal codeshare mapping: airline IATA code -> partner entries
 */
export interface CodeshareMapping {
  airline_iata: string;
  partners: CodesharePartnerEntry[];
}

/**
 * Internal codeshare partner entry
 */
export interface CodesharePartnerEntry {
  iata_code: string;
  relationship: CodeshareRelationship;
}
