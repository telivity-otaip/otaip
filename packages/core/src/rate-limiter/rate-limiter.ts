import type { RateLimiterConfig } from './types.js';

/**
 * Token-bucket rate limiter for controlling external API call throughput.
 *
 * Adapters should wrap their HTTP calls with `await limiter.acquire()`
 * to respect supplier rate limits and avoid throttling.
 */
export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly timestamps: number[] = [];
  private readonly waitQueue: Array<() => void> = [];

  constructor(config: RateLimiterConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
  }

  /**
   * Acquire a rate limit token. Resolves immediately if under limit,
   * otherwise waits until a token becomes available.
   */
  async acquire(): Promise<void> {
    this.pruneExpired();

    if (this.timestamps.length < this.maxRequests) {
      this.timestamps.push(Date.now());
      return;
    }

    // Wait until the oldest request expires
    const oldestTimestamp = this.timestamps[0]!;
    const waitTime = oldestTimestamp + this.windowMs - Date.now();

    if (waitTime <= 0) {
      this.timestamps.shift();
      this.timestamps.push(Date.now());
      return;
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.pruneExpired();
        this.timestamps.push(Date.now());
        resolve();
      }, waitTime);

      // Prevent timer from blocking Node.js shutdown
      if (typeof timer === 'object' && 'unref' in timer) {
        timer.unref();
      }
    });
  }

  /** Number of requests that can be made immediately without waiting. */
  get available(): number {
    this.pruneExpired();
    return Math.max(0, this.maxRequests - this.timestamps.length);
  }

  /** Whether the rate limiter is currently at capacity. */
  get isAtLimit(): boolean {
    this.pruneExpired();
    return this.timestamps.length >= this.maxRequests;
  }

  /** Reset the limiter, clearing all tracked requests. */
  reset(): void {
    this.timestamps.length = 0;
  }

  private pruneExpired(): void {
    const cutoff = Date.now() - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0]! <= cutoff) {
      this.timestamps.shift();
    }
  }
}
