/**
 * Retry engine types.
 */

export interface RetryConfig {
  /** Maximum number of retry attempts (0 = no retries, just the initial call). */
  maxRetries: number;
  /** Base delay in milliseconds before the first retry. */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds. */
  maxDelayMs: number;
  /**
   * Jitter multiplier range. The computed delay is multiplied by a random
   * value in [1 - jitterFactor, 1 + jitterFactor]. Set to 0 to disable jitter.
   * @default 0.5
   */
  jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: Readonly<RetryConfig> = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  jitterFactor: 0.5,
};

/** Predicate that determines whether an error is retryable. */
export type IsRetryable = (error: unknown) => boolean;
