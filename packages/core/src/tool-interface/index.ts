export type { ToolDefinition, ValidationIssue, ValidationResult } from './types.js';
export { validateToolInput, validateToolOutput } from './validator.js';
export { ToolRegistry } from './registry.js';

// Agent → Tool bridge (Sprint B).
export {
  AGENT_TOOL_NAMES,
  AgentToolError,
  agentToTool,
  registerAgentTools,
} from './agent-tool-bridge.js';
export type { AgentToolBridgeOptions } from './agent-tool-bridge.js';

// Catalog generator — MCP, OpenAI, standalone JSON Schema (Sprint B).
export {
  generateCatalog,
  generateMcpTools,
  generateOpenAiFunctions,
} from './catalog-generator.js';
export type {
  CatalogEntry,
  McpToolEntry,
  OpenAiFunctionEntry,
} from './catalog-generator.js';
