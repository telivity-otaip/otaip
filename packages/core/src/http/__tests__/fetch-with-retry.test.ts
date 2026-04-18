import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithRetry } from '../fetch-with-retry.js';

const originalFetch = globalThis.fetch;

function mockFetch(impl: typeof fetch): void {
  globalThis.fetch = impl as typeof fetch;
}

function restore(): void {
  globalThis.fetch = originalFetch;
}

describe('fetchWithRetry', () => {
  afterEach(restore);

  it('returns the response on first success', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    mockFetch(fn);

    const res = await fetchWithRetry('https://example.test/');
    expect(res.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx until success', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    mockFetch(fn);

    const res = await fetchWithRetry('https://example.test/', {}, { retry: { baseDelayMs: 1, maxRetries: 3 } });
    expect(res.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on 429', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    mockFetch(fn);

    const res = await fetchWithRetry('https://example.test/', {}, { retry: { baseDelayMs: 1, maxRetries: 2 } });
    expect(res.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry 4xx other than 429', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    mockFetch(fn);

    const res = await fetchWithRetry('https://example.test/', {}, { retry: { baseDelayMs: 1, maxRetries: 3 } });
    expect(res.status).toBe(404);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns the last 5xx after exhausting retries', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('', { status: 502 }));
    mockFetch(fn);

    const res = await fetchWithRetry(
      'https://example.test/',
      {},
      { retry: { baseDelayMs: 1, maxRetries: 2 } },
    );
    expect(res.status).toBe(502);
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('retries on network errors (TypeError)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    mockFetch(fn);

    const res = await fetchWithRetry('https://example.test/', {}, { retry: { baseDelayMs: 1, maxRetries: 2 } });
    expect(res.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('aborts after timeout and counts as a retryable error', async () => {
    let callCount = 0;
    mockFetch((_url, init) => {
      callCount++;
      // Never resolve until aborted.
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const res = await fetchWithRetry(
      'https://example.test/',
      {},
      { timeoutMs: 5, retry: { baseDelayMs: 1, maxRetries: 1 } },
    ).catch((e) => e as Error);

    // After 1 + 1 retries both abort. Final result is a thrown error.
    expect(callCount).toBe(2);
    expect((res as Error).name).toBe('AbortError');
  });

  it('does not retry non-retryable errors (e.g. SyntaxError)', async () => {
    const fn = vi.fn().mockRejectedValue(new SyntaxError('bad'));
    mockFetch(fn);

    await expect(
      fetchWithRetry('https://example.test/', {}, { retry: { baseDelayMs: 1, maxRetries: 3 } }),
    ).rejects.toBeInstanceOf(SyntaxError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
