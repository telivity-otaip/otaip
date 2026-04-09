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
export { registerSupplier, createAdapter, listSuppliers } from './suppliers/index.js';

// TripPro adapter
export { TripProAdapter } from './suppliers/trippro/index.js';
export type { TripProConfig } from './suppliers/trippro/config.js';

// Sabre adapter
export { SabreAdapter } from './suppliers/sabre/index.js';
export type { SabreConfig } from './suppliers/sabre/config.js';

// Navitaire adapter
export { NavitaireAdapter } from './suppliers/navitaire/index.js';
export type { NavitaireConfig } from './suppliers/navitaire/config.js';

// Amadeus adapter
export { AmadeusAdapter } from './suppliers/amadeus/index.js';
export type { AmadeusConfig } from './suppliers/amadeus/config.js';

// Channel generators
export { generateOpenAPISpec } from './channels/chatgpt/openapi-generator.js';
export type { OpenAPIGeneratorConfig } from './channels/chatgpt/openapi-generator.js';
export { generateGptInstructions } from './channels/chatgpt/gpt-instructions.js';
export type { GptInstructionsConfig } from './channels/chatgpt/gpt-instructions.js';
export { generateMcpServer } from './channels/claude/mcp-server.js';
export type { McpServerConfig } from './channels/claude/mcp-server.js';
export { generateMcpTools } from './channels/claude/tool-generator.js';
export type { McpToolDefinition } from './channels/claude/tool-generator.js';

// White-label config
export type { WhiteLabelConfig } from './types.js';

// HAIP PMS adapter
export { HaipAdapter } from './suppliers/haip/index.js';
export type { HaipConfig } from './suppliers/haip/config.js';
export type {
  HaipSearchParams,
  HaipBookingParams,
  HaipModifyParams,
  HaipHotelResult,
  HaipBookingResult,
  HaipVerificationResult,
  HaipModificationResult,
  HaipCancellationResult,
} from './suppliers/haip/index.js';

// Pipeline stubs (types only — implementations are stubs)
export type { BookingPipelineConfig, BookingPipelineStep } from './pipeline/booking-flow.js';
export type { PaymentHandoffConfig, PaymentHandoffResult } from './pipeline/payment-handoff.js';
