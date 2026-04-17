/**
 * Fallback Chain Engine
 *
 * Executes a channel operation with automatic fallback. Tries the primary
 * channel first, then each fallback in order. Skips channels whose circuit
 * breaker is open. Surfaces a full audit trail of every attempt.
 */

import type {
  ChannelExecutor,
  CircuitChecker,
  FallbackAttempt,
  FallbackChainInput,
  FallbackChainOutput,
  FallbackStatus,
} from './types.js';
import type { DistributionChannel } from '../gds-ndc-router/types.js';

/** Default circuit checker: all channels are usable. */
const defaultCircuitChecker: CircuitChecker = () => true;

/**
 * Run the fallback chain. The executor is called once per channel
 * attempt. If it throws, the chain moves to the next channel. If
 * the circuit checker reports the channel is open, the channel is
 * skipped entirely.
 */
export async function executeFallbackChain(
  input: FallbackChainInput,
  executor: ChannelExecutor,
  circuitChecker: CircuitChecker = defaultCircuitChecker,
): Promise<FallbackChainOutput> {
  const attempts: FallbackAttempt[] = [];
  const totalStart = Date.now();

  // Build ordered channel list: primary first, then fallbacks.
  const channels: DistributionChannel[] = [
    input.primary_channel,
    ...input.fallback_channels,
  ];

  for (const channel of channels) {
    // Circuit breaker check.
    if (!circuitChecker(channel, input.carrier)) {
      attempts.push({
        channel,
        status: 'circuit_open',
        durationMs: 0,
        error: `Circuit breaker open for ${channel} on carrier ${input.carrier}`,
      });
      continue;
    }

    const start = Date.now();
    try {
      const result = await executor(channel, input.payload);
      attempts.push({
        channel,
        status: 'success',
        durationMs: Date.now() - start,
      });
      return {
        successful_channel: channel,
        success: true,
        result,
        attempts,
        total_duration_ms: Date.now() - totalStart,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && 'code' in err
        ? String((err as { code: unknown }).code)
        : undefined;
      attempts.push({
        channel,
        status: 'failed',
        durationMs: Date.now() - start,
        error: msg,
        errorCode: code,
      });
    }
  }

  // All channels exhausted.
  return {
    successful_channel: null,
    success: false,
    result: null,
    attempts,
    total_duration_ms: Date.now() - totalStart,
  };
}
