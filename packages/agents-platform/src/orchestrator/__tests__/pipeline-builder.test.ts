/**
 * PipelineBuilder — Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OrchestratorAgent } from '../index.js';
import { PipelineBuilder } from '../pipeline-builder.js';
import type { StepExecutor } from '../types.js';

const successExecutor: StepExecutor = async (agentId, input) => {
  return { ...input, [`result_${agentId}`]: `output_from_${agentId}` };
};

const failAtAgent: (failId: string) => StepExecutor = (failId) => async (agentId, input) => {
  if (agentId === failId) throw new Error(`Agent ${agentId} failed.`);
  return { ...input, [`result_${agentId}`]: 'ok' };
};

let agent: OrchestratorAgent;

beforeEach(async () => {
  agent = new OrchestratorAgent(successExecutor);
  await agent.initialize();
});

describe('PipelineBuilder fluent API', () => {
  it('builds a pipeline with sequential steps', () => {
    const pipeline = new PipelineBuilder('my_flow')
      .step('A')
      .step('B')
      .step('C')
      .build();

    expect(pipeline.name).toBe('my_flow');
    expect(pipeline.steps).toHaveLength(3);
  });

  it('builds a pipeline with parallel steps', () => {
    const pipeline = new PipelineBuilder('parallel_flow')
      .step('A')
      .parallel('B', 'C')
      .step('D')
      .build();

    expect(pipeline.steps).toHaveLength(3);
    const parallelEntry = pipeline.steps[1]!;
    expect('parallel' in parallelEntry).toBe(true);
    if ('parallel' in parallelEntry) {
      expect(parallelEntry.parallel).toHaveLength(2);
    }
  });

  it('supports condition and onError options', () => {
    const cond = (_input: Record<string, unknown>) => true;
    const pipeline = new PipelineBuilder('opts_flow')
      .step('A', { condition: cond, onError: 'skip' })
      .build();

    const step = pipeline.steps[0]!;
    expect('agent_id' in step).toBe(true);
    if ('agent_id' in step) {
      expect(step.condition).toBe(cond);
      expect(step.onError).toBe('skip');
    }
  });

  it('build returns a copy of steps (immutable)', () => {
    const builder = new PipelineBuilder('copy_flow').step('A');
    const p1 = builder.build();
    builder.step('B');
    const p2 = builder.build();
    expect(p1.steps).toHaveLength(1);
    expect(p2.steps).toHaveLength(2);
  });
});

describe('Custom pipeline registration and execution', () => {
  it('executes a registered custom pipeline', async () => {
    const pipeline = new PipelineBuilder('custom')
      .step('X')
      .step('Y')
      .build();

    agent.registerPipeline(pipeline);

    const res = await agent.execute({ data: { workflow: 'custom', input: { foo: 1 } } });
    expect(res.data.status).toBe('completed');
    expect(res.data.steps).toHaveLength(2);
    expect(res.data.steps[0]!.agent_id).toBe('X');
    expect(res.data.steps[1]!.agent_id).toBe('Y');
  });

  it('custom pipeline takes priority over built-in', async () => {
    // Register a custom pipeline with a built-in name
    const pipeline = new PipelineBuilder('exchange_flow')
      .step('CUSTOM_AGENT')
      .build();

    agent.registerPipeline(pipeline);

    const res = await agent.execute({
      data: { workflow: 'exchange_flow', input: {} },
    });
    expect(res.data.steps).toHaveLength(1);
    expect(res.data.steps[0]!.agent_id).toBe('CUSTOM_AGENT');
  });

  it('rejects unknown workflow when no custom pipeline matches', async () => {
    await expect(
      agent.execute({ data: { workflow: 'nonexistent', input: {} } }),
    ).rejects.toThrow('UNKNOWN_WORKFLOW');
  });
});

describe('Conditional step skipping', () => {
  it('skips steps when condition returns false', async () => {
    const pipeline = new PipelineBuilder('cond_flow')
      .step('A')
      .step('B', { condition: () => false })
      .step('C')
      .build();

    agent.registerPipeline(pipeline);

    const res = await agent.execute({ data: { workflow: 'cond_flow', input: {} } });
    expect(res.data.status).toBe('completed');
    expect(res.data.steps).toHaveLength(3);
    expect(res.data.steps[1]!.status).toBe('skipped');
    expect(res.data.steps[2]!.status).toBe('completed');
  });

  it('executes steps when condition returns true', async () => {
    const pipeline = new PipelineBuilder('cond_true')
      .step('A', { condition: () => true })
      .build();

    agent.registerPipeline(pipeline);

    const res = await agent.execute({ data: { workflow: 'cond_true', input: {} } });
    expect(res.data.steps[0]!.status).toBe('completed');
  });

  it('condition receives current pipeline input', async () => {
    const pipeline = new PipelineBuilder('cond_input')
      .step('A')
      .step('B', {
        condition: (input: Record<string, unknown>) => input['result_A'] === 'output_from_A',
      })
      .build();

    agent.registerPipeline(pipeline);

    const res = await agent.execute({ data: { workflow: 'cond_input', input: {} } });
    expect(res.data.steps[1]!.status).toBe('completed');
  });
});

describe('Parallel step execution', () => {
  it('executes parallel steps and collects results', async () => {
    const pipeline = new PipelineBuilder('par_flow')
      .parallel('P1', 'P2', 'P3')
      .build();

    agent.registerPipeline(pipeline);

    const res = await agent.execute({ data: { workflow: 'par_flow', input: {} } });
    expect(res.data.status).toBe('completed');
    expect(res.data.steps).toHaveLength(3);
    expect(res.data.steps.every((s) => s.status === 'completed')).toBe(true);
  });

  it('parallel steps run concurrently', async () => {
    const callOrder: string[] = [];
    const trackingExecutor: StepExecutor = async (agentId, input) => {
      callOrder.push(`start_${agentId}`);
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push(`end_${agentId}`);
      return { ...input, [`result_${agentId}`]: 'ok' };
    };

    agent.setExecutor(trackingExecutor);

    const pipeline = new PipelineBuilder('par_concurrent')
      .parallel('P1', 'P2')
      .build();

    agent.registerPipeline(pipeline);

    await agent.execute({ data: { workflow: 'par_concurrent', input: {} } });
    // Both should start before either ends (concurrent execution)
    expect(callOrder.indexOf('start_P1')).toBeLessThan(callOrder.indexOf('end_P2'));
    expect(callOrder.indexOf('start_P2')).toBeLessThan(callOrder.indexOf('end_P1'));
  });
});

describe('Per-step onError override', () => {
  it('onError=skip continues execution after failure', async () => {
    agent.setExecutor(failAtAgent('B'));

    const pipeline = new PipelineBuilder('err_skip')
      .step('A')
      .step('B', { onError: 'skip' })
      .step('C')
      .build();

    agent.registerPipeline(pipeline);

    const res = await agent.execute({ data: { workflow: 'err_skip', input: {} } });
    expect(res.data.status).toBe('partial');
    expect(res.data.steps[1]!.status).toBe('failed');
    expect(res.data.steps[2]!.status).toBe('completed');
  });

  it('onError=continue continues execution after failure', async () => {
    agent.setExecutor(failAtAgent('B'));

    const pipeline = new PipelineBuilder('err_continue')
      .step('A')
      .step('B', { onError: 'continue' })
      .step('C')
      .build();

    agent.registerPipeline(pipeline);

    const res = await agent.execute({ data: { workflow: 'err_continue', input: {} } });
    expect(res.data.status).toBe('partial');
    expect(res.data.steps[2]!.status).toBe('completed');
  });

  it('onError=stop halts the pipeline', async () => {
    agent.setExecutor(failAtAgent('B'));

    const pipeline = new PipelineBuilder('err_stop')
      .step('A')
      .step('B', { onError: 'stop' })
      .step('C')
      .build();

    agent.registerPipeline(pipeline);

    const res = await agent.execute({ data: { workflow: 'err_stop', input: {} } });
    expect(res.data.status).toBe('failed');
    expect(res.data.steps).toHaveLength(2); // A completed, B failed, C never reached
  });

  it('defaults to stop_on_error option when no per-step onError', async () => {
    agent.setExecutor(failAtAgent('B'));

    const pipeline = new PipelineBuilder('err_default')
      .step('A')
      .step('B')
      .step('C')
      .build();

    agent.registerPipeline(pipeline);

    // stop_on_error defaults to true
    const res = await agent.execute({ data: { workflow: 'err_default', input: {} } });
    expect(res.data.status).toBe('failed');
    expect(res.data.steps).toHaveLength(2);
  });
});
