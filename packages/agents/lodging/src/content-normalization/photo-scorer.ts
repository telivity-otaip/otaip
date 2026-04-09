/**
 * Photo scoring and categorization.
 *
 * For v0.1.0: mock scoring based on URL patterns and image dimensions.
 * Real implementation would use image analysis APIs.
 *
 * Domain source: OTAIP Lodging Knowledge Base §10 (Content Merging — Photos)
 * "Expedia reports listings with high-quality images get 63% more bookings"
 */

import type { HotelPhoto } from '../types/hotel-common.js';
import type { ScoredPhoto, PhotoCategory } from './types.js';

/** Category priority for selecting primary photo (lower = higher priority) */
const CATEGORY_PRIORITY: Record<PhotoCategory, number> = {
  exterior: 1,
  lobby: 2,
  room: 3,
  bathroom: 4,
  pool: 5,
  dining: 6,
  fitness: 7,
  view: 8,
  other: 9,
};

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: PhotoCategory }> = [
  { pattern: /exterior|facade|building|front/i, category: 'exterior' },
  { pattern: /lobby|reception|entrance/i, category: 'lobby' },
  { pattern: /room|bedroom|suite|guest/i, category: 'room' },
  { pattern: /bathroom|bath|shower/i, category: 'bathroom' },
  { pattern: /pool|swimming/i, category: 'pool' },
  { pattern: /dining|restaurant|breakfast|bar|lounge/i, category: 'dining' },
  { pattern: /fitness|gym|exercise|spa/i, category: 'fitness' },
  { pattern: /view|panoram|skyline/i, category: 'view' },
];

/**
 * Categorize a photo based on URL, caption, and raw category.
 */
function categorizePhoto(photo: HotelPhoto): PhotoCategory {
  const text = `${photo.caption ?? ''} ${photo.category ?? ''} ${photo.url}`;

  for (const cp of CATEGORY_PATTERNS) {
    if (cp.pattern.test(text)) {
      return cp.category;
    }
  }

  return 'other';
}

/**
 * Score photo quality (0-1).
 * v0.1.0 mock: score based on dimensions and metadata availability.
 */
function scoreQuality(photo: HotelPhoto): number {
  let score = 0.5; // base score

  // Higher resolution = better quality
  if (photo.width && photo.height) {
    const pixels = photo.width * photo.height;
    if (pixels >= 2_000_000)
      score += 0.3; // 2MP+
    else if (pixels >= 1_000_000)
      score += 0.2; // 1MP+
    else if (pixels >= 500_000) score += 0.1; // 500K+
  }

  // Has caption = better metadata
  if (photo.caption && photo.caption.length > 0) {
    score += 0.1;
  }

  // Has category = better metadata
  if (photo.category && photo.category.length > 0) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}

/**
 * Score and categorize photos from all sources for a canonical property.
 * Deduplicates by URL. Assigns primary photo based on category priority.
 */
export function scorePhotos(photoLists: HotelPhoto[][]): ScoredPhoto[] {
  const allPhotos = photoLists.flat();

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique: HotelPhoto[] = [];
  for (const photo of allPhotos) {
    if (!seen.has(photo.url)) {
      seen.add(photo.url);
      unique.push(photo);
    }
  }

  // Score and categorize
  const scored: ScoredPhoto[] = unique.map((photo) => ({
    url: photo.url,
    caption: photo.caption,
    width: photo.width,
    height: photo.height,
    category: categorizePhoto(photo),
    qualityScore: scoreQuality(photo),
    isPrimary: false,
  }));

  // Assign primary photo (highest category priority, then highest quality)
  if (scored.length > 0) {
    scored.sort((a, b) => {
      const priorityDiff = CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category];
      if (priorityDiff !== 0) return priorityDiff;
      return b.qualityScore - a.qualityScore;
    });
    scored[0]!.isPrimary = true;
  }

  return scored;
}
