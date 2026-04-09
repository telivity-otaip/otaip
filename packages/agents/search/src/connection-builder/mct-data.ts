/**
 * Minimum Connection Time (MCT) data.
 *
 * 4-level hierarchy:
 * 1. Carrier-specific at airport
 * 2. Airport + connection type + terminal change
 * 3. Airport + connection type
 * 4. IATA global defaults
 *
 * TODO: [FUTURE] Load from data/reference/mct/ JSON files.
 * TODO: [NEEDS DOMAIN INPUT] Carrier-specific MCT overrides.
 */

import type { ConnectionType, TerminalChangeType } from './types.js';

// ---------------------------------------------------------------------------
// IATA global defaults
// ---------------------------------------------------------------------------

const IATA_DEFAULTS: Record<ConnectionType, number> = {
  domestic: 60,
  international: 90,
  mixed: 90,
};

// ---------------------------------------------------------------------------
// Airport-specific MCT rules (top 20 hubs)
// ---------------------------------------------------------------------------

interface AirportMctConfig {
  default_domestic: number;
  default_international: number;
  terminal_change_domestic?: number;
  terminal_change_international?: number;
  carrier_rules?: {
    arriving?: string;
    departing?: string;
    connection_type: ConnectionType;
    minutes: number;
  }[];
}

const AIRPORT_MCT: Record<string, AirportMctConfig> = {
  JFK: {
    default_domestic: 75,
    default_international: 120,
    terminal_change_domestic: 120,
    terminal_change_international: 150,
  },
  LAX: {
    default_domestic: 75,
    default_international: 120,
    terminal_change_domestic: 120,
    terminal_change_international: 150,
  },
  ORD: {
    default_domestic: 60,
    default_international: 90,
    terminal_change_domestic: 90,
    terminal_change_international: 120,
    carrier_rules: [{ arriving: 'UA', departing: 'UA', connection_type: 'domestic', minutes: 50 }],
  },
  ATL: {
    default_domestic: 45,
    default_international: 90,
  },
  DFW: {
    default_domestic: 60,
    default_international: 90,
  },
  DEN: {
    default_domestic: 55,
    default_international: 90,
  },
  SFO: {
    default_domestic: 60,
    default_international: 90,
    terminal_change_domestic: 90,
    terminal_change_international: 120,
  },
  LHR: {
    default_domestic: 60,
    default_international: 90,
    terminal_change_domestic: 120,
    terminal_change_international: 150,
  },
  CDG: {
    default_domestic: 60,
    default_international: 90,
    terminal_change_domestic: 120,
    terminal_change_international: 150,
  },
  FRA: {
    default_domestic: 45,
    default_international: 60,
  },
  AMS: {
    default_domestic: 40,
    default_international: 50,
  },
  NRT: {
    default_domestic: 60,
    default_international: 90,
    terminal_change_domestic: 90,
    terminal_change_international: 120,
  },
  HND: {
    default_domestic: 60,
    default_international: 90,
    terminal_change_domestic: 120,
    terminal_change_international: 150,
  },
  DXB: {
    default_domestic: 60,
    default_international: 90,
  },
  SIN: {
    default_domestic: 45,
    default_international: 60,
  },
  HKG: {
    default_domestic: 45,
    default_international: 75,
  },
  ICN: {
    default_domestic: 60,
    default_international: 90,
  },
  IST: {
    default_domestic: 60,
    default_international: 90,
  },
  DOH: {
    default_domestic: 45,
    default_international: 60,
  },
  MIA: {
    default_domestic: 60,
    default_international: 90,
  },
};

// ---------------------------------------------------------------------------
// MCT resolution (4-level hierarchy)
// ---------------------------------------------------------------------------

export function resolveMct(
  airport: string,
  connectionType: ConnectionType,
  terminalChange: TerminalChangeType,
  arrivingCarrier?: string,
  departingCarrier?: string,
): { minutes: number; rule: string } {
  const config = AIRPORT_MCT[airport];

  // Level 1: Carrier-specific at airport
  if (config?.carrier_rules && arrivingCarrier && departingCarrier) {
    for (const rule of config.carrier_rules) {
      if (
        rule.arriving === arrivingCarrier &&
        rule.departing === departingCarrier &&
        rule.connection_type === connectionType
      ) {
        return {
          minutes: rule.minutes,
          rule: `carrier-specific: ${arrivingCarrier}→${departingCarrier} at ${airport}`,
        };
      }
    }
  }

  // Level 2: Airport + connection type + terminal change
  if (config && terminalChange === 'different') {
    const tcMinutes =
      connectionType === 'domestic'
        ? config.terminal_change_domestic
        : config.terminal_change_international;

    if (tcMinutes !== undefined) {
      return {
        minutes: tcMinutes,
        rule: `airport terminal-change: ${airport} ${connectionType}`,
      };
    }
  }

  // Level 3: Airport + connection type
  if (config) {
    const minutes =
      connectionType === 'domestic' ? config.default_domestic : config.default_international;
    return {
      minutes,
      rule: `airport default: ${airport} ${connectionType}`,
    };
  }

  // Level 4: IATA global defaults
  return {
    minutes: IATA_DEFAULTS[connectionType],
    rule: `IATA default: ${connectionType}`,
  };
}

// ---------------------------------------------------------------------------
// Alliance data (for interline checks)
// ---------------------------------------------------------------------------

const ALLIANCE_MAP: Record<string, string> = {
  // Star Alliance
  UA: 'star_alliance',
  LH: 'star_alliance',
  AC: 'star_alliance',
  NH: 'star_alliance',
  SK: 'star_alliance',
  OS: 'star_alliance',
  SN: 'star_alliance',
  LO: 'star_alliance',
  OU: 'star_alliance',
  TK: 'star_alliance',
  SQ: 'star_alliance',
  NZ: 'star_alliance',
  ET: 'star_alliance',
  SA: 'star_alliance',
  AI: 'star_alliance',
  // oneworld
  AA: 'oneworld',
  BA: 'oneworld',
  QF: 'oneworld',
  CX: 'oneworld',
  JL: 'oneworld',
  IB: 'oneworld',
  AY: 'oneworld',
  QR: 'oneworld',
  MH: 'oneworld',
  RJ: 'oneworld',
  AT: 'oneworld',
  // SkyTeam
  DL: 'skyteam',
  AF: 'skyteam',
  KL: 'skyteam',
  KE: 'skyteam',
  AM: 'skyteam',
  SU: 'skyteam',
  CI: 'skyteam',
  MU: 'skyteam',
  GA: 'skyteam',
  SV: 'skyteam',
  VN: 'skyteam',
};

export function checkInterline(
  carrier1: string,
  carrier2: string,
): { interlineAllowed: boolean; sameAlliance: boolean; alliance?: string } {
  if (carrier1 === carrier2) {
    return { interlineAllowed: true, sameAlliance: true, alliance: ALLIANCE_MAP[carrier1] };
  }

  const alliance1 = ALLIANCE_MAP[carrier1];
  const alliance2 = ALLIANCE_MAP[carrier2];

  if (alliance1 && alliance2 && alliance1 === alliance2) {
    return { interlineAllowed: true, sameAlliance: true, alliance: alliance1 };
  }

  // For now, assume all major carriers have interline agreements
  // TODO: [NEEDS DOMAIN INPUT] Real interline agreement database
  const hasAnyAlliance = !!(alliance1 || alliance2);
  return {
    interlineAllowed: hasAnyAlliance,
    sameAlliance: false,
  };
}
