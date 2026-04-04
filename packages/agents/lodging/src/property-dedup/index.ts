/**
 * Agent 20.2 — Property Deduplication Agent
 *
 * Takes raw multi-source hotel results from Agent 20.1 and identifies duplicate
 * properties, merging them into canonical property records with the best content
 * from each source.
 *
 * 40-60% of multi-source city search results are duplicates.
 * This is THE biggest content quality problem in hotel distribution.
 *
 * Downstream: Feeds Agent 20.3 (Content Normalization) and Agent 20.4 (Rate Comparison)
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  AgentHealthStatus,
} from '@otaip/core';
import {
  AgentNotInitializedError,
  AgentInputValidationError,
} from '@otaip/core';
import type { DedupInput, DedupOutput } from './types.js';
import { runDeduplicationPipeline } from './deduplication-pipeline.js';

export class PropertyDeduplicationAgent
  implements Agent<DedupInput, DedupOutput>
{
  readonly id = '20.2';
  readonly name = 'Property Deduplication';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<DedupInput>,
  ): Promise<AgentOutput<DedupOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = runDeduplicationPipeline(
      input.data.properties,
      input.data.thresholds,
    );

    const warnings: string[] = [];
    if (result.stats.reviewFlagged > 0) {
      warnings.push(`${result.stats.reviewFlagged} property merge(s) flagged for human review`);
    }

    const dedupRate = result.stats.inputCount > 0
      ? ((result.stats.inputCount - result.stats.outputCount) / result.stats.inputCount * 100).toFixed(1)
      : '0';

    return {
      data: result,
      confidence: result.canonical.length > 0
        ? result.canonical.reduce((sum, p) => sum + p.mergeConfidence, 0) / result.canonical.length
        : 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        dedup_rate_percent: dedupRate,
        input_count: result.stats.inputCount,
        output_count: result.stats.outputCount,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
  }

  private validateInput(data: DedupInput): void {
    if (!data.properties) {
      throw new AgentInputValidationError(this.id, 'properties', 'Properties array is required');
    }
    if (!Array.isArray(data.properties)) {
      throw new AgentInputValidationError(this.id, 'properties', 'Properties must be an array');
    }
    if (data.thresholds) {
      if (data.thresholds.autoMerge <= data.thresholds.review) {
        throw new AgentInputValidationError(
          this.id, 'thresholds', 'autoMerge threshold must be greater than review threshold',
        );
      }
    }
  }
}

export type { DedupInput, DedupOutput, MergeDecision, ScoreBreakdown, DedupStats } from './types.js';
