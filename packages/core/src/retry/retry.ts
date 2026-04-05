/**
 * Retry with exponential backoff and full jitter.
 */

import { DEFAULT_RETRY_CONFIG } from './types.js';
import type { RetryConfig, IsRetryable } from './types.js';

/**
 * Compute the delay for a given attempt with exponential backoff + jitter.
 *
 * delay = min(baseDelayMs * 2^attempt, maxDelayMs) * random(1-jitter, 1+jitter)
 *
 * @internal Exported for testing only.
 */
export function computeDelay(
  config: RetryConfig,
  attempt: number,
  random: () => number = Math.random,
): number {
  const exponential = config.baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, config.maxDelayMs);

  if (config.jitterFactor === 0) return capped;

  const low = 1 - config.jitterFactor;
  const high = 1 + config.jitterFactor;
  const jitter = low + random() * (high - low);
  return Math.round(capped * jitter);
}

/** Default isRetryable: always retry. */
const ALWAYS_RETRY: IsRetryable = () => true;

/**
 * Execute `fn` with retry, exponential backoff, and jitter.
 *
 * @param fn - The async operation to attempt.
 * @param config - Partial retry configuration (merged with defaults).
 * @param isRetryable - Predicate to check if the error should be retried.
 *   Defaults to retrying all errors.
 * @param sleepFn - Injectable sleep for testing. Defaults to setTimeout-based.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>,
  isRetryable: IsRetryable = ALWAYS_RETRY,
  sleepFn?: (ms: number) => Promise<void>,
): Promise<T> {
  const resolved: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const sleep = sleepFn ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 0; attempt <= resolved.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === resolved.maxRetries) break;
      if (!isRetryable(error)) break;

      const delay = computeDelay(resolved, attempt);
      await sleep(delay);
    }
  }

  throw lastError;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
