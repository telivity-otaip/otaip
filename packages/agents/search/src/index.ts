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
