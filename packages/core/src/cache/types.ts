/**
 * Cache — Types
 */

export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  has(key: string): Promise<boolean>;
  invalidate(key: string): Promise<boolean>;
  invalidatePrefix(prefix: string): Promise<number>;
  clear(): Promise<void>;
}

export interface CacheConfig {
  maxEntries: number;
  defaultTtlMs: number;
}
