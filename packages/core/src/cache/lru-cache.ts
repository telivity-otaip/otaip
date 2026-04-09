/**
 * LRUCacheAdapter — In-memory LRU cache using Map insertion order.
 *
 * - On get: delete + re-insert to move entry to end (most recently used).
 * - On set: if at maxEntries, delete first (oldest) entry.
 * - TTL is checked on get; expired entries return null and are removed.
 */

import type { CacheAdapter, CacheConfig } from './types.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LRUCacheAdapter implements CacheAdapter {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor(config: CacheConfig) {
    this.maxEntries = config.maxEntries;
    this.defaultTtlMs = config.defaultTtlMs;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Check TTL expiration
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.store.delete(key);
    this.store.set(key, entry);

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    // If key already exists, remove it first so re-insert goes to end
    if (this.store.has(key)) {
      this.store.delete(key);
    }

    // Evict oldest if at capacity
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    const effectiveTtl = ttlMs > 0 ? ttlMs : this.defaultTtlMs;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + effectiveTtl,
    });
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  async invalidate(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async invalidatePrefix(prefix: string): Promise<number> {
    let count = 0;
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}
