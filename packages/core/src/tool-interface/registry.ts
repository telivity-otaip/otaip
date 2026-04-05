/**
 * Tool registry — register tools, look up by name, list enabled tools.
 */

import type { ToolDefinition } from './types.js';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  /** Register a tool. Throws if a tool with the same name is already registered. */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Unregister a tool by name. Returns true if the tool was found and removed. */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /** Look up a tool by name. Returns undefined if not found or not enabled. */
  get(name: string): ToolDefinition | undefined {
    const tool = this.tools.get(name);
    if (!tool) return undefined;
    if (tool.isEnabled && !tool.isEnabled()) return undefined;
    return tool;
  }

  /** Look up a tool by name, ignoring enablement status. */
  getIgnoringEnabled(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** List all currently enabled tools. */
  listEnabled(): readonly ToolDefinition[] {
    const result: ToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      if (!tool.isEnabled || tool.isEnabled()) {
        result.push(tool);
      }
    }
    return result;
  }

  /** List all registered tools regardless of enablement. */
  listAll(): readonly ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** Number of registered tools (regardless of enablement). */
  get size(): number {
    return this.tools.size;
  }

  /** Remove all registered tools. */
  clear(): void {
    this.tools.clear();
  }
}
