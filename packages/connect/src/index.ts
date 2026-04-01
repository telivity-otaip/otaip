/**
 * @otaip/connect — Universal supplier adapter framework for travel booking APIs.
 *
 * Re-exports the ConnectAdapter interface, base utilities, supplier registry,
 * TripPro adapter, and stub channel/pipeline modules.
 */

// Standard interface types
export type {
  SearchFlightsInput,
  PassengerCount,
  CabinClass,
  CreateBookingInput,
  PassengerDetail,
  ContactInfo,
  FlightOffer,
  FlightSegment,
  FareBreakdown,
  MoneyAmount,
  PricedItinerary,
  FareRules,
  BookingResult,
  BookingStatus,
  BookingStatusResult,
  ConnectAdapter,
} from './types.js';

// Base adapter utilities
export { BaseAdapter, ConnectError } from './base-adapter.js';
export type { RetryConfig } from './base-adapter.js';

// Config utilities
export { validateConfig, baseAdapterConfigSchema } from './config.js';
export type { BaseAdapterConfig } from './config.js';

// Supplier registry
export {
  registerSupplier,
  createAdapter,
  listSuppliers,
} from './suppliers/index.js';

// TripPro adapter
export { TripProAdapter } from './suppliers/trippro/index.js';
export type { TripProConfig } from './suppliers/trippro/config.js';

// Channel stubs (types only — implementations are stubs)
export type { OpenAPIGeneratorConfig } from './channels/chatgpt/openapi-generator.js';
export type { GptInstructionsConfig } from './channels/chatgpt/gpt-instructions.js';
export type { McpServerConfig } from './channels/claude/mcp-server.js';
export type { McpToolDefinition } from './channels/claude/tool-generator.js';

// Pipeline stubs (types only — implementations are stubs)
export type { BookingPipelineConfig, BookingPipelineStep } from './pipeline/booking-flow.js';
export type { PaymentHandoffConfig, PaymentHandoffResult } from './pipeline/payment-handoff.js';
