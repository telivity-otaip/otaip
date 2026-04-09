import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { SubAgentSpawner } from '../spawner.js';
import { ToolRegistry } from '../../tool-interface/registry.js';
import { HookRegistry } from '../../lifecycle/hook-registry.js';
import type { ToolDefinition } from '../../tool-interface/types.js';
import type { ModelCallFn, LoopMessage, ToolCall } from '../../agent-loop/types.js';
import type { SpawnOptions } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeTool(name: string, overrides?: Partial<ToolDefinition>): ToolDefinition {
  return {
    name,
    description: `Tool ${name}`,
    inputSchema: z.object({ x: z.number() }),
    outputSchema: z.object({ result: z.number() }),
    execute: vi.fn().mockImplementation(async (input: { x: number }) => ({
      result: input.x * 2,
    })),
    ...overrides,
  };
}

function directAnswer(content: string): ModelCallFn {
  return async () => ({ role: 'assistant', content });
}

function toolThenAnswer(toolCalls: ToolCall[], finalContent: string): ModelCallFn {
  let callCount = 0;
  return async () => {
    callCount++;
    if (callCount === 1) {
      return { role: 'assistant', content: '', toolCalls };
    }
    return { role: 'assistant', content: finalContent };
  };
}

function baseOptions(overrides?: Partial<SpawnOptions>): SpawnOptions {
  return {
    name: 'test-sub-agent',
    allowedTools: ['double'],
    contextMessages: [{ role: 'user', content: 'Do the thing' }],
    modelCall: directAnswer('Done'),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Basic spawning                                                    */
/* ------------------------------------------------------------------ */

describe('SubAgentSpawner', () => {
  it('spawns a sub-agent that completes with a direct answer', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('double'));
    const spawner = new SubAgentSpawner(registry);

    const result = await spawner.spawn(baseOptions());

    expect(result.success).toBe(true);
    expect(result.name).toBe('test-sub-agent');
    expect(result.output).toBe('Done');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.state.phase).toBe('complete');
  });

  it('spawns a sub-agent that uses tools', async () => {
    const registry = new ToolRegistry();
    const tool = makeTool('double');
    registry.register(tool);
    const spawner = new SubAgentSpawner(registry);

    const result = await spawner.spawn(
      baseOptions({
        modelCall: toolThenAnswer(
          [{ id: 'tc-1', name: 'double', input: { x: 5 } }],
          'Result is 10',
        ),
      }),
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe('Result is 10');
    expect(tool.execute).toHaveBeenCalledWith({ x: 5 });
  });

  /* ---------------------------------------------------------------- */
  /*  Tool scoping                                                    */
  /* ---------------------------------------------------------------- */

  it('only grants allowed tools to sub-agent', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('allowed'));
    registry.register(makeTool('forbidden'));
    const spawner = new SubAgentSpawner(registry);

    const result = await spawner.spawn(
      baseOptions({
        allowedTools: ['allowed'],
        modelCall: toolThenAnswer(
          [{ id: 'tc-1', name: 'forbidden', input: { x: 1 } }],
          'Handled error',
        ),
      }),
    );

    // forbidden tool should not be found
    const toolResult = result.state.messages.find((m) => m.role === 'tool_result');
    expect(toolResult).toBeDefined();
    expect(toolResult!.toolResults![0]!.isError).toBe(true);
    expect(String(toolResult!.toolResults![0]!.output)).toMatch(/not found/);
  });

  it('silently skips tools not in parent registry', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('exists'));
    const spawner = new SubAgentSpawner(registry);

    // Requesting a tool that doesn't exist in parent
    const result = await spawner.spawn(
      baseOptions({
        allowedTools: ['exists', 'ghost'],
        modelCall: directAnswer('OK'),
      }),
    );

    expect(result.success).toBe(true);
  });

  /* ---------------------------------------------------------------- */
  /*  Context scoping                                                 */
  /* ---------------------------------------------------------------- */

  it('seeds sub-agent with provided context messages', async () => {
    const registry = new ToolRegistry();
    const spawner = new SubAgentSpawner(registry);

    const contextMessages: LoopMessage[] = [
      { role: 'user', content: 'Context message 1' },
      { role: 'assistant', content: 'Context response 1' },
      { role: 'user', content: 'Now do the task' },
    ];

    const result = await spawner.spawn(baseOptions({ contextMessages }));

    // Should have context messages + the final assistant response
    expect(result.state.messages.length).toBeGreaterThan(contextMessages.length);
    expect(result.state.messages[0]!.content).toBe('Context message 1');
  });

  /* ---------------------------------------------------------------- */
  /*  Max depth enforcement                                           */
  /* ---------------------------------------------------------------- */

  it('prevents recursive spawning (max depth = 1)', async () => {
    const registry = new ToolRegistry();
    // depth=1 means we're already a sub-agent
    const spawner = new SubAgentSpawner(registry, undefined, 1);

    await expect(spawner.spawn(baseOptions())).rejects.toThrow(/max depth.*exceeded/);
  });

  it('allows depth 0 (parent) to spawn', async () => {
    const registry = new ToolRegistry();
    const spawner = new SubAgentSpawner(registry, undefined, 0);

    const result = await spawner.spawn(baseOptions());
    expect(result.success).toBe(true);
  });

  /* ---------------------------------------------------------------- */
  /*  Hook propagation                                                */
  /* ---------------------------------------------------------------- */

  it('does not propagate hooks by default', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('double'));
    const hooks = new HookRegistry();
    const hookCalls: string[] = [];
    hooks.on('onLoopStart', () => {
      hookCalls.push('start');
    });

    const spawner = new SubAgentSpawner(registry, hooks);
    await spawner.spawn(baseOptions({ propagateHooks: false }));

    expect(hookCalls).toHaveLength(0);
  });

  it('propagates hooks when propagateHooks=true', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('double'));
    const hooks = new HookRegistry();
    const hookCalls: string[] = [];
    hooks.on('onLoopStart', () => {
      hookCalls.push('start');
    });
    hooks.on('onLoopEnd', () => {
      hookCalls.push('end');
    });

    const spawner = new SubAgentSpawner(registry, hooks);
    await spawner.spawn(baseOptions({ propagateHooks: true }));

    expect(hookCalls).toContain('start');
    expect(hookCalls).toContain('end');
  });

  /* ---------------------------------------------------------------- */
  /*  Timeout                                                         */
  /* ---------------------------------------------------------------- */

  it('aborts sub-agent that exceeds timeout', async () => {
    const registry = new ToolRegistry();
    const spawner = new SubAgentSpawner(registry);

    const slowModel: ModelCallFn = async () => {
      await new Promise((r) => setTimeout(r, 500));
      return { role: 'assistant', content: 'too late' };
    };

    await expect(
      spawner.spawn(baseOptions({ modelCall: slowModel, timeoutMs: 50 })),
    ).rejects.toThrow(/timed out/);
  });

  /* ---------------------------------------------------------------- */
  /*  Max iterations                                                  */
  /* ---------------------------------------------------------------- */

  it('respects maxIterations config', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('double'));
    const spawner = new SubAgentSpawner(registry);

    let callCount = 0;
    const infiniteModel: ModelCallFn = async () => {
      callCount++;
      return {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: `tc-${callCount}`, name: 'double', input: { x: 1 } }],
      };
    };

    const result = await spawner.spawn(baseOptions({ modelCall: infiniteModel, maxIterations: 3 }));

    expect(result.success).toBe(false);
    expect(result.state.phase).toBe('error');
  });

  /* ---------------------------------------------------------------- */
  /*  Error in sub-agent                                              */
  /* ---------------------------------------------------------------- */

  it('returns success=false when sub-agent errors', async () => {
    const registry = new ToolRegistry();
    const spawner = new SubAgentSpawner(registry);

    const failModel: ModelCallFn = async () => {
      throw new Error('model crashed');
    };

    const result = await spawner.spawn(baseOptions({ modelCall: failModel }));

    expect(result.success).toBe(false);
    expect(result.state.phase).toBe('error');
  });
});
