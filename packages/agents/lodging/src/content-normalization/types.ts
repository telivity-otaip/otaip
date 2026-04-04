/**
 * Content Normalization Agent — Input/Output types
 *
 * Agent 20.3: Standardizes hotel content (room types, amenity names, descriptions,
 * photos) into a consistent taxonomy for comparison and display.
 *
 * Domain source: OTAIP Lodging Knowledge Base §5 (Hotel Content Challenges)
 */

import type { CanonicalProperty, RawRoomType } from '../types/hotel-common.js';
import type { NormalizedRoomType } from '../types/room-taxonomy.js';
import type { NormalizedAmenity } from '../types/amenity-taxonomy.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ContentNormInput {
  /** Canonical property records from Agent 20.2 */
  properties: CanonicalProperty[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type PhotoCategory = 'exterior' | 'room' | 'bathroom' | 'lobby' | 'pool' | 'dining' | 'fitness' | 'view' | 'other';

export interface ScoredPhoto {
  url: string;
  caption?: string;
  width?: number;
  height?: number;
  category: PhotoCategory;
  qualityScore: number;
  isPrimary: boolean;
}

export interface NormalizedPropertyContent {
  /** Canonical property ID (pass-through from 20.2) */
  canonicalId: string;
  /** Original canonical property (preserved) */
  property: CanonicalProperty;
  /** Normalized room types mapped to OTAIP taxonomy */
  normalizedRoomTypes: NormalizedRoomType[];
  /** Normalized amenities mapped to OTAIP taxonomy */
  normalizedAmenities: NormalizedAmenity[];
  /** Scored and categorized photos */
  scoredPhotos: ScoredPhoto[];
  /** Raw room types that couldn't be normalized (for audit) */
  unmappedRoomTypes: RawRoomType[];
  /** Raw amenity strings that couldn't be normalized (for audit) */
  unmappedAmenities: string[];
}

export interface ContentNormOutput {
  /** Normalized property content */
  properties: NormalizedPropertyContent[];
  /** Summary statistics */
  stats: {
    totalProperties: number;
    totalRoomTypesMapped: number;
    totalRoomTypesUnmapped: number;
    totalAmenitiesMapped: number;
    totalAmenitiesUnmapped: number;
  };
}
