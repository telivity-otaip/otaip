import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { withRetry, computeDelay } from '../retry.js';
import { DEFAULT_RETRY_CONFIG } from '../types.js';
import type { RetryConfig } from '../types.js';

type SleepFn = (ms: number) => Promise<void>;

/* ------------------------------------------------------------------ */
/*  computeDelay                                                      */
/* ------------------------------------------------------------------ */

describe('computeDelay', () => {
  const config: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 10_000,
    jitterFactor: 0.5,
  };

  it('applies exponential backoff', () => {
    // With random() returning 0.5, jitter multiplier = 1.0 (midpoint)
    const random = () => 0.5;
    expect(computeDelay(config, 0, random)).toBe(500); // 500 * 2^0 * 1.0
    expect(computeDelay(config, 1, random)).toBe(1000); // 500 * 2^1 * 1.0
    expect(computeDelay(config, 2, random)).toBe(2000); // 500 * 2^2 * 1.0
    expect(computeDelay(config, 3, random)).toBe(4000); // 500 * 2^3 * 1.0
  });

  it('caps delay at maxDelayMs', () => {
    const random = () => 0.5; // jitter = 1.0
    // 500 * 2^5 = 16000, capped to 10000
    expect(computeDelay(config, 5, random)).toBe(10_000);
  });

  it('applies jitter in range [0.5, 1.5] with jitterFactor=0.5', () => {
    // random() = 0 → multiplier = 0.5
    expect(computeDelay(config, 0, () => 0)).toBe(250); // 500 * 0.5
    // random() = 1 → multiplier = 1.5
    expect(computeDelay(config, 0, () => 1)).toBe(750); // 500 * 1.5
  });

  it('disables jitter when jitterFactor=0', () => {
    const noJitter = { ...config, jitterFactor: 0 };
    // Should be deterministic regardless of random
    expect(computeDelay(noJitter, 0)).toBe(500);
    expect(computeDelay(noJitter, 1)).toBe(1000);
    expect(computeDelay(noJitter, 2)).toBe(2000);
  });

  it('jitter stays within bounds over many samples', () => {
    for (let i = 0; i < 100; i++) {
      const delay = computeDelay(config, 0); // base = 500, jitter [0.5, 1.5]
      expect(delay).toBeGreaterThanOrEqual(250);
      expect(delay).toBeLessThanOrEqual(750);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  withRetry                                                         */
/* ------------------------------------------------------------------ */

describe('withRetry', () => {
  let noopSleep: Mock<SleepFn>;

  beforeEach(() => {
    noopSleep = vi.fn<SleepFn>().mockResolvedValue(undefined);
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3 }, undefined, noopSleep);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(noopSleep).not.toHaveBeenCalled();
  });

  it('retries on failure and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxRetries: 3 }, undefined, noopSleep);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(noopSleep).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const error = new Error('persistent failure');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, { maxRetries: 2 }, undefined, noopSleep),
    ).rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('stops retrying when isRetryable returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('not retryable'));
    const isRetryable = vi.fn().mockReturnValue(false);

    await expect(
      withRetry(fn, { maxRetries: 3 }, isRetryable, noopSleep),
    ).rejects.toThrow('not retryable');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(noopSleep).not.toHaveBeenCalled();
  });

  it('uses default config when none provided', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const isRetryable = () => true;

    await expect(
      withRetry(fn, undefined, isRetryable, noopSleep),
    ).rejects.toThrow('fail');
    // Default maxRetries is 3 → 4 total calls
    expect(fn).toHaveBeenCalledTimes(DEFAULT_RETRY_CONFIG.maxRetries + 1);
  });

  it('passes sleep durations that respect backoff', async () => {
    const sleepSpy = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(
      withRetry(
        fn,
        { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 5000, jitterFactor: 0 },
        undefined,
        sleepSpy,
      ),
    ).rejects.toThrow();

    // With jitter=0: delays are 100, 200, 400
    expect(sleepSpy).toHaveBeenCalledTimes(3);
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 100);
    expect(sleepSpy).toHaveBeenNthCalledWith(2, 200);
    expect(sleepSpy).toHaveBeenNthCalledWith(3, 400);
  });

  it('maxRetries=0 means no retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('once'));
    await expect(
      withRetry(fn, { maxRetries: 0 }, undefined, noopSleep),
    ).rejects.toThrow('once');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('preserves the original error type', async () => {
    class CustomError extends Error {
      readonly code = 'CUSTOM';
    }
    const fn = vi.fn().mockRejectedValue(new CustomError('custom'));

    try {
      await withRetry(fn, { maxRetries: 0 }, undefined, noopSleep);
    } catch (e) {
      expect(e).toBeInstanceOf(CustomError);
      expect((e as CustomError).code).toBe('CUSTOM');
    }
  });
});
