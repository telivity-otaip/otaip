/**
 * Room type normalization — maps raw room codes and descriptions to OTAIP taxonomy.
 *
 * Hotels have NO universal room type codes. GDS uses 1-4 letter codes
 * (SGL, DBL, TWIN, STE) but they are not enforced. Each hotel defines its own.
 *
 * Strategy: keyword extraction from description + GDS code hints.
 *
 * Domain source: OTAIP Lodging Knowledge Base §5 (Room Type Codes)
 */

import type { RawRoomType } from '../types/hotel-common.js';
import type { NormalizedRoomType, BedType, RoomCategory, ViewType } from '../types/room-taxonomy.js';
import { GDS_ROOM_CODE_HINTS } from '../types/room-taxonomy.js';

let roomIdCounter = 0;

// ---------------------------------------------------------------------------
// Keyword patterns
// ---------------------------------------------------------------------------

const BED_TYPE_PATTERNS: Array<{ pattern: RegExp; bedType: BedType; bedCount: number }> = [
  { pattern: /\bking\b/i, bedType: 'king', bedCount: 1 },
  { pattern: /\bqueen\b/i, bedType: 'queen', bedCount: 1 },
  { pattern: /\btwin\b/i, bedType: 'twin', bedCount: 2 },
  { pattern: /\bdouble\b/i, bedType: 'double', bedCount: 1 },
  { pattern: /\bsingle\b/i, bedType: 'single', bedCount: 1 },
  { pattern: /\bsofa\s*bed\b/i, bedType: 'sofa', bedCount: 1 },
  { pattern: /\bbunk\b/i, bedType: 'bunk', bedCount: 2 },
  { pattern: /\bmurphy\b/i, bedType: 'murphy', bedCount: 1 },
  { pattern: /\bfuton\b/i, bedType: 'futon', bedCount: 1 },
];

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: RoomCategory }> = [
  { pattern: /\bpenthouse\b/i, category: 'penthouse' },
  { pattern: /\bvilla\b/i, category: 'villa' },
  { pattern: /\bapartment\b/i, category: 'apartment' },
  { pattern: /\bstudio\b/i, category: 'studio' },
  { pattern: /\bjunior\s*suite\b/i, category: 'junior_suite' },
  { pattern: /\bsuite\b/i, category: 'suite' },
  { pattern: /\bpremium\b/i, category: 'premium' },
  { pattern: /\bdeluxe\b|\bdlx\b/i, category: 'deluxe' },
  { pattern: /\bsuperior\b|\bsup\b/i, category: 'superior' },
  { pattern: /\bstandard\b|\bstd\b/i, category: 'standard' },
];

const VIEW_PATTERNS: Array<{ pattern: RegExp; viewType: ViewType }> = [
  { pattern: /\bocean\s*view\b/i, viewType: 'ocean' },
  { pattern: /\bsea\s*view\b/i, viewType: 'sea' },
  { pattern: /\bgarden\s*view\b/i, viewType: 'garden' },
  { pattern: /\bpool\s*view\b/i, viewType: 'pool' },
  { pattern: /\bcity\s*view\b/i, viewType: 'city' },
  { pattern: /\bmountain\s*view\b/i, viewType: 'mountain' },
  { pattern: /\blake\s*view\b/i, viewType: 'lake' },
  { pattern: /\briver\s*view\b/i, viewType: 'river' },
  { pattern: /\bpark\s*view\b/i, viewType: 'park' },
  { pattern: /\bcourtyard\s*view\b/i, viewType: 'courtyard' },
];

/**
 * Normalize a single raw room type to OTAIP taxonomy.
 */
export function normalizeRoomType(
  raw: RawRoomType,
  sourceId: string,
): NormalizedRoomType | null {
  const text = `${raw.code ?? ''} ${raw.description} ${raw.bedTypeRaw ?? ''}`;

  // Try GDS code hint first
  let gdsHint: Partial<NormalizedRoomType> = {};
  if (raw.code) {
    const code = raw.code.toUpperCase();
    const hint = GDS_ROOM_CODE_HINTS[code];
    if (hint) {
      gdsHint = hint;
    }
  }

  // Extract bed type from description
  let bedType: BedType = gdsHint.bedType ?? 'double';
  let bedCount = gdsHint.bedCount ?? 1;
  for (const bp of BED_TYPE_PATTERNS) {
    if (bp.pattern.test(text)) {
      bedType = bp.bedType;
      bedCount = bp.bedCount;
      break;
    }
  }

  // Extract category from description
  let category: RoomCategory = gdsHint.category ?? 'standard';
  for (const cp of CATEGORY_PATTERNS) {
    if (cp.pattern.test(text)) {
      category = cp.category;
      break;
    }
  }

  // Extract view type from description
  let viewType: ViewType = 'unknown';
  for (const vp of VIEW_PATTERNS) {
    if (vp.pattern.test(text)) {
      viewType = vp.viewType;
      break;
    }
  }

  // Check accessibility
  const accessible = /\baccessib|ada|wheelchair|mobility/i.test(text);

  // Check smoking
  const smokingAllowed = /\bsmoking\b/i.test(text) && !/\bnon[- ]?smoking\b/i.test(text);

  roomIdCounter++;
  return {
    otaipRoomId: `otaip-rm-${roomIdCounter}`,
    category,
    bedType,
    bedCount,
    viewType,
    maxOccupancy: raw.maxOccupancy ?? gdsHint.maxOccupancy ?? 2,
    accessible,
    smokingAllowed,
    rawCodes: [{ source: sourceId, code: raw.code ?? raw.roomTypeId }],
  };
}

/** Reset internal counter (for testing). */
export function resetRoomIdCounter(): void {
  roomIdCounter = 0;
}
