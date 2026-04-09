/**
 * LRUCacheAdapter — Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LRUCacheAdapter } from '../lru-cache.js';

let cache: LRUCacheAdapter;

beforeEach(() => {
  cache = new LRUCacheAdapter({ maxEntries: 3, defaultTtlMs: 60_000 });
});

describe('get / set / has', () => {
  it('returns null for missing key', async () => {
    expect(await cache.get('missing')).toBeNull();
  });

  it('stores and retrieves a value', async () => {
    await cache.set('key1', { foo: 'bar' }, 5000);
    const result = await cache.get<{ foo: string }>('key1');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('has returns true for existing key', async () => {
    await cache.set('key1', 42, 5000);
    expect(await cache.has('key1')).toBe(true);
  });

  it('has returns false for missing key', async () => {
    expect(await cache.has('nope')).toBe(false);
  });

  it('overwrites existing key', async () => {
    await cache.set('key1', 'old', 5000);
    await cache.set('key1', 'new', 5000);
    expect(await cache.get('key1')).toBe('new');
  });
});

describe('TTL expiration', () => {
  it('returns null for expired entry on get', async () => {
    vi.useFakeTimers();
    try {
      await cache.set('ttl_key', 'value', 100);
      expect(await cache.get('ttl_key')).toBe('value');

      vi.advanceTimersByTime(101);
      expect(await cache.get('ttl_key')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('has returns false for expired entry', async () => {
    vi.useFakeTimers();
    try {
      await cache.set('ttl_key', 'value', 50);
      vi.advanceTimersByTime(51);
      expect(await cache.has('ttl_key')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('LRU eviction at maxEntries', () => {
  it('evicts least recently used entry when full', async () => {
    await cache.set('a', 1, 5000);
    await cache.set('b', 2, 5000);
    await cache.set('c', 3, 5000);

    // Cache is full (maxEntries=3). Adding a 4th evicts 'a' (oldest).
    await cache.set('d', 4, 5000);

    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).toBe(2);
    expect(await cache.get('c')).toBe(3);
    expect(await cache.get('d')).toBe(4);
  });

  it('get refreshes position — evicts correct entry', async () => {
    await cache.set('a', 1, 5000);
    await cache.set('b', 2, 5000);
    await cache.set('c', 3, 5000);

    // Access 'a' to make it most recently used
    await cache.get('a');

    // Now 'b' is the oldest. Adding 'd' should evict 'b'.
    await cache.set('d', 4, 5000);

    expect(await cache.get('a')).toBe(1); // refreshed, should survive
    expect(await cache.get('b')).toBeNull(); // evicted
    expect(await cache.get('c')).toBe(3);
    expect(await cache.get('d')).toBe(4);
  });

  it('overwriting a key does not increase size beyond max', async () => {
    await cache.set('a', 1, 5000);
    await cache.set('b', 2, 5000);
    await cache.set('c', 3, 5000);

    // Overwrite 'b' — should not evict anything
    await cache.set('b', 20, 5000);

    expect(await cache.get('a')).toBe(1);
    expect(await cache.get('b')).toBe(20);
    expect(await cache.get('c')).toBe(3);
  });
});

describe('invalidate', () => {
  it('removes a specific key', async () => {
    await cache.set('key1', 'val', 5000);
    const result = await cache.invalidate('key1');
    expect(result).toBe(true);
    expect(await cache.get('key1')).toBeNull();
  });

  it('returns false for non-existent key', async () => {
    const result = await cache.invalidate('missing');
    expect(result).toBe(false);
  });
});

describe('invalidatePrefix', () => {
  it('removes all keys matching prefix', async () => {
    await cache.set('user:1', 'alice', 5000);
    await cache.set('user:2', 'bob', 5000);
    await cache.set('item:1', 'widget', 5000);

    const count = await cache.invalidatePrefix('user:');
    expect(count).toBe(2);
    expect(await cache.get('user:1')).toBeNull();
    expect(await cache.get('user:2')).toBeNull();
    expect(await cache.get('item:1')).toBe('widget');
  });

  it('returns 0 when no keys match prefix', async () => {
    await cache.set('key1', 'val', 5000);
    const count = await cache.invalidatePrefix('zz:');
    expect(count).toBe(0);
  });
});

describe('clear', () => {
  it('removes all entries', async () => {
    await cache.set('a', 1, 5000);
    await cache.set('b', 2, 5000);
    await cache.clear();
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).toBeNull();
  });
});
