/**
 * PersistenceAdapter — injectable key-value store for stateful agents.
 *
 * Default implementation is in-memory (InMemoryPersistenceAdapter).
 * Consumers can inject Redis, PostgreSQL, or any other backend.
 */

export interface PersistenceAdapter {
  /** Retrieve a value by key. Returns null if not found or expired. */
  get<T>(key: string): Promise<T | null>;

  /** Store a value. Optional TTL in milliseconds — after which the key expires. */
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;

  /** Delete a key. Returns true if the key existed. */
  delete(key: string): Promise<boolean>;

  /** Check if a key exists (and is not expired). */
  has(key: string): Promise<boolean>;

  /** List all keys matching a prefix. */
  list(prefix: string): Promise<string[]>;
}
