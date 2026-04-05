/**
 * Token-aware context management with pluggable compaction strategies.
 */

import type {
  ContextEntry,
  ContextBudgetConfig,
  CompactionStrategy,
  TokenCounter,
} from './types.js';

/** Simple character-based token estimator (~4 chars per token). */
export class CharTokenCounter implements TokenCounter {
  count(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

const DEFAULT_CONFIG: Omit<ContextBudgetConfig, 'tokenCounter'> = {
  maxTokens: 200_000,
  compactThreshold: 0.9,
  hotTailSize: 5,
};

export class ContextBudgetManager {
  private readonly entries: ContextEntry[] = [];
  private readonly strategies: CompactionStrategy[] = [];
  private readonly config: ContextBudgetConfig;
  private totalTokens = 0;

  constructor(config?: Partial<ContextBudgetConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      tokenCounter: config?.tokenCounter ?? new CharTokenCounter(),
      ...config,
    };
  }

  /** Add an entry to the context window. */
  add(id: string, role: string, content: string): ContextEntry {
    const tokens = this.config.tokenCounter.count(content);
    const entry: ContextEntry = {
      id,
      role,
      content,
      tokens,
      createdAt: Date.now(),
    };
    this.entries.push(entry);
    this.totalTokens += tokens;
    return entry;
  }

  /** Register a compaction strategy (applied in registration order). */
  addStrategy(strategy: CompactionStrategy): void {
    this.strategies.push(strategy);
  }

  /** Whether the context usage exceeds the compaction threshold. */
  shouldCompact(): boolean {
    return this.totalTokens >= this.config.maxTokens * this.config.compactThreshold;
  }

  /**
   * Run compaction strategies in order until under budget.
   * The hot tail (most recent N entries) is never compacted.
   * Returns the number of tokens freed.
   */
  compact(): number {
    const before = this.totalTokens;
    const threshold = this.config.maxTokens * this.config.compactThreshold;

    if (this.totalTokens < threshold) return 0;

    const tailStart = Math.max(0, this.entries.length - this.config.hotTailSize);
    const hotTail = this.entries.slice(tailStart);
    let compactable = this.entries.slice(0, tailStart);
    const hotTailTokens = hotTail.reduce((sum, e) => sum + e.tokens, 0);

    for (const strategy of this.strategies) {
      const targetTokens = threshold - hotTailTokens;
      compactable = strategy.compact(compactable, targetTokens);

      const compactableTokens = compactable.reduce((sum, e) => sum + e.tokens, 0);
      if (compactableTokens + hotTailTokens < threshold) break;
    }

    this.entries.length = 0;
    this.entries.push(...compactable, ...hotTail);
    this.totalTokens = this.entries.reduce((sum, e) => sum + e.tokens, 0);

    return before - this.totalTokens;
  }

  /** Current total token usage. */
  get usage(): number {
    return this.totalTokens;
  }

  /** Maximum token budget. */
  get budget(): number {
    return this.config.maxTokens;
  }

  /** Usage as a fraction of budget (0-1+). */
  get usageRatio(): number {
    return this.totalTokens / this.config.maxTokens;
  }

  /** Number of entries in the context. */
  get size(): number {
    return this.entries.length;
  }

  /** Get a snapshot of all current entries. */
  getEntries(): readonly ContextEntry[] {
    return [...this.entries];
  }

  /** Remove all entries and reset token count. */
  clear(): void {
    this.entries.length = 0;
    this.totalTokens = 0;
  }
}
