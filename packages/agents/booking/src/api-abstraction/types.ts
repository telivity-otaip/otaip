/**
 * API Abstraction — Types
 *
 * Agent 3.5: Universal HTTP client with circuit breaker, retry,
 * timeout, rate limiting, and error normalization.
 */

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

export type ProviderType = 'GDS' | 'NDC' | 'PAYMENT' | 'ANCILLARY';

export interface ProviderConfig {
  /** Provider identifier */
  id: string;
  /** Display name */
  name: string;
  /** Provider type */
  type: ProviderType;
  /** Base URL (mock — no real credentials) */
  base_url: string;
  /** Timeout in ms */
  timeout_ms: number;
  /** Max retries */
  max_retries: number;
  /** Rate limit: max requests per window */
  rate_limit_max: number;
  /** Rate limit window in ms */
  rate_limit_window_ms: number;
  /** Circuit breaker failure threshold */
  circuit_breaker_threshold: number;
  /** Circuit breaker reset timeout in ms */
  circuit_breaker_reset_ms: number;
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStatus {
  /** Current state */
  state: CircuitState;
  /** Consecutive failures */
  failure_count: number;
  /** Threshold for opening */
  threshold: number;
  /** Last failure timestamp (ISO) */
  last_failure_at: string | null;
  /** When the circuit will attempt half-open (ISO) */
  reset_at: string | null;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

export interface RateLimitStatus {
  /** Provider ID */
  provider_id: string;
  /** Requests made in current window */
  request_count: number;
  /** Max allowed */
  max_requests: number;
  /** Window start (ISO) */
  window_start: string;
  /** Whether limit is exceeded */
  exceeded: boolean;
}

// ---------------------------------------------------------------------------
// Request / Response
// ---------------------------------------------------------------------------

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiRequest {
  /** Provider to send request to */
  provider_id: string;
  /** HTTP method */
  method: HttpMethod;
  /** URL path (appended to provider base_url) */
  path: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body */
  body?: unknown;
}

export interface ApiResponse {
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Response body */
  body: unknown;
  /** Provider ID */
  provider_id: string;
  /** Request duration in ms */
  duration_ms: number;
  /** Number of retries attempted */
  retries: number;
}

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

export type ErrorCategory =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'CIRCUIT_OPEN'
  | 'AUTH_FAILURE'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SERVER_ERROR'
  | 'EDIFACT_ERROR'
  | 'SOAP_FAULT'
  | 'NDC_ERROR'
  | 'UNKNOWN';

export interface NormalizedError {
  /** OTAIP error category */
  category: ErrorCategory;
  /** Original error code from provider */
  original_code: string;
  /** Human-readable message */
  message: string;
  /** Provider ID */
  provider_id: string;
  /** Whether this error is retryable */
  retryable: boolean;
  /** Original error details */
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Agent I/O
// ---------------------------------------------------------------------------

export interface ApiAbstractionInput {
  /** The API request to execute */
  request: ApiRequest;
  /** Override retry count for this request */
  max_retries?: number;
  /** Override timeout for this request */
  timeout_ms?: number;
  /** Skip circuit breaker check */
  force?: boolean;
}

export interface ApiAbstractionOutput {
  /** The API response (null if failed) */
  response: ApiResponse | null;
  /** Error if request failed */
  error: NormalizedError | null;
  /** Circuit breaker status after request */
  circuit_breaker: CircuitBreakerStatus;
  /** Rate limit status after request */
  rate_limit: RateLimitStatus;
  /** Whether the request succeeded */
  success: boolean;
}
