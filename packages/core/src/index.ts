export type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from './types/agent.js';
export {
  AgentError,
  AgentNotInitializedError,
  AgentInputValidationError,
  AgentDataUnavailableError,
} from './errors/agent-errors.js';

export { OfferEvaluatorAgent, evaluateOffers } from './agents/shopping/index.js';
export type {
  OfferEvaluatorRequest,
  OfferEvaluatorResponse,
  EvaluatorResult,
  EvaluatorOffer,
  TravelerConstraints,
  TravelerProfile,
  ScoringWeights,
  SelectedOffer,
  RejectedOffer,
  EvaluationSummary,
  ChainConfidence,
  ConfidenceBasis,
  ConfidenceResult,
  ScoreBreakdown,
  StructuredExplanation,
} from './agents/shopping/index.js';

export type { ToolDefinition, ValidationIssue, ValidationResult } from './tool-interface/index.js';
export { validateToolInput, validateToolOutput } from './tool-interface/index.js';
export { ToolRegistry } from './tool-interface/index.js';

export type { RetryConfig, IsRetryable } from './retry/index.js';
export { DEFAULT_RETRY_CONFIG, withRetry, computeDelay } from './retry/index.js';

export type {
  LoopPhase,
  ToolCall,
  ToolResult,
  LoopMessage,
  LoopState,
  LoopEvent,
  StopCondition,
  ModelCallFn,
  LoopConfig,
} from './agent-loop/index.js';
export { AgentLoop } from './agent-loop/index.js';

export type {
  LifecycleEvent,
  HookContext,
  BeforeToolCallResult,
  HookHandler,
  HookErrorPolicy,
  HookRegistryConfig,
} from './lifecycle/index.js';
export { HookRegistry } from './lifecycle/index.js';

export type { SpawnOptions, SubAgentResult } from './sub-agent/index.js';
export { SubAgentSpawner } from './sub-agent/index.js';

export type {
  ContextEntry,
  ContextBudgetConfig,
  CompactionStrategy,
  TokenCounter,
} from './context/index.js';
export { ContextBudgetManager, CharTokenCounter } from './context/index.js';
export { TiktokenCounter } from './context/index.js';
export type { TiktokenEncoding } from './context/index.js';
export { TruncateOldestStrategy, DropLargeToolOutputsStrategy } from './context/index.js';

export type { TelemetryProvider, TelemetrySpan } from './telemetry/index.js';
export { NoopTelemetryProvider, traceAgentExecution, OTelTelemetryProvider } from './telemetry/index.js';

export type { PersistenceAdapter } from './persistence/index.js';
export { InMemoryPersistenceAdapter } from './persistence/index.js';

export type { RateLimiterConfig } from './rate-limiter/index.js';
export { RateLimiter } from './rate-limiter/index.js';

export type { AuthContext, AuthMiddleware } from './auth/index.js';

export type { Idempotent, Cancellable, Checkpointable } from './mixins/index.js';

export type { CacheAdapter, CacheConfig } from './cache/index.js';
export { LRUCacheAdapter } from './cache/index.js';

export type {
  PassengerType,
  PassengerCount,
  SearchSegment,
  SearchRequest,
  FlightSegment,
  Itinerary,
  PriceBreakdown,
  PerPassengerPrice,
  SearchOffer,
  SearchResponse,
  PriceRequest,
  PriceResponse,
  DistributionAdapter,
} from './types/distribution.js';
