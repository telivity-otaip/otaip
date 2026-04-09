/**
 * Model-accurate token counter using js-tiktoken.
 *
 * Lazy-loads the tokenizer on first use to avoid slowing down agents
 * that don't use context budgets. Falls back to CharTokenCounter
 * if js-tiktoken is not installed.
 */

import type { TokenCounter } from './types.js';

export type TiktokenEncoding = 'cl100k_base' | 'o200k_base' | 'p50k_base' | 'r50k_base';

/**
 * Token counter that uses tiktoken for model-accurate counting.
 *
 * Supports encoding selection for different model families:
 * - `cl100k_base`: GPT-4, GPT-3.5-turbo, text-embedding-ada-002
 * - `o200k_base`: GPT-4o, GPT-4o-mini
 * - `p50k_base`: Codex, text-davinci-002/003
 * - `r50k_base`: GPT-3 (davinci, curie, babbage, ada)
 *
 * For Claude models, `cl100k_base` provides a reasonable approximation.
 */
export class TiktokenCounter implements TokenCounter {
  private encoder: { encode: (text: string) => number[] } | null = null;
  private loadFailed = false;
  private readonly encoding: TiktokenEncoding;

  constructor(encoding: TiktokenEncoding = 'cl100k_base') {
    this.encoding = encoding;
  }

  count(text: string): number {
    if (this.loadFailed) {
      return Math.ceil(text.length / 4);
    }

    if (!this.encoder) {
      try {
        // Dynamic import would be ideal but we need sync access.
        // js-tiktoken provides a sync API via require/import.
        const tiktoken = require('js-tiktoken') as {
          getEncoding: (encoding: string) => { encode: (text: string) => number[] };
        };
        this.encoder = tiktoken.getEncoding(this.encoding);
      } catch {
        this.loadFailed = true;
        return Math.ceil(text.length / 4);
      }
    }

    return this.encoder.encode(text).length;
  }
}
