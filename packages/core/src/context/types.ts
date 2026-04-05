/**
 * Context budget manager types.
 */

/** A single entry in the context window (message, tool output, etc.). */
export interface ContextEntry {
  /** Unique identifier for this entry. */
  readonly id: string;
  /** Role or category (e.g. 'user', 'assistant', 'tool_result'). */
  readonly role: string;
  /** The content of this entry. */
  content: string;
  /** Token count for this entry (set by TokenCounter). */
  tokens: number;
  /** Timestamp when this entry was added. */
  readonly createdAt: number;
}

/** Interface for counting tokens in a string. */
export interface TokenCounter {
  /** Count the number of tokens in the given text. */
  count(text: string): number;
}

/** Configuration for the context budget manager. */
export interface ContextBudgetConfig {
  /** Maximum token budget for the entire context window. */
  maxTokens: number;
  /**
   * Fraction of maxTokens at which compaction triggers (0-1).
   * @default 0.9
   */
  compactThreshold: number;
  /**
   * Number of most recent entries that are never compacted ("hot tail").
   * @default 5
   */
  hotTailSize: number;
  /** Token counter implementation. */
  tokenCounter: TokenCounter;
}

/** A compaction strategy that reduces context size. */
export interface CompactionStrategy {
  /** Human-readable name for logging. */
  readonly name: string;
  /**
   * Apply this strategy to the entries, returning a reduced set.
   * Receives all entries EXCEPT the hot tail (those are protected).
   * Must return entries that fit within the targetTokens budget.
   */
  compact(entries: ContextEntry[], targetTokens: number): ContextEntry[];
}
