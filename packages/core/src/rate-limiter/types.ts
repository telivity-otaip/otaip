/**
 * RateLimiter configuration for controlling request throughput.
 */
export interface RateLimiterConfig {
  /** Maximum number of requests allowed within the time window. */
  maxRequests: number;

  /** Time window in milliseconds. */
  windowMs: number;
}
