/**
 * OTAIP Room Type Taxonomy — Domain 4 (Lodging)
 *
 * Open source, OTAIP-defined taxonomy for hotel room types.
 * Hotels have NO universal room type codes (unlike airline cabin classes).
 * GDS uses 1-4 letter codes (SGL, DBL, TWIN, STE) but they are not enforced.
 * Each hotel defines its own codes. This taxonomy provides a canonical mapping target.
 *
 * Domain source: OTAIP Lodging Knowledge Base §5 (Hotel Content Challenges)
 */

// ---------------------------------------------------------------------------
// Bed types
// ---------------------------------------------------------------------------

export type BedType =
  | 'king'
  | 'queen'
  | 'double'
  | 'twin'
  | 'single'
  | 'sofa'
  | 'bunk'
  | 'murphy'
  | 'futon';

// ---------------------------------------------------------------------------
// Room categories
// ---------------------------------------------------------------------------

export type RoomCategory =
  | 'standard'
  | 'superior'
  | 'deluxe'
  | 'premium'
  | 'suite'
  | 'junior_suite'
  | 'studio'
  | 'apartment'
  | 'villa'
  | 'penthouse';

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

export type ViewType =
  | 'city'
  | 'ocean'
  | 'sea'
  | 'garden'
  | 'pool'
  | 'mountain'
  | 'lake'
  | 'river'
  | 'park'
  | 'courtyard'
  | 'none'
  | 'unknown';

// ---------------------------------------------------------------------------
// Normalized room type (output of content normalization)
// ---------------------------------------------------------------------------

export interface NormalizedRoomType {
  /** OTAIP-generated canonical room type ID */
  otaipRoomId: string;
  category: RoomCategory;
  bedType: BedType;
  bedCount: number;
  viewType: ViewType;
  maxOccupancy: number;
  squareMeters?: number;
  accessible: boolean;
  smokingAllowed: boolean;
  floor?: string;
  /** Original codes from each source for traceability */
  rawCodes: Array<{ source: string; code: string }>;
}

// ---------------------------------------------------------------------------
// GDS code mapping reference
// ---------------------------------------------------------------------------

/**
 * Common GDS room type code prefixes (not enforced — hotels define their own):
 * SGL = Single, DBL = Double, TWIN = Twin, TRPL = Triple, QDPL = Quad,
 * STD = Standard, SUP = Superior, DLX = Deluxe, STE = Suite
 *
 * These are used by the content normalization agent (20.3) as hints
 * during room type classification.
 */
export const GDS_ROOM_CODE_HINTS: Record<string, Partial<NormalizedRoomType>> = {
  SGL: { bedType: 'single', bedCount: 1, maxOccupancy: 1 },
  DBL: { bedType: 'double', bedCount: 1, maxOccupancy: 2 },
  TWIN: { bedType: 'twin', bedCount: 2, maxOccupancy: 2 },
  TWN: { bedType: 'twin', bedCount: 2, maxOccupancy: 2 },
  TRPL: { bedType: 'double', bedCount: 2, maxOccupancy: 3 },
  QDPL: { bedType: 'double', bedCount: 2, maxOccupancy: 4 },
  STD: { category: 'standard' },
  SUP: { category: 'superior' },
  DLX: { category: 'deluxe' },
  STE: { category: 'suite' },
  JSTE: { category: 'junior_suite' },
  KNG: { bedType: 'king', bedCount: 1 },
  QN: { bedType: 'queen', bedCount: 1 },
  KING: { bedType: 'king', bedCount: 1 },
  QUEEN: { bedType: 'queen', bedCount: 1 },
};
