/**
 * Hardened fetch wrapper: AbortController timeout + retry on 5xx/429/network errors.
 *
 * Use this for all outbound HTTP calls in adapters. It centralizes:
 *   - Per-request timeout (AbortController)
 *   - Retry policy (delegates to withRetry)
 *   - Retryable-error classification (5xx, 429, network/timeout)
 */

import { withRetry } from '../retry/retry.js';
import type { RetryConfig } from '../retry/types.js';

export interface FetchWithRetryOptions {
  /** Timeout per attempt in milliseconds. Default: 30_000. */
  timeoutMs?: number;
  /** Retry configuration overrides (merged with DEFAULT_RETRY_CONFIG). */
  retry?: Partial<RetryConfig>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * A Response is retryable when status is 5xx or 429 (rate limit).
 * 4xx other than 429 is a client error and should not retry.
 */
function isRetryableResponse(response: Response): boolean {
  return response.status >= 500 || response.status === 429;
}

/**
 * Network/timeout/abort errors are retryable. Anything else thrown by fetch
 * (e.g. type errors from invalid args) is a programmer error and not retried.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true;
    if (error.name === 'TimeoutError') return true;
    // node fetch surfaces network failures as TypeError with cause set.
    if (error.name === 'TypeError') return true;
  }
  return false;
}

/**
 * Carries a non-retryable Response back through withRetry. We throw a
 * sentinel error wrapping the response so withRetry can decide whether to
 * retry, then unwrap on success.
 */
class HttpRetryableResponseError extends Error {
  constructor(public readonly response: Response) {
    super(`HTTP ${response.status} ${response.statusText}`);
    this.name = 'HttpRetryableResponseError';
  }
}

/**
 * Fetch with timeout + retry. Returns the Response on success (any 2xx-4xx
 * that we won't retry). Throws on exhaustion or non-retryable failure.
 *
 * Callers still inspect `response.ok` themselves — this wrapper does not
 * convert 4xx into errors, only retries 5xx/429.
 */
export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (isRetryableResponse(response)) {
        throw new HttpRetryableResponseError(response);
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await withRetry(attempt, options.retry, (err) => {
      if (err instanceof HttpRetryableResponseError) return true;
      return isRetryableError(err);
    });
  } catch (err) {
    // Unwrap the sentinel so callers see the underlying Response.
    if (err instanceof HttpRetryableResponseError) return err.response;
    throw err;
  }
}
