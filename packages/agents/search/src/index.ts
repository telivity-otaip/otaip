/**
 * @otaip/agents-search — Stage 1 search agents.
 *
 * Re-exports all Stage 1 agent classes.
 */

export { AvailabilitySearch } from './availability-search/index.js';
export type {
  AvailabilitySearchInput,
  AvailabilitySearchOutput,
  SourceStatus,
  CabinClass,
  SortField,
  SortOrder,
} from './availability-search/index.js';
export { availabilitySearchContract } from './availability-search/contract.js';
export {
  availabilitySearchInputSchema,
  availabilitySearchOutputSchema,
} from './availability-search/schema.js';

export { ScheduleLookup } from './schedule-lookup/index.js';
export type {
  ScheduleLookupInput,
  ScheduleLookupOutput,
  ScheduledFlight,
  OperatingSchedule,
  ConnectionOption,
  DayOfWeek,
} from './schedule-lookup/index.js';
export { parseSsimDays, operatesOnDate, getDayOfWeek } from './schedule-lookup/index.js';

export { ConnectionBuilder } from './connection-builder/index.js';
export type {
  ConnectionBuilderInput,
  ConnectionBuilderOutput,
  ConnectionValidation,
  ConnectionQuality,
  QualityFactor,
  InterlineCheck,
  ConnectionType,
  TerminalChangeType,
  MctRule,
} from './connection-builder/index.js';

export { FareShopping } from './fare-shopping/index.js';
export type {
  FareShoppingInput,
  FareShoppingOutput,
  FareOffer,
  FareFamilyGroup,
  FareFamily,
  DecodedFareBasisInfo,
  ClassOfServiceInfo,
  PassengerPricing,
} from './fare-shopping/index.js';

export { AncillaryShoppingAgent } from './ancillary-shopping/index.js';
export type {
  AncillaryShoppingInput,
  AncillaryShoppingOutput,
  AncillaryOffer,
  AncillaryCategory,
  RficCode,
  AncillarySegment,
  AncillaryPassenger,
  AncillaryPrice,
  PassengerType,
} from './ancillary-shopping/index.js';
export type { AncillaryAdapter } from './ancillary-shopping/index.js';

export { MultiSourceAggregatorAgent } from './multi-source-aggregator/index.js';
export type {
  MultiSourceInput,
  MultiSourceOutput,
  NormalizedFlight,
  SearchResult,
  AdapterSearchResult,
  AdapterSummary,
  DeduplicationStrategy,
  RankBy,
} from './multi-source-aggregator/index.js';

export { HotelCarSearchAgent } from './hotel-car-search/index.js';
export type {
  AdapterSummary as HotelCarAdapterSummary,
  CarAdapter,
  CarCategory,
  CarOffer,
  CarSearchInput,
  CarSearchOutput,
  CarSortBy,
  HotelAdapter,
  HotelCarOperation,
  HotelCarSearchAgentOptions,
  HotelCarSearchInput,
  HotelCarSearchOutput,
  HotelOffer,
  HotelSearchInput,
  HotelSearchOutput,
  HotelSortBy,
} from './hotel-car-search/index.js';
export { hotelCarSearchAgentContract } from './hotel-car-search/contract.js';
export {
  hotelCarSearchInputSchema,
  hotelCarSearchOutputSchema,
} from './hotel-car-search/schema.js';

export { AITravelAdvisorAgent } from './ai-travel-advisor/index.js';
export type {
  AdvisorInput,
  AdvisorOutput,
  CabinClass as AdvisorCabinClass,
  PassengerCounts,
  Recommendation,
  ResolvedPreferences,
  ScoreBreakdown,
  ScoringWeights,
  SearchSummary as AdvisorSearchSummary,
  TravelerPreferences,
  TripPurpose,
} from './ai-travel-advisor/index.js';
export { aiTravelAdvisorContract } from './ai-travel-advisor/contract.js';
export {
  advisorInputSchema,
  advisorOutputSchema,
} from './ai-travel-advisor/schema.js';
