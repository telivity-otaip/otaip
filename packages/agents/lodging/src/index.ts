/**
 * OTAIP Domain 4 — Lodging
 *
 * Hotel booking lifecycle: Search → Deduplicate → Normalize → Rate Compare → Book → Modify/Cancel → Verify
 *
 * 7 agents forming a complete hotel pipeline:
 * - 4.1 Hotel Search Aggregator
 * - 4.2 Property Deduplication
 * - 4.3 Content Normalization
 * - 4.4 Rate Comparison
 * - 4.5 Hotel Booking
 * - 4.6 Hotel Modification & Cancellation
 * - 4.7 Confirmation Verification
 */

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export { HotelSearchAggregatorAgent } from './hotel-search/index.js';
export { PropertyDeduplicationAgent } from './property-dedup/index.js';
export { ContentNormalizationAgent } from './content-normalization/index.js';
export { RateComparisonAgent } from './rate-comparison/index.js';
export { HotelBookingAgent } from './hotel-booking/index.js';
export { HotelModificationAgent } from './hotel-modification/index.js';
export { ConfirmationVerificationAgent } from './confirmation-verification/index.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type {
  HotelSource,
  GeoCoordinates,
  HotelAddress,
  HotelContact,
  HotelPhoto,
  RawRoomType,
  RawRate,
  RawHotelResult,
  CanonicalProperty,
  HotelConfirmation,
  PaymentModel,
  RateType,
  FeeUnit,
  MandatoryFee,
  CancellationPolicy,
  CancellationDeadline,
  MonetaryAmount,
  HotelBookingStatus,
  GuestInfo,
} from './types/hotel-common.js';

export type {
  BedType,
  RoomCategory,
  ViewType,
  NormalizedRoomType,
} from './types/room-taxonomy.js';

export type {
  AmenityCategory,
  NormalizedAmenity,
} from './types/amenity-taxonomy.js';

// ---------------------------------------------------------------------------
// Agent-specific types
// ---------------------------------------------------------------------------

export type {
  HotelSearchInput,
  AdapterResult,
  HotelSearchOutput,
} from './hotel-search/types.js';

export type {
  DedupInput,
  ScoreBreakdown,
  MergeDecision,
  DedupStats,
  DedupOutput,
} from './property-dedup/types.js';

export type {
  ContentNormInput,
  ContentNormOutput,
  PhotoCategory,
  ScoredPhoto,
  NormalizedPropertyContent,
} from './content-normalization/types.js';

export type {
  RateCompInput,
  TotalCostBreakdown,
  ComparedRate,
  ParityResult,
  PropertyRateComparison,
  RateCompOutput,
} from './rate-comparison/types.js';

export type {
  BookingOperation,
  BookingRequest,
  BookingInput,
  VirtualCardInfo,
  BookingRecord,
  BookingOutput,
} from './hotel-booking/types.js';

export type {
  ModificationInput,
  ModificationOutput,
  FreeModifications,
  DateChangeRequest,
  ChangeClassification,
  PenaltyCalculation,
  ModificationOperation,
} from './hotel-modification/types.js';

export type {
  VerificationInput,
  VerificationOutput,
  CrsBookingData,
  PmsBookingData,
  Discrepancy,
  DiscrepancySeverity,
  DiscrepancyField,
  EscalationReason,
  VerificationOperation,
} from './confirmation-verification/types.js';
