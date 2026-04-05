import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { HookRegistry } from '../hook-registry.js';
import { AgentLoop } from '../../agent-loop/loop.js';
import { ToolRegistry } from '../../tool-interface/registry.js';
import type { HookContext, LifecycleEvent } from '../types.js';
import type { ToolDefinition } from '../../tool-interface/types.js';
import type { LoopMessage, ToolCall, ModelCallFn } from '../../agent-loop/types.js';

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

function tc(name: string, input: unknown, id = 'tc-1'): ToolCall {
  return { id, name, input };
}

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
/*  HookRegistry standalone                                           */
/* ------------------------------------------------------------------ */

describe('HookRegistry', () => {
  it('registers and executes handlers in order', async () => {
    const registry = new HookRegistry();
    const order: number[] = [];

    registry.on('afterToolCall', () => { order.push(1); });
    registry.on('afterToolCall', () => { order.push(2); });
    registry.on('afterToolCall', () => { order.push(3); });

    await registry.execute('afterToolCall', { state: { phase: 'tool_call', iteration: 1, messages: [] } });
    expect(order).toEqual([1, 2, 3]);
  });

  it('returns void for non-beforeToolCall events', async () => {
    const registry = new HookRegistry();
    registry.on('onComplete', () => {});
    const result = await registry.execute('onComplete', {
      state: { phase: 'complete', iteration: 1, messages: [] },
    });
    expect(result).toBeUndefined();
  });

  it('returns block result from beforeToolCall', async () => {
    const registry = new HookRegistry();
    registry.on('beforeToolCall', () => ({ block: true, reason: 'denied' }));

    const result = await registry.execute('beforeToolCall', {
      state: { phase: 'tool_call', iteration: 1, messages: [] },
      toolCall: tc('add', { a: 1, b: 2 }),
    });
    expect(result).toEqual({ block: true, reason: 'denied' });
  });

  it('stops at first blocking handler', async () => {
    const registry = new HookRegistry();
    const second = vi.fn();

    registry.on('beforeToolCall', () => ({ block: true, reason: 'first blocks' }));
    registry.on('beforeToolCall', second);

    await registry.execute('beforeToolCall', {
      state: { phase: 'tool_call', iteration: 1, messages: [] },
    });
    expect(second).not.toHaveBeenCalled();
  });

  it('non-blocking beforeToolCall handler passes through', async () => {
    const registry = new HookRegistry();
    registry.on('beforeToolCall', () => {});

    const result = await registry.execute('beforeToolCall', {
      state: { phase: 'tool_call', iteration: 1, messages: [] },
    });
    expect(result).toBeUndefined();
  });

  it('swallows errors in handlers', async () => {
    const registry = new HookRegistry();
    const second = vi.fn();

    registry.on('afterToolCall', () => { throw new Error('boom'); });
    registry.on('afterToolCall', second);

    await registry.execute('afterToolCall', {
      state: { phase: 'tool_call', iteration: 1, messages: [] },
    });
    expect(second).toHaveBeenCalled();
  });

  it('supports async handlers', async () => {
    const registry = new HookRegistry();
    let called = false;

    registry.on('onComplete', async () => {
      await new Promise((r) => setTimeout(r, 1));
      called = true;
    });

    await registry.execute('onComplete', {
      state: { phase: 'complete', iteration: 1, messages: [] },
    });
    expect(called).toBe(true);
  });

  it('unregisters via returned function', async () => {
    const registry = new HookRegistry();
    const handler = vi.fn();
    const off = registry.on('onComplete', handler);

    expect(registry.count('onComplete')).toBe(1);
    off();
    expect(registry.count('onComplete')).toBe(0);

    await registry.execute('onComplete', {
      state: { phase: 'complete', iteration: 1, messages: [] },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('clears all handlers', () => {
    const registry = new HookRegistry();
    registry.on('onComplete', () => {});
    registry.on('onError', () => {});
    registry.on('beforeToolCall', () => {});
    registry.clear();
    expect(registry.count('onComplete')).toBe(0);
    expect(registry.count('onError')).toBe(0);
    expect(registry.count('beforeToolCall')).toBe(0);
  });

  it('count returns 0 for unregistered events', () => {
    const registry = new HookRegistry();
    expect(registry.count('onLoopStart')).toBe(0);
  });

  it('handles no handlers gracefully', async () => {
    const registry = new HookRegistry();
    const result = await registry.execute('onComplete', {
      state: { phase: 'complete', iteration: 1, messages: [] },
    });
    expect(result).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  AgentLoop + HookRegistry integration                              */
/* ------------------------------------------------------------------ */

describe('AgentLoop + HookRegistry integration', () => {
  it('calls lifecycle hooks during loop execution', async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(makeTool());
    const hooks = new HookRegistry();

    const events: LifecycleEvent[] = [];
    hooks.on('onLoopStart', () => { events.push('onLoopStart'); });
    hooks.on('beforeToolCall', () => { events.push('beforeToolCall'); });
    hooks.on('afterToolCall', () => { events.push('afterToolCall'); });
    hooks.on('onComplete', () => { events.push('onComplete'); });
    hooks.on('onLoopEnd', () => { events.push('onLoopEnd'); });

    const model = toolThenAnswerModel([tc('add', { a: 1, b: 2 })], 'Done');
    const loop = new AgentLoop(toolRegistry, model, { hooks });

    await loop.run([{ role: 'user', content: 'test' }]);

    expect(events).toEqual([
      'onLoopStart',
      'beforeToolCall',
      'afterToolCall',
      'onComplete',
      'onLoopEnd',
    ]);
  });

  it('beforeToolCall hook can block tool execution', async () => {
    const toolRegistry = new ToolRegistry();
    const tool = makeTool();
    toolRegistry.register(tool);
    const hooks = new HookRegistry();

    hooks.on('beforeToolCall', () => ({
      block: true,
      reason: 'fare rules changed',
    }));

    const model = toolThenAnswerModel([tc('add', { a: 1, b: 2 })], 'Blocked');
    const loop = new AgentLoop(toolRegistry, model, { hooks });

    const state = await loop.run([{ role: 'user', content: 'test' }]);

    // Tool should NOT have been called
    expect(tool.execute).not.toHaveBeenCalled();

    // Tool result should contain block reason
    const toolResultMsg = state.messages.find((m) => m.role === 'tool_result');
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg!.toolResults![0]!.isError).toBe(true);
    expect(String(toolResultMsg!.toolResults![0]!.output)).toMatch(/Blocked by hook/);
    expect(String(toolResultMsg!.toolResults![0]!.output)).toMatch(/fare rules changed/);
  });

  it('onError hook fires on model failure', async () => {
    const toolRegistry = new ToolRegistry();
    const hooks = new HookRegistry();
    const errors: unknown[] = [];

    hooks.on('onError', (ctx) => { errors.push(ctx.error); });

    const model: ModelCallFn = async () => { throw new Error('model down'); };
    const loop = new AgentLoop(toolRegistry, model, { hooks });

    const state = await loop.run([{ role: 'user', content: 'test' }]);

    expect(state.phase).toBe('error');
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('model down');
  });

  it('afterToolCall hook receives tool result', async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(makeTool());
    const hooks = new HookRegistry();

    const results: unknown[] = [];
    hooks.on('afterToolCall', (ctx) => {
      results.push(ctx.toolResult?.output);
    });

    const model = toolThenAnswerModel([tc('add', { a: 3, b: 4 })], 'Done');
    const loop = new AgentLoop(toolRegistry, model, { hooks });

    await loop.run([{ role: 'user', content: 'test' }]);

    expect(results).toEqual([{ sum: 7 }]);
  });

  it('hook errors do not crash the loop', async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(makeTool());
    const hooks = new HookRegistry();

    hooks.on('beforeToolCall', () => { throw new Error('hook crash'); });

    const model = toolThenAnswerModel([tc('add', { a: 1, b: 2 })], 'Done');
    const loop = new AgentLoop(toolRegistry, model, { hooks });

    const state = await loop.run([{ role: 'user', content: 'test' }]);

    // Loop should still complete despite hook error
    expect(state.phase).toBe('complete');
  });
});
