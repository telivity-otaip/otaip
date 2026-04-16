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
  HotelCarSearchInput,
  HotelCarSearchOutput,
  HotelSearchInput,
  HotelSearchOutput,
  HotelOffer,
  HotelAdapter,
  CarSearchInput,
  CarSearchOutput,
  CarOffer,
  CarAdapter,
  CarCategory,
  HotelCarOperation,
} from './hotel-car-search/index.js';

export { AITravelAdvisorAgent, MockLLMProvider } from './ai-travel-advisor/index.js';
export type {
  TravelAdvisorInput,
  TravelAdvisorOutput,
  LLMProvider,
  LLMOptions,
  TravelerContext,
  ExtractedSearchParameters,
  TravelIntent,
  AITravelAdvisorConfig,
} from './ai-travel-advisor/index.js';
