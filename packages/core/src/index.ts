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

