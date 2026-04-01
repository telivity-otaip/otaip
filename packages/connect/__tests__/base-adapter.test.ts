import { describe, it, expect, vi } from 'vitest';
import { BaseAdapter, ConnectError } from '../src/base-adapter.js';

class TestAdapter extends BaseAdapter {
  protected readonly supplierId = 'test';

  async runWithRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    return this.withRetry(operation, fn);
  }

  runWrapError(operation: string, error: unknown, retryable?: boolean): ConnectError {
    return this.wrapError(operation, error, retryable);
  }

  async runFetchWithTimeout(url: string, init: RequestInit, timeoutMs?: number): Promise<Response> {
    return this.fetchWithTimeout(url, init, timeoutMs);
  }
}

describe('ConnectError', () => {
  it('stores supplier and operation context', () => {
    const err = new ConnectError('msg', 'trippro', 'searchFlights', true, new Error('cause'));
    expect(err.message).toBe('msg');
    expect(err.supplier).toBe('trippro');
    expect(err.operation).toBe('searchFlights');
    expect(err.retryable).toBe(true);
    expect(err.cause).toBeInstanceOf(Error);
    expect(err.name).toBe('ConnectError');
  });
});

describe('BaseAdapter.withRetry', () => {
  it('returns result on first success', async () => {
    const adapter = new TestAdapter({ maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 });
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await adapter.runWithRetry('test', fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries on retryable errors', async () => {
    const adapter = new TestAdapter({ maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('ok');

    const result = await adapter.runWithRetry('test', fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries exhausted', async () => {
    const adapter = new TestAdapter({ maxRetries: 1, baseDelayMs: 1, maxDelayMs: 10 });
    const fn = vi.fn().mockRejectedValue(new Error('network timeout'));

    await expect(adapter.runWithRetry('search', fn)).rejects.toThrow(
      'search failed after 2 attempts',
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable errors', async () => {
    const adapter = new TestAdapter({ maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 });
    const fn = vi.fn().mockRejectedValue(new Error('invalid input'));

    await expect(adapter.runWithRetry('book', fn)).rejects.toThrow(
      'book failed after 4 attempts',
    );
    // Non-retryable breaks immediately
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('BaseAdapter.wrapError', () => {
  it('wraps a plain Error', () => {
    const adapter = new TestAdapter();
    const err = adapter.runWrapError('search', new Error('bad'), true);
    expect(err).toBeInstanceOf(ConnectError);
    expect(err.message).toBe('search: bad');
    expect(err.retryable).toBe(true);
  });

  it('passes through existing ConnectError', () => {
    const adapter = new TestAdapter();
    const original = new ConnectError('orig', 'test', 'op', false);
    const err = adapter.runWrapError('search', original);
    expect(err).toBe(original);
  });

  it('wraps non-Error values', () => {
    const adapter = new TestAdapter();
    const err = adapter.runWrapError('search', 'string error');
    expect(err.message).toBe('search: string error');
  });
});
