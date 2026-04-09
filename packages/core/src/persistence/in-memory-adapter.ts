import type { PersistenceAdapter } from './types.js';

interface StoredEntry<T> {
  value: T;
  expiresAt: number | null;
}

/**
 * InMemoryPersistenceAdapter — default Map-backed persistence.
 *
 * Suitable for single-process usage and testing.
 * For production with multiple instances, inject a Redis/PostgreSQL adapter.
 */
export class InMemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly store = new Map<string, StoredEntry<unknown>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const expiresAt = ttlMs !== undefined ? Date.now() + ttlMs : null;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async list(prefix: string): Promise<string[]> {
    const now = Date.now();
    const keys: string[] = [];
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.store.delete(key);
        continue;
      }
      if (key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }

  /** Number of non-expired entries. Useful for testing. */
  get size(): number {
    this.pruneExpired();
    return this.store.size;
  }

  /** Remove all entries. */
  clear(): void {
    this.store.clear();
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}
