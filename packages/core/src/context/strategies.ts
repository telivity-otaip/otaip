/**
 * Built-in compaction strategies for the context budget manager.
 */

import type { CompactionStrategy, ContextEntry, TokenCounter } from './types.js';

/**
 * Drops the oldest entries first until the total is within budget.
 */
export class TruncateOldestStrategy implements CompactionStrategy {
  readonly name = 'truncate-oldest';

  compact(entries: ContextEntry[], targetTokens: number): ContextEntry[] {
    let total = entries.reduce((sum, e) => sum + e.tokens, 0);
    const result = [...entries];

    while (result.length > 0 && total > targetTokens) {
      const removed = result.shift()!;
      total -= removed.tokens;
    }

    return result;
  }
}

/**
 * Replaces entries whose token count exceeds a threshold with a
 * truncated summary ("[truncated: <first N chars>...]").
 */
export class DropLargeToolOutputsStrategy implements CompactionStrategy {
  readonly name = 'drop-large-tool-outputs';

  constructor(
    private readonly maxEntryTokens: number,
    private readonly tokenCounter: TokenCounter,
  ) {}

  compact(entries: ContextEntry[], _targetTokens: number): ContextEntry[] {
    return entries.map((entry) => {
      if (entry.tokens <= this.maxEntryTokens) return entry;

      const preview = entry.content.slice(0, 200);
      const summary = `[truncated: ${preview}...]`;
      return {
        ...entry,
        content: summary,
        tokens: this.tokenCounter.count(summary),
      };
    });
  }
}
