/**
 * OTAIP Amenity Taxonomy — Domain 4 (Lodging)
 *
 * Open source, OTAIP-defined taxonomy for hotel amenities.
 * Hotels have no standard amenity taxonomy across systems.
 * "complimentary WiFi", "free internet", "wireless included" all mean the same thing.
 * This taxonomy provides canonical identifiers for normalized comparison.
 *
 * Domain source: OTAIP Lodging Knowledge Base §5 (Hotel Content Challenges)
 */

// ---------------------------------------------------------------------------
// Amenity categories
// ---------------------------------------------------------------------------

export type AmenityCategory =
  | 'connectivity'
  | 'food_beverage'
  | 'fitness'
  | 'pool'
  | 'parking'
  | 'accessibility'
  | 'business'
  | 'pets'
  | 'transportation'
  | 'laundry'
  | 'sustainability';

// ---------------------------------------------------------------------------
// Normalized amenity (output of content normalization)
// ---------------------------------------------------------------------------

export interface NormalizedAmenity {
  category: AmenityCategory;
  /** Canonical amenity ID (e.g., "wifi_free", "pool_outdoor_heated") */
  amenityId: string;
  /** Human-readable display name */
  displayName: string;
  /** Additional detail (e.g., "outdoor heated pool, seasonal May-Sep") */
  detail?: string;
  /** Whether this amenity is included in the rate or costs extra */
  included: boolean;
  /** Extra charge currency (if not included) */
  extraChargeCurrency?: string;
  /** Extra charge amount (if not included) */
  extraChargeAmount?: number;
}

// ---------------------------------------------------------------------------
// Amenity mapping reference — raw strings → canonical IDs
// ---------------------------------------------------------------------------

/**
 * Maps common raw amenity strings (lowercased) to canonical amenity definitions.
 * Used by the content normalization agent (20.3) for fuzzy matching.
 */
export const AMENITY_SYNONYMS: Record<
  string,
  { amenityId: string; category: AmenityCategory; displayName: string; included: boolean }
> = {
  // Connectivity
  'free wifi': {
    amenityId: 'wifi_free',
    category: 'connectivity',
    displayName: 'Free WiFi',
    included: true,
  },
  'complimentary wifi': {
    amenityId: 'wifi_free',
    category: 'connectivity',
    displayName: 'Free WiFi',
    included: true,
  },
  'free internet': {
    amenityId: 'wifi_free',
    category: 'connectivity',
    displayName: 'Free WiFi',
    included: true,
  },
  'wireless internet': {
    amenityId: 'wifi_free',
    category: 'connectivity',
    displayName: 'Free WiFi',
    included: true,
  },
  'wireless included': {
    amenityId: 'wifi_free',
    category: 'connectivity',
    displayName: 'Free WiFi',
    included: true,
  },
  wifi: { amenityId: 'wifi_paid', category: 'connectivity', displayName: 'WiFi', included: false },
  'high speed internet': {
    amenityId: 'wifi_paid',
    category: 'connectivity',
    displayName: 'High-Speed Internet',
    included: false,
  },
  ethernet: {
    amenityId: 'ethernet',
    category: 'connectivity',
    displayName: 'Ethernet',
    included: true,
  },

  // Food & Beverage
  'free breakfast': {
    amenityId: 'breakfast_free',
    category: 'food_beverage',
    displayName: 'Free Breakfast',
    included: true,
  },
  'complimentary breakfast': {
    amenityId: 'breakfast_free',
    category: 'food_beverage',
    displayName: 'Free Breakfast',
    included: true,
  },
  'breakfast included': {
    amenityId: 'breakfast_free',
    category: 'food_beverage',
    displayName: 'Free Breakfast',
    included: true,
  },
  'continental breakfast': {
    amenityId: 'breakfast_continental',
    category: 'food_beverage',
    displayName: 'Continental Breakfast',
    included: true,
  },
  breakfast: {
    amenityId: 'breakfast_paid',
    category: 'food_beverage',
    displayName: 'Breakfast Available',
    included: false,
  },
  restaurant: {
    amenityId: 'restaurant',
    category: 'food_beverage',
    displayName: 'Restaurant',
    included: true,
  },
  'room service': {
    amenityId: 'room_service',
    category: 'food_beverage',
    displayName: 'Room Service',
    included: false,
  },
  minibar: {
    amenityId: 'minibar',
    category: 'food_beverage',
    displayName: 'Minibar',
    included: false,
  },
  bar: { amenityId: 'bar', category: 'food_beverage', displayName: 'Bar/Lounge', included: true },

  // Fitness
  gym: { amenityId: 'gym', category: 'fitness', displayName: 'Fitness Center', included: true },
  'fitness center': {
    amenityId: 'gym',
    category: 'fitness',
    displayName: 'Fitness Center',
    included: true,
  },
  'fitness centre': {
    amenityId: 'gym',
    category: 'fitness',
    displayName: 'Fitness Center',
    included: true,
  },
  spa: { amenityId: 'spa', category: 'fitness', displayName: 'Spa', included: false },

  // Pool
  pool: { amenityId: 'pool_outdoor', category: 'pool', displayName: 'Pool', included: true },
  'outdoor pool': {
    amenityId: 'pool_outdoor',
    category: 'pool',
    displayName: 'Outdoor Pool',
    included: true,
  },
  'indoor pool': {
    amenityId: 'pool_indoor',
    category: 'pool',
    displayName: 'Indoor Pool',
    included: true,
  },
  'heated pool': {
    amenityId: 'pool_outdoor_heated',
    category: 'pool',
    displayName: 'Heated Pool',
    included: true,
  },

  // Parking
  'free parking': {
    amenityId: 'parking_free',
    category: 'parking',
    displayName: 'Free Parking',
    included: true,
  },
  parking: {
    amenityId: 'parking_paid',
    category: 'parking',
    displayName: 'Parking',
    included: false,
  },
  'valet parking': {
    amenityId: 'parking_valet',
    category: 'parking',
    displayName: 'Valet Parking',
    included: false,
  },
  'self parking': {
    amenityId: 'parking_self',
    category: 'parking',
    displayName: 'Self Parking',
    included: false,
  },

  // Accessibility
  'wheelchair accessible': {
    amenityId: 'wheelchair',
    category: 'accessibility',
    displayName: 'Wheelchair Accessible',
    included: true,
  },
  accessible: {
    amenityId: 'wheelchair',
    category: 'accessibility',
    displayName: 'Wheelchair Accessible',
    included: true,
  },

  // Business
  'business center': {
    amenityId: 'business_center',
    category: 'business',
    displayName: 'Business Center',
    included: true,
  },
  'business centre': {
    amenityId: 'business_center',
    category: 'business',
    displayName: 'Business Center',
    included: true,
  },
  'meeting rooms': {
    amenityId: 'meeting_rooms',
    category: 'business',
    displayName: 'Meeting Rooms',
    included: false,
  },
  'conference rooms': {
    amenityId: 'meeting_rooms',
    category: 'business',
    displayName: 'Meeting Rooms',
    included: false,
  },

  // Pets
  'pet friendly': {
    amenityId: 'pets_allowed',
    category: 'pets',
    displayName: 'Pet Friendly',
    included: true,
  },
  'pets allowed': {
    amenityId: 'pets_allowed',
    category: 'pets',
    displayName: 'Pet Friendly',
    included: true,
  },

  // Transportation
  'airport shuttle': {
    amenityId: 'shuttle_airport',
    category: 'transportation',
    displayName: 'Airport Shuttle',
    included: false,
  },
  'free airport shuttle': {
    amenityId: 'shuttle_airport_free',
    category: 'transportation',
    displayName: 'Free Airport Shuttle',
    included: true,
  },

  // Laundry
  laundry: {
    amenityId: 'laundry',
    category: 'laundry',
    displayName: 'Laundry Service',
    included: false,
  },
  'laundry service': {
    amenityId: 'laundry',
    category: 'laundry',
    displayName: 'Laundry Service',
    included: false,
  },
  'dry cleaning': {
    amenityId: 'dry_cleaning',
    category: 'laundry',
    displayName: 'Dry Cleaning',
    included: false,
  },

  // Sustainability
  'ev charging': {
    amenityId: 'ev_charging',
    category: 'sustainability',
    displayName: 'EV Charging Station',
    included: false,
  },
  'electric vehicle charging': {
    amenityId: 'ev_charging',
    category: 'sustainability',
    displayName: 'EV Charging Station',
    included: false,
  },
};
