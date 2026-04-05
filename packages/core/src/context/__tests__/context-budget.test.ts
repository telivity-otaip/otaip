import { describe, it, expect } from 'vitest';
import { ContextBudgetManager, CharTokenCounter } from '../budget-manager.js';
import { TruncateOldestStrategy, DropLargeToolOutputsStrategy } from '../strategies.js';
import type { TokenCounter } from '../types.js';

/* ------------------------------------------------------------------ */
/*  CharTokenCounter                                                  */
/* ------------------------------------------------------------------ */

describe('CharTokenCounter', () => {
  const counter = new CharTokenCounter();

  it('estimates ~4 chars per token', () => {
    expect(counter.count('abcd')).toBe(1);
    expect(counter.count('abcde')).toBe(2);
    expect(counter.count('')).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Exact token counter for deterministic tests                       */
/* ------------------------------------------------------------------ */

/** 1 char = 1 token for predictable test math. */
const exactCounter: TokenCounter = { count: (text) => text.length };

function makeManager(maxTokens: number, hotTailSize = 5) {
  return new ContextBudgetManager({
    maxTokens,
    compactThreshold: 0.9,
    hotTailSize,
    tokenCounter: exactCounter,
  });
}

/* ------------------------------------------------------------------ */
/*  ContextBudgetManager                                              */
/* ------------------------------------------------------------------ */

describe('ContextBudgetManager', () => {
  it('tracks token usage when entries are added', () => {
    const mgr = makeManager(1000);
    mgr.add('1', 'user', 'hello'); // 5 tokens
    mgr.add('2', 'assistant', 'world'); // 5 tokens
    expect(mgr.usage).toBe(10);
    expect(mgr.size).toBe(2);
    expect(mgr.budget).toBe(1000);
  });

  it('returns entries snapshot', () => {
    const mgr = makeManager(1000);
    mgr.add('1', 'user', 'hello');
    const entries = mgr.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe('1');
    expect(entries[0]!.content).toBe('hello');
    expect(entries[0]!.tokens).toBe(5);
  });

  it('computes usageRatio correctly', () => {
    const mgr = makeManager(100);
    mgr.add('1', 'user', 'a'.repeat(50)); // 50 tokens
    expect(mgr.usageRatio).toBe(0.5);
  });

  it('clears all entries', () => {
    const mgr = makeManager(1000);
    mgr.add('1', 'user', 'hello');
    mgr.clear();
    expect(mgr.usage).toBe(0);
    expect(mgr.size).toBe(0);
  });

  describe('shouldCompact', () => {
    it('returns false below threshold', () => {
      const mgr = makeManager(100);
      mgr.add('1', 'user', 'a'.repeat(89)); // 89% < 90%
      expect(mgr.shouldCompact()).toBe(false);
    });

    it('returns true at threshold', () => {
      const mgr = makeManager(100);
      mgr.add('1', 'user', 'a'.repeat(90)); // 90% = 90%
      expect(mgr.shouldCompact()).toBe(true);
    });

    it('returns true above threshold', () => {
      const mgr = makeManager(100);
      mgr.add('1', 'user', 'a'.repeat(95));
      expect(mgr.shouldCompact()).toBe(true);
    });
  });

  describe('compact with TruncateOldestStrategy', () => {
    it('removes oldest entries to get under budget', () => {
      // 100 max, threshold 90%, hot tail 2 (20 tokens)
      // Need compactable zone to be under 70 tokens (90 - 20)
      const mgr = makeManager(100, 2);
      mgr.addStrategy(new TruncateOldestStrategy());

      // Add 10 entries of 10 tokens each = 100 tokens total (at threshold)
      for (let i = 0; i < 10; i++) {
        mgr.add(String(i), 'user', 'a'.repeat(10));
      }

      expect(mgr.shouldCompact()).toBe(true);
      const freed = mgr.compact();

      expect(freed).toBeGreaterThan(0);
      // After compaction, usage should be under budget
      expect(mgr.usage).toBeLessThan(100);

      // Hot tail (last 2) should always be preserved
      const entries = mgr.getEntries();
      const ids = entries.map((e) => e.id);
      expect(ids).toContain('8');
      expect(ids).toContain('9');
    });

    it('preserves hot tail even if it alone exceeds target', () => {
      const mgr = makeManager(100, 3);
      mgr.addStrategy(new TruncateOldestStrategy());

      // 5 entries of 25 tokens = 125 tokens, hot tail = last 3 = 75 tokens
      for (let i = 0; i < 5; i++) {
        mgr.add(String(i), 'user', 'a'.repeat(25));
      }

      mgr.compact();
      const entries = mgr.getEntries();
      // Hot tail always preserved
      expect(entries.length).toBeGreaterThanOrEqual(3);
      expect(entries[entries.length - 1]!.id).toBe('4');
    });

    it('returns 0 when below threshold', () => {
      const mgr = makeManager(1000, 2);
      mgr.addStrategy(new TruncateOldestStrategy());
      mgr.add('1', 'user', 'hello');
      expect(mgr.compact()).toBe(0);
    });
  });

  describe('compact with DropLargeToolOutputsStrategy', () => {
    it('truncates entries exceeding the size threshold', () => {
      const mgr = makeManager(1000, 1);
      mgr.addStrategy(new DropLargeToolOutputsStrategy(20, exactCounter));

      mgr.add('1', 'tool_result', 'a'.repeat(500)); // 500 tokens, over 20 limit
      mgr.add('2', 'user', 'a'.repeat(10)); // 10 tokens, under limit
      mgr.add('3', 'assistant', 'a'.repeat(500)); // hot tail

      // Total = 1010, threshold = 900
      expect(mgr.shouldCompact()).toBe(true);
      mgr.compact();

      const entries = mgr.getEntries();
      const large = entries.find((e) => e.id === '1');
      expect(large).toBeDefined();
      expect(large!.content).toMatch(/^\[truncated:/);
      // Summary is ~217 chars (prefix + 200 char preview + suffix), much less than 500
      expect(large!.tokens).toBeLessThan(500);

      // Small entry unchanged
      const small = entries.find((e) => e.id === '2');
      expect(small!.content).toBe('a'.repeat(10));
    });
  });

  describe('multiple strategies', () => {
    it('applies strategies in order until under budget', () => {
      const mgr = makeManager(100, 1);
      // First try dropping large outputs, then truncate oldest
      mgr.addStrategy(new DropLargeToolOutputsStrategy(15, exactCounter));
      mgr.addStrategy(new TruncateOldestStrategy());

      mgr.add('1', 'tool_result', 'a'.repeat(40)); // large
      mgr.add('2', 'tool_result', 'a'.repeat(40)); // large
      mgr.add('3', 'user', 'a'.repeat(15)); // normal
      mgr.add('4', 'assistant', 'short'); // hot tail (5 tokens)

      // Total = 100, threshold = 90
      expect(mgr.shouldCompact()).toBe(true);
      mgr.compact();
      expect(mgr.usage).toBeLessThan(90);

      // Hot tail preserved
      const entries = mgr.getEntries();
      expect(entries[entries.length - 1]!.id).toBe('4');
    });
  });

  describe('uses default CharTokenCounter when none provided', () => {
    it('works with default config', () => {
      const mgr = new ContextBudgetManager({ maxTokens: 100 });
      mgr.add('1', 'user', 'abcd'); // ~1 token with char counter
      expect(mgr.usage).toBe(1);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  TruncateOldestStrategy (standalone)                               */
/* ------------------------------------------------------------------ */

describe('TruncateOldestStrategy', () => {
  const strategy = new TruncateOldestStrategy();

  it('has correct name', () => {
    expect(strategy.name).toBe('truncate-oldest');
  });

  it('removes entries from the front', () => {
    const entries = [
      { id: '1', role: 'user', content: 'aaa', tokens: 10, createdAt: 1 },
      { id: '2', role: 'user', content: 'bbb', tokens: 10, createdAt: 2 },
      { id: '3', role: 'user', content: 'ccc', tokens: 10, createdAt: 3 },
    ];
    const result = strategy.compact(entries, 15);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('3');
  });

  it('returns empty if all must be removed', () => {
    const entries = [
      { id: '1', role: 'user', content: 'aaa', tokens: 100, createdAt: 1 },
    ];
    const result = strategy.compact(entries, 0);
    expect(result).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  DropLargeToolOutputsStrategy (standalone)                         */
/* ------------------------------------------------------------------ */

describe('DropLargeToolOutputsStrategy', () => {
  const strategy = new DropLargeToolOutputsStrategy(20, exactCounter);

  it('has correct name', () => {
    expect(strategy.name).toBe('drop-large-tool-outputs');
  });

  it('leaves small entries unchanged', () => {
    const entries = [
      { id: '1', role: 'tool_result', content: 'short', tokens: 5, createdAt: 1 },
    ];
    const result = strategy.compact(entries, 100);
    expect(result[0]!.content).toBe('short');
  });

  it('truncates large entries', () => {
    const entries = [
      { id: '1', role: 'tool_result', content: 'a'.repeat(500), tokens: 500, createdAt: 1 },
    ];
    const result = strategy.compact(entries, 100);
    expect(result[0]!.content).toMatch(/^\[truncated:/);
    expect(result[0]!.tokens).toBeLessThan(500);
  });
});
