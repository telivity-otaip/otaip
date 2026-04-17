/**
 * Fallback Chain Engine — Types
 *
 * When the primary routing channel fails, the fallback chain engine
 * automatically tries the next channel in the GdsNdcRouter's fallback
 * chain. NDC fails → retry via GDS → if GDS fails → surface error.
 */

import type { DistributionChannel } from '../gds-ndc-router/types.js';

export type FallbackStatus = 'success' | 'failed' | 'circuit_open' | 'skipped';

export interface FallbackAttempt {
  readonly channel: DistributionChannel;
  readonly status: FallbackStatus;
  readonly durationMs: number;
  readonly error?: string;
  readonly errorCode?: string;
}

export interface FallbackChainInput {
  /** Primary channel from the routing decision. */
  primary_channel: DistributionChannel;
  /** Fallback channels in priority order (from GdsNdcRouter output). */
  fallback_channels: DistributionChannel[];
  /** The operation to attempt on each channel. */
  operation: 'search' | 'price' | 'book' | 'ticket';
  /** Carrier IATA code (used for circuit breaker lookup). */
  carrier: string;
  /** Opaque payload passed to the channel executor. */
  payload: unknown;
}

export interface FallbackChainOutput {
  /** The channel that ultimately succeeded (null if all failed). */
  successful_channel: DistributionChannel | null;
  /** Whether any channel succeeded. */
  success: boolean;
  /** The result from the successful channel (null if all failed). */
  result: unknown;
  /** Every attempt in order (primary first, then fallbacks). */
  attempts: FallbackAttempt[];
  /** Total time across all attempts. */
  total_duration_ms: number;
}

/**
 * Executor function that the fallback chain calls for each channel.
 * Implementations wrap the actual adapter call. Throwing means the
 * channel failed; the chain moves to the next fallback.
 */
export type ChannelExecutor = (
  channel: DistributionChannel,
  payload: unknown,
) => Promise<unknown>;

/**
 * Circuit state checker — the chain skips channels whose circuit
 * breaker is open. Returns true if the channel is usable.
 */
export type CircuitChecker = (
  channel: DistributionChannel,
  carrier: string,
) => boolean;
