/**
 * Agent 20.3 — Hotel Content Normalization Agent
 *
 * Standardizes hotel content (room types, amenity names, descriptions, photos)
 * into a consistent OTAIP taxonomy for downstream comparison and display.
 *
 * Downstream: Feeds Agent 20.4 (Rate Comparison) with normalized content
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  AgentHealthStatus,
} from '@otaip/core';
import {
  AgentNotInitializedError,
  AgentInputValidationError,
} from '@otaip/core';
import type { ContentNormInput, ContentNormOutput, NormalizedPropertyContent } from './types.js';
import { normalizeRoomType } from './room-normalizer.js';
import { mergeAmenities } from './amenity-normalizer.js';
import { scorePhotos } from './photo-scorer.js';

export class ContentNormalizationAgent
  implements Agent<ContentNormInput, ContentNormOutput>
{
  readonly id = '20.3';
  readonly name = 'Hotel Content Normalization';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<ContentNormInput>,
  ): Promise<AgentOutput<ContentNormOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    let totalRoomTypesMapped = 0;
    let totalRoomTypesUnmapped = 0;
    let totalAmenitiesMapped = 0;
    let totalAmenitiesUnmapped = 0;

    const properties: NormalizedPropertyContent[] = input.data.properties.map((canonical) => {
      // Normalize room types from all source results
      const allRoomTypes = canonical.sourceResults.flatMap((sr) => sr.roomTypes);
      const normalizedRooms = [];
      const unmappedRooms = [];

      for (const raw of allRoomTypes) {
        const sourceId = canonical.sources[0]?.sourceId ?? 'unknown';
        const normalized = normalizeRoomType(raw, sourceId);
        if (normalized) {
          normalizedRooms.push(normalized);
          totalRoomTypesMapped++;
        } else {
          unmappedRooms.push(raw);
          totalRoomTypesUnmapped++;
        }
      }

      // Normalize amenities from all source results (union merge)
      const amenityLists = canonical.sourceResults.map((sr) => sr.amenities);
      const amenityResult = mergeAmenities(amenityLists);
      totalAmenitiesMapped += amenityResult.mapped.length;
      totalAmenitiesUnmapped += amenityResult.unmapped.length;

      // Score photos from all sources
      const photoLists = canonical.sourceResults.map((sr) => sr.photos);
      const scoredPhotos = scorePhotos(photoLists);

      return {
        canonicalId: canonical.canonicalId,
        property: canonical,
        normalizedRoomTypes: normalizedRooms,
        normalizedAmenities: amenityResult.mapped,
        scoredPhotos,
        unmappedRoomTypes: unmappedRooms,
        unmappedAmenities: amenityResult.unmapped,
      };
    });

    const warnings: string[] = [];
    if (totalRoomTypesUnmapped > 0) {
      warnings.push(`${totalRoomTypesUnmapped} room type(s) could not be mapped to OTAIP taxonomy`);
    }
    if (totalAmenitiesUnmapped > 0) {
      warnings.push(`${totalAmenitiesUnmapped} amenity string(s) could not be mapped to OTAIP taxonomy`);
    }

    return {
      data: {
        properties,
        stats: {
          totalProperties: properties.length,
          totalRoomTypesMapped,
          totalRoomTypesUnmapped,
          totalAmenitiesMapped,
          totalAmenitiesUnmapped,
        },
      },
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
  }

  private validateInput(data: ContentNormInput): void {
    if (!data.properties || !Array.isArray(data.properties)) {
      throw new AgentInputValidationError(this.id, 'properties', 'Properties array is required');
    }
  }
}

export type { ContentNormInput, ContentNormOutput, NormalizedPropertyContent, ScoredPhoto, PhotoCategory } from './types.js';
