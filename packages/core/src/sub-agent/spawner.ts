/**
 * SubAgentSpawner — creates child AgentLoop instances with scoped
 * tool access and context. Enforces max depth = 1 (no recursive spawning).
 */

import { AgentLoop } from '../agent-loop/loop.js';
import { ToolRegistry } from '../tool-interface/registry.js';
import { HookRegistry } from '../lifecycle/hook-registry.js';
import type { LoopMessage } from '../agent-loop/types.js';
import type { SpawnOptions, SubAgentResult } from './types.js';

const DEFAULT_MAX_ITERATIONS = 10;

export class SubAgentSpawner {
  private readonly parentToolRegistry: ToolRegistry;
  private readonly parentHooks: HookRegistry | undefined;
  private readonly depth: number;

  /**
   * @param parentToolRegistry — the parent's full tool registry (sub-agent gets a scoped subset)
   * @param parentHooks — the parent's hook registry (propagated if SpawnOptions.propagateHooks)
   * @param depth — current nesting depth (0 = top-level parent). Max depth is 1.
   */
  constructor(parentToolRegistry: ToolRegistry, parentHooks?: HookRegistry, depth: number = 0) {
    this.parentToolRegistry = parentToolRegistry;
    this.parentHooks = parentHooks;
    this.depth = depth;
  }

  /**
   * Spawn a sub-agent with scoped tools and context.
   * Throws if max depth would be exceeded (sub-agents cannot spawn further sub-agents).
   */
  async spawn(options: SpawnOptions): Promise<SubAgentResult> {
    if (this.depth >= 1) {
      throw new Error(
        `Sub-agent "${options.name}" cannot spawn: max depth (1) exceeded. Sub-agents cannot spawn further sub-agents.`,
      );
    }

    const start = Date.now();

    // Build scoped tool registry
    const scopedRegistry = new ToolRegistry();
    for (const toolName of options.allowedTools) {
      const tool = this.parentToolRegistry.getIgnoringEnabled(toolName);
      if (tool) {
        scopedRegistry.register(tool);
      }
    }

    // Optionally propagate parent hooks
    const hooks = options.propagateHooks ? this.parentHooks : undefined;

    const loop = new AgentLoop(scopedRegistry, options.modelCall, {
      maxIterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      stopConditions: [],
      hooks,
    });

    const messages: LoopMessage[] = [...options.contextMessages];

    // Run with optional timeout
    let state;
    if (options.timeoutMs) {
      state = await withTimeout(loop.run(messages), options.timeoutMs, options.name);
    } else {
      state = await loop.run(messages);
    }

    const durationMs = Date.now() - start;
    const success = state.phase === 'complete';

    // Extract final assistant message
    let output: string | undefined;
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const msg = state.messages[i];
      if (msg && msg.role === 'assistant' && msg.content) {
        output = msg.content;
        break;
      }
    }

    return { name: options.name, state, success, output, durationMs };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Sub-agent "${name}" timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
