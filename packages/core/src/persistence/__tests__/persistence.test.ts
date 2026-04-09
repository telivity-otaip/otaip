import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryPersistenceAdapter } from '../in-memory-adapter.js';

describe('InMemoryPersistenceAdapter', () => {
  let adapter: InMemoryPersistenceAdapter;

  beforeEach(() => {
    adapter = new InMemoryPersistenceAdapter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves values', async () => {
    await adapter.set('key1', { name: 'test' });
    const result = await adapter.get<{ name: string }>('key1');
    expect(result).toEqual({ name: 'test' });
  });

  it('returns null for missing keys', async () => {
    const result = await adapter.get('nonexistent');
    expect(result).toBeNull();
  });

  it('deletes keys and reports existence', async () => {
    await adapter.set('key1', 'value');
    expect(await adapter.has('key1')).toBe(true);
    expect(await adapter.delete('key1')).toBe(true);
    expect(await adapter.has('key1')).toBe(false);
    expect(await adapter.delete('key1')).toBe(false);
  });

  it('expires entries after TTL', async () => {
    await adapter.set('temp', 'data', 1000);
    expect(await adapter.get('temp')).toBe('data');

    vi.advanceTimersByTime(1001);
    expect(await adapter.get('temp')).toBeNull();
    expect(await adapter.has('temp')).toBe(false);
  });

  it('lists keys by prefix', async () => {
    await adapter.set('user:1', 'alice');
    await adapter.set('user:2', 'bob');
    await adapter.set('order:1', 'pizza');

    const userKeys = await adapter.list('user:');
    expect(userKeys).toEqual(['user:1', 'user:2']);

    const orderKeys = await adapter.list('order:');
    expect(orderKeys).toEqual(['order:1']);
  });

  it('excludes expired keys from list', async () => {
    await adapter.set('cache:a', 'val', 500);
    await adapter.set('cache:b', 'val', 2000);

    vi.advanceTimersByTime(600);
    const keys = await adapter.list('cache:');
    expect(keys).toEqual(['cache:b']);
  });

  it('reports correct size excluding expired entries', async () => {
    await adapter.set('a', 1);
    await adapter.set('b', 2, 500);
    expect(adapter.size).toBe(2);

    vi.advanceTimersByTime(600);
    expect(adapter.size).toBe(1);
  });

  it('clears all entries', async () => {
    await adapter.set('a', 1);
    await adapter.set('b', 2);
    adapter.clear();
    expect(adapter.size).toBe(0);
    expect(await adapter.get('a')).toBeNull();
  });

  it('overwrites existing keys', async () => {
    await adapter.set('key', 'first');
    await adapter.set('key', 'second');
    expect(await adapter.get('key')).toBe('second');
  });

  it('handles various value types', async () => {
    await adapter.set('string', 'hello');
    await adapter.set('number', 42);
    await adapter.set('boolean', true);
    await adapter.set('array', [1, 2, 3]);
    await adapter.set('null', null);

    expect(await adapter.get('string')).toBe('hello');
    expect(await adapter.get('number')).toBe(42);
    expect(await adapter.get('boolean')).toBe(true);
    expect(await adapter.get('array')).toEqual([1, 2, 3]);
    expect(await adapter.get('null')).toBeNull();
  });
});
