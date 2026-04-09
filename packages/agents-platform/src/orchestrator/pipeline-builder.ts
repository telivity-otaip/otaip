/**
 * PipelineBuilder — Fluent API for user-defined orchestration pipelines.
 */

import type { PipelineDefinition, PipelineEntry, PipelineStep } from './types.js';

export class PipelineBuilder {
  private readonly pipelineName: string;
  private readonly pipelineSteps: PipelineEntry[] = [];

  constructor(name: string) {
    this.pipelineName = name;
  }

  step(
    agentId: string,
    options?: {
      condition?: (input: Record<string, unknown>) => boolean;
      onError?: 'stop' | 'skip' | 'continue';
    },
  ): this {
    const entry: PipelineStep = { agent_id: agentId };
    if (options?.condition) entry.condition = options.condition;
    if (options?.onError) entry.onError = options.onError;
    this.pipelineSteps.push(entry);
    return this;
  }

  parallel(...agentIds: string[]): this {
    const parallelSteps: PipelineStep[] = agentIds.map((id) => ({ agent_id: id }));
    this.pipelineSteps.push({ parallel: parallelSteps });
    return this;
  }

  build(): PipelineDefinition {
    return {
      name: this.pipelineName,
      steps: [...this.pipelineSteps],
    };
  }
}
