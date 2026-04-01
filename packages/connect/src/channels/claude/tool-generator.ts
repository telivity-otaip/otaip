/**
 * STUB — Generates MCP tool definitions from a ConnectAdapter.
 * Full implementation comes in a separate build.
 */

import type { ConnectAdapter } from '../../types.js';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export function generateMcpTools(
  _adapter: ConnectAdapter,
): McpToolDefinition[] {
  throw new Error('Not implemented — MCP tool generator is a stub');
}
