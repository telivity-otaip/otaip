/**
 * Core decoding logic for Fare Basis Code Decoder.
 *
 * Parses ATPCO-standard fare basis codes using regex patterns.
 * No external data files required — all mappings are inline.
 *
 * All domain rules from the spec (agents/specs/0-3-fare-basis-code-decoder.yaml).
 */

import type {
  CabinClass,
  FareType,
  Season,
  DayOfWeek,
  AdvancePurchase,
  FarePenalties,
  DecodedFareBasis,
  FareBasisDecoderOutput,
} from './types.js';

// ---------------------------------------------------------------------------
// Primary code → cabin class mapping (ATPCO standard)
// ---------------------------------------------------------------------------

const PRIMARY_CODE_MAP: Record<string, CabinClass> = {
  F: 'first',
  P: 'first',
  A: 'first',
  J: 'business',
  C: 'business',
  D: 'business',
  I: 'business',
  Z: 'business',
  W: 'premium_economy',
  R: 'premium_economy',
  Y: 'economy',
  B: 'economy',
  M: 'economy',
  H: 'economy',
  Q: 'economy',
  V: 'economy',
  K: 'economy',
  L: 'economy',
  S: 'economy',
  N: 'economy',
  T: 'economy',
};

// ---------------------------------------------------------------------------
// Modifier patterns — applied to the remainder after the primary code
// ---------------------------------------------------------------------------

/** Matches advance-purchase days followed by NR or AP, e.g. "14NR", "7AP" */
const ADVANCE_PURCHASE_DAYS_RE = /(\d{1,3})(NR|AP)/;

/** Matches standalone AP indicator */
const AP_INDICATOR_RE = /\bAP\b/;

/** Matches standalone NR indicator */
const NR_INDICATOR_RE = /\bNR\b/;

/** Matches OW (one-way) indicator */
const OW_INDICATOR_RE = /\bOW\b/;

/** Matches RT (round-trip) indicator */
const RT_INDICATOR_RE = /\bRT\b/;

/** Matches X (excursion) indicator */
const EXCURSION_RE = /X/;

/** Matches EE or E (electronic ticket) */
const ETICKET_RE = /\bEE?\b/;

/**
 * Season codes in position 2+ when not part of another known pattern.
 * H = high, L = low, K = shoulder (some carriers use K for shoulder)
 * TODO: [NEEDS DOMAIN INPUT] Carrier-specific season code variations.
 */
const SEASON_MAP: Record<string, Season> = {
  H: 'high',
  L: 'low',
  K: 'shoulder',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapCabinClass(letter: string): CabinClass {
  return PRIMARY_CODE_MAP[letter.toUpperCase()] ?? 'unknown';
}

interface ParsedModifiers {
  fareType: FareType;
  season: Season | null;
  dayOfWeek: DayOfWeek | null;
  advancePurchase: AdvancePurchase | null;
  penalties: FarePenalties;
  ticketDesignator: string | null;
  unparsed: string[];
  parsedCount: number;
  totalSegments: number;
}

/**
 * Parse the modifier portion of a fare basis code (everything after position 1).
 */
function parseModifiers(remainder: string): ParsedModifiers {
  let working = remainder;
  let fareType: FareType = 'normal';
  let season: Season | null = null;
  const dayOfWeek: DayOfWeek | null = null;
  let advancePurchase: AdvancePurchase | null = null;
  let refundable = true;
  let ticketDesignator: string | null = null;

  const parsedParts: string[] = [];

  // Track total meaningful content
  const totalLength = working.length;
  if (totalLength === 0) {
    return {
      fareType,
      season,
      dayOfWeek,
      advancePurchase,
      penalties: {
        refundable: true,
        changeable: true,
        change_fee_applies: false,
        description: null,
      },
      ticketDesignator,
      unparsed: [],
      parsedCount: 0,
      totalSegments: 0,
    };
  }

  // 1. Advance purchase with days: "14NR", "7AP", "21NR"
  const apDaysMatch = working.match(ADVANCE_PURCHASE_DAYS_RE);
  if (apDaysMatch) {
    const days = parseInt(apDaysMatch[1]!, 10);
    const suffix = apDaysMatch[2]!;
    advancePurchase = {
      days,
      description: `${days}-day advance purchase`,
    };
    if (suffix === 'NR') {
      refundable = false;
    }
    parsedParts.push(apDaysMatch[0]);
    working = working.replace(apDaysMatch[0], '');
  } else {
    // 2. Standalone AP
    if (AP_INDICATOR_RE.test(working)) {
      advancePurchase = {
        days: null,
        description: 'Advance purchase required',
      };
      parsedParts.push('AP');
      working = working.replace(AP_INDICATOR_RE, '');
    }

    // 3. Standalone NR
    if (NR_INDICATOR_RE.test(working)) {
      refundable = false;
      parsedParts.push('NR');
      working = working.replace(NR_INDICATOR_RE, '');
    }
  }

  // 4. OW (one-way)
  if (OW_INDICATOR_RE.test(working)) {
    parsedParts.push('OW');
    working = working.replace(OW_INDICATOR_RE, '');
    // OW is a trip type indicator, does not change fare type
  }

  // 5. RT (round-trip)
  if (RT_INDICATOR_RE.test(working)) {
    parsedParts.push('RT');
    working = working.replace(RT_INDICATOR_RE, '');
  }

  // 6. X (excursion)
  if (EXCURSION_RE.test(working)) {
    fareType = 'excursion';
    parsedParts.push('X');
    working = working.replace(EXCURSION_RE, '');
  }

  // 7. EE or E (electronic ticket designator)
  const eTicketMatch = working.match(ETICKET_RE);
  if (eTicketMatch) {
    ticketDesignator = eTicketMatch[0];
    parsedParts.push(eTicketMatch[0]);
    working = working.replace(ETICKET_RE, '');
  }

  // 8. Season code — only check single letters that match season map
  //    and are at position 0 of the remaining working string (position 2 in original code)
  //    We check the original remainder to determine position-2 season
  if (remainder.length > 0) {
    const firstModChar = remainder[0]!.toUpperCase();
    if (SEASON_MAP[firstModChar] && !parsedParts.some(p => p.includes(firstModChar))) {
      season = SEASON_MAP[firstModChar]!;
      // Only mark as parsed if it's still in working string at start
      if (working.length > 0 && working[0]!.toUpperCase() === firstModChar) {
        parsedParts.push(firstModChar);
        working = working.substring(1);
      }
    }
  }

  // 9. Determine fare type from primary code context if not already set
  //    A non-normal primary code (like H, Q, V, K, L, etc.) with modifiers is typically "special"
  if (fareType === 'normal' && parsedParts.length > 0) {
    fareType = 'special';
  }

  // Collect unparsed remainder
  const unparsed: string[] = [];
  const leftover = working.trim();
  if (leftover.length > 0) {
    unparsed.push(leftover);
  }

  const penaltyDescriptions: string[] = [];
  if (!refundable) {
    penaltyDescriptions.push('Non-refundable');
  }

  return {
    fareType,
    season,
    dayOfWeek,
    advancePurchase,
    penalties: {
      refundable,
      changeable: true, // Default — cannot determine from fare basis alone
      change_fee_applies: !refundable, // If non-refundable, change fees likely apply
      description: penaltyDescriptions.length > 0 ? penaltyDescriptions.join('; ') : null,
    },
    ticketDesignator,
    unparsed,
    parsedCount: parsedParts.length,
    totalSegments: parsedParts.length + unparsed.length,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decode a fare basis code into its components.
 *
 * @param fareBasis - The ATPCO fare basis code string (already validated as non-empty, <= 15 chars).
 * @returns Decoded output with confidence and unparsed segments.
 */
export function decodeFareBasis(fareBasis: string): FareBasisDecoderOutput {
  const code = fareBasis.toUpperCase().trim();

  if (code.length === 0) {
    return {
      decoded: null,
      match_confidence: 0,
      unparsed_segments: [],
    };
  }

  // Validate that the code starts with an alphabetic character
  const primaryCode = code[0]!;
  if (!/^[A-Z]$/.test(primaryCode)) {
    return {
      decoded: null,
      match_confidence: 0,
      unparsed_segments: [code],
    };
  }

  const cabinClass = mapCabinClass(primaryCode);
  const remainder = code.substring(1);

  // Parse modifiers
  const mods = parseModifiers(remainder);

  // Determine fare type: single-letter codes with known cabin are "normal"
  let fareType = mods.fareType;
  if (remainder.length === 0) {
    fareType = 'normal';
  }

  // Build decoded result
  const decoded: DecodedFareBasis = {
    fare_basis: fareBasis.toUpperCase().trim(),
    primary_code: primaryCode,
    cabin_class: cabinClass,
    fare_type: fareType,
    season: mods.season,
    day_of_week: mods.dayOfWeek,
    advance_purchase: mods.advancePurchase,
    min_stay: null, // TODO: [NEEDS DOMAIN INPUT] Min-stay pattern decoding
    max_stay: null, // TODO: [NEEDS DOMAIN INPUT] Max-stay pattern decoding
    penalties: mods.penalties,
    ticket_designator: mods.ticketDesignator,
  };

  // Calculate confidence
  const confidence = calculateConfidence(cabinClass, remainder, mods.unparsed);

  return {
    decoded,
    match_confidence: confidence,
    unparsed_segments: mods.unparsed,
  };
}

/**
 * Calculate match confidence based on how much of the code was parsed.
 */
function calculateConfidence(
  cabinClass: CabinClass,
  remainder: string,
  unparsed: string[],
): number {
  // Unknown primary code
  if (cabinClass === 'unknown') {
    return 0.5;
  }

  // Single-letter code, fully known
  if (remainder.length === 0) {
    return 1.0;
  }

  // Everything parsed (no unparsed segments)
  if (unparsed.length === 0) {
    return 1.0;
  }

  // Partial parse: scale between 0.7 and 0.9 based on how much was unparsed
  const unparsedLength = unparsed.reduce((sum, s) => sum + s.length, 0);
  const totalModLength = remainder.length;
  const parsedRatio = 1 - (unparsedLength / totalModLength);

  // Map parsedRatio [0, 1) → confidence [0.7, 0.9]
  return Math.round((0.7 + parsedRatio * 0.2) * 100) / 100;
}
