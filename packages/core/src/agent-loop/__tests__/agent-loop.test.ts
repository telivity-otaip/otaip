import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { AgentLoop } from '../loop.js';
import { ToolRegistry } from '../../tool-interface/registry.js';
import type { ToolDefinition } from '../../tool-interface/types.js';
import type { LoopMessage, LoopEvent, ModelCallFn, ToolCall } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeTool(overrides?: Partial<ToolDefinition>): ToolDefinition {
  return {
    name: 'add',
    description: 'Add two numbers',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    outputSchema: z.object({ sum: z.number() }),
    execute: vi.fn().mockImplementation(async (input: { a: number; b: number }) => ({
      sum: input.a + input.b,
    })),
    ...overrides,
  };
}

function toolCall(name: string, input: unknown, id = 'tc-1'): ToolCall {
  return { id, name, input };
}

/** Model that returns a final answer with no tool calls. */
function directAnswerModel(content: string): ModelCallFn {
  return async () => ({ role: 'assistant', content });
}

/**
 * Model that issues tool calls on the first call,
 * then returns a final answer on subsequent calls.
 */
function toolThenAnswerModel(
  toolCalls: ToolCall[],
  finalContent: string,
): ModelCallFn {
  let callCount = 0;
  return async () => {
    callCount++;
    if (callCount === 1) {
      return { role: 'assistant', content: '', toolCalls };
    }
    return { role: 'assistant', content: finalContent };
  };
}

/* ------------------------------------------------------------------ */
/*  Basic loop behavior                                               */
/* ------------------------------------------------------------------ */

describe('AgentLoop', () => {
  it('completes immediately when model returns a direct answer', async () => {
    const registry = new ToolRegistry();
    const loop = new AgentLoop(registry, directAnswerModel('Hello!'));

    const state = await loop.run([{ role: 'user', content: 'Hi' }]);

    expect(state.phase).toBe('complete');
    expect(state.iteration).toBe(1);
    expect(state.messages).toHaveLength(2); // user + assistant
    expect(state.messages[1]!.content).toBe('Hello!');
  });

  it('executes a tool call and returns final answer', async () => {
    const registry = new ToolRegistry();
    const tool = makeTool();
    registry.register(tool);

    const model = toolThenAnswerModel(
      [toolCall('add', { a: 2, b: 3 })],
      'The sum is 5',
    );
    const loop = new AgentLoop(registry, model);

    const state = await loop.run([{ role: 'user', content: 'What is 2+3?' }]);

    expect(state.phase).toBe('complete');
    expect(state.iteration).toBe(2); // tool call iteration + final answer
    expect(tool.execute).toHaveBeenCalledWith({ a: 2, b: 3 });

    // Should have: user, assistant(tool_call), tool_result, assistant(final)
    expect(state.messages).toHaveLength(4);
    expect(state.messages[2]!.role).toBe('tool_result');
    expect(state.messages[3]!.content).toBe('The sum is 5');
  });

  /* ---------------------------------------------------------------- */
  /*  Input validation                                                */
  /* ---------------------------------------------------------------- */

  it('returns error tool result for invalid input', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool());

    const model = toolThenAnswerModel(
      [toolCall('add', { a: 'not-a-number', b: 3 })],
      'Error handled',
    );
    const loop = new AgentLoop(registry, model);

    const state = await loop.run([{ role: 'user', content: 'bad input' }]);

    expect(state.phase).toBe('complete');
    // The tool_result message should contain validation error
    const toolResultMsg = state.messages.find((m) => m.role === 'tool_result');
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg!.toolResults![0]!.isError).toBe(true);
    expect(String(toolResultMsg!.toolResults![0]!.output)).toMatch(/Invalid input/);
  });

  /* ---------------------------------------------------------------- */
  /*  Output validation                                               */
  /* ---------------------------------------------------------------- */

  it('returns error tool result for invalid output', async () => {
    const registry = new ToolRegistry();
    registry.register(
      makeTool({
        execute: vi.fn().mockResolvedValue({ sum: 'not-a-number' }),
      }),
    );

    const model = toolThenAnswerModel(
      [toolCall('add', { a: 1, b: 2 })],
      'Done',
    );
    const loop = new AgentLoop(registry, model);

    const state = await loop.run([{ role: 'user', content: 'test' }]);

    const toolResultMsg = state.messages.find((m) => m.role === 'tool_result');
    expect(toolResultMsg!.toolResults![0]!.isError).toBe(true);
    expect(String(toolResultMsg!.toolResults![0]!.output)).toMatch(/Invalid tool output/);
  });

  /* ---------------------------------------------------------------- */
  /*  Unknown / disabled tool                                         */
  /* ---------------------------------------------------------------- */

  it('returns error for unknown tool', async () => {
    const registry = new ToolRegistry();
    const model = toolThenAnswerModel(
      [toolCall('nonexistent', {})],
      'Handled',
    );
    const loop = new AgentLoop(registry, model);

    const state = await loop.run([{ role: 'user', content: 'test' }]);

    const toolResultMsg = state.messages.find((m) => m.role === 'tool_result');
    expect(toolResultMsg!.toolResults![0]!.isError).toBe(true);
    expect(String(toolResultMsg!.toolResults![0]!.output)).toMatch(/not found/);
  });

  it('returns error for disabled tool', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool({ isEnabled: () => false }));

    const model = toolThenAnswerModel(
      [toolCall('add', { a: 1, b: 2 })],
      'Handled',
    );
    const loop = new AgentLoop(registry, model);

    const state = await loop.run([{ role: 'user', content: 'test' }]);

    const toolResultMsg = state.messages.find((m) => m.role === 'tool_result');
    expect(toolResultMsg!.toolResults![0]!.isError).toBe(true);
    expect(String(toolResultMsg!.toolResults![0]!.output)).toMatch(/not found or not enabled/);
  });

  /* ---------------------------------------------------------------- */
  /*  Tool execution error                                            */
  /* ---------------------------------------------------------------- */

  it('catches tool execution errors and returns error result', async () => {
    const registry = new ToolRegistry();
    registry.register(
      makeTool({
        execute: vi.fn().mockRejectedValue(new Error('kaboom')),
      }),
    );

    const model = toolThenAnswerModel(
      [toolCall('add', { a: 1, b: 2 })],
      'Done',
    );
    const loop = new AgentLoop(registry, model);

    const state = await loop.run([{ role: 'user', content: 'test' }]);

    const toolResultMsg = state.messages.find((m) => m.role === 'tool_result');
    expect(toolResultMsg!.toolResults![0]!.isError).toBe(true);
    expect(toolResultMsg!.toolResults![0]!.output).toBe('kaboom');
  });

  /* ---------------------------------------------------------------- */
  /*  Multiple tool calls in one response                             */
  /* ---------------------------------------------------------------- */

  it('handles multiple tool calls in a single response', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool());

    const model = toolThenAnswerModel(
      [
        toolCall('add', { a: 1, b: 2 }, 'tc-1'),
        toolCall('add', { a: 3, b: 4 }, 'tc-2'),
      ],
      'Done',
    );
    const loop = new AgentLoop(registry, model);

    const state = await loop.run([{ role: 'user', content: 'test' }]);

    const toolResultMsg = state.messages.find((m) => m.role === 'tool_result');
    expect(toolResultMsg!.toolResults).toHaveLength(2);
    expect(toolResultMsg!.toolResults![0]!.output).toEqual({ sum: 3 });
    expect(toolResultMsg!.toolResults![1]!.output).toEqual({ sum: 7 });
  });

  /* ---------------------------------------------------------------- */
  /*  Max iterations                                                  */
  /* ---------------------------------------------------------------- */

  it('stops at maxIterations', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool());

    // Model always requests tool calls — will loop forever
    let callCount = 0;
    const infiniteModel: ModelCallFn = async () => {
      callCount++;
      return { role: 'assistant', content: '', toolCalls: [toolCall('add', { a: 1, b: 1 }, `tc-${callCount}`)] };
    };

    const loop = new AgentLoop(registry, infiniteModel, { maxIterations: 3 });
    const state = await loop.run([{ role: 'user', content: 'loop forever' }]);

    expect(state.phase).toBe('error');
    expect(state.iteration).toBeLessThanOrEqual(3);
  });

  /* ---------------------------------------------------------------- */
  /*  Custom stop condition                                           */
  /* ---------------------------------------------------------------- */

  it('respects custom stop conditions', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool());

    let callCount = 0;
    const model: ModelCallFn = async () => {
      callCount++;
      return { role: 'assistant', content: '', toolCalls: [toolCall('add', { a: 1, b: 1 }, `tc-${callCount}`)] };
    };

    const stopAfter2: (state: { iteration: number }) => boolean = (s) => s.iteration >= 2;
    const loop = new AgentLoop(registry, model, {
      maxIterations: 100,
      stopConditions: [stopAfter2],
    });

    const state = await loop.run([{ role: 'user', content: 'test' }]);
    expect(state.phase).toBe('complete');
    expect(state.iteration).toBe(2);
  });

  /* ---------------------------------------------------------------- */
  /*  Model call error                                                */
  /* ---------------------------------------------------------------- */

  it('enters error phase when model call throws', async () => {
    const registry = new ToolRegistry();
    const model: ModelCallFn = async () => {
      throw new Error('model unavailable');
    };

    const loop = new AgentLoop(registry, model);
    const state = await loop.run([{ role: 'user', content: 'test' }]);

    expect(state.phase).toBe('error');
  });

  /* ---------------------------------------------------------------- */
  /*  Event emission                                                  */
  /* ---------------------------------------------------------------- */

  it('emits structured events', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool());

    const model = toolThenAnswerModel(
      [toolCall('add', { a: 1, b: 2 })],
      'Done',
    );

    const events: LoopEvent[] = [];
    const loop = new AgentLoop(registry, model, {
      maxIterations: 25,
      stopConditions: [],
      onEvent: (e) => events.push(e),
    });

    await loop.run([{ role: 'user', content: 'test' }]);

    const types = events.map((e) => e.type);
    expect(types).toContain('loop_start');
    expect(types).toContain('before_tool_call');
    expect(types).toContain('after_tool_call');
    expect(types).toContain('loop_end');
  });

  /* ---------------------------------------------------------------- */
  /*  State machine transitions                                       */
  /* ---------------------------------------------------------------- */

  it('transitions through correct phases: running → tool_call → tool_result → complete', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool());

    const model = toolThenAnswerModel(
      [toolCall('add', { a: 1, b: 2 })],
      'Done',
    );

    const phases: string[] = [];
    const loop = new AgentLoop(registry, model, {
      maxIterations: 25,
      stopConditions: [],
      onEvent: (e) => phases.push(e.state.phase),
    });

    await loop.run([{ role: 'user', content: 'test' }]);

    // loop_start(running), before_tool_call(tool_call), after_tool_call(tool_call),
    // loop_end(complete)
    expect(phases[0]).toBe('running');
    expect(phases).toContain('tool_call');
    expect(phases[phases.length - 1]).toBe('complete');
  });
});
