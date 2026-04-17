/**
 * Public barrel for the OTAIP event store.
 */

export type {
  AdapterHealthEvent,
  AgentExecutedEvent,
  AggregateResult,
  BookingCompletedEvent,
  BookingFailedEvent,
  EventFilter,
  EventStore,
  OtaipEvent,
  OtaipEventType,
  RoutingDecidedEvent,
  RoutingOutcomeEvent,
  TimeWindow,
} from './types.js';

export { InMemoryEventStore } from './in-memory.js';
