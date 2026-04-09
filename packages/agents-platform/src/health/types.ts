import type { AgentHealthStatus } from '@otaip/core';

export interface PlatformHealth {
  /** Overall platform status — worst-case across all agents. */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Per-agent health results. */
  agents: Record<string, AgentHealthStatus>;
  /** ISO 8601 timestamp of when the check was performed. */
  timestamp: string;
  /** Number of agents reporting degraded status. */
  degradedCount: number;
  /** Number of agents reporting unhealthy status. */
  unhealthyCount: number;
  /** Total number of agents checked. */
  totalCount: number;
}
