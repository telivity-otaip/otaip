/**
 * STUB — Generates an MCP server from a ConnectAdapter.
 * Full implementation comes in a separate build.
 */

import type { ConnectAdapter } from '../../types.js';

export interface McpServerConfig {
  serverName: string;
  version: string;
}

export function generateMcpServer(
  _adapter: ConnectAdapter,
  _config: McpServerConfig,
): unknown {
  throw new Error('Not implemented — MCP server generator is a stub');
}
