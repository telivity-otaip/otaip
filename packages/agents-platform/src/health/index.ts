/**
 * PlatformHealthAggregator — checks health of all registered agents.
 */

import type { Agent } from '@otaip/core';
import type { PlatformHealth } from './types.js';
import type { AgentHealthStatus } from '@otaip/core';

export class PlatformHealthAggregator {
  private readonly agents: Map<string, Agent<unknown, unknown>>;

  constructor(agents: Map<string, Agent<unknown, unknown>>) {
    this.agents = agents;
  }

  /** Check health of all registered agents. */
  async check(): Promise<PlatformHealth> {
    const results: Record<string, AgentHealthStatus> = {};
    let degradedCount = 0;
    let unhealthyCount = 0;

    const entries = [...this.agents.entries()];
    const healthChecks = entries.map(async ([name, agent]) => {
      try {
        const status = await agent.health();
        results[name] = status;
        if (status.status === 'degraded') degradedCount++;
        if (status.status === 'unhealthy') unhealthyCount++;
      } catch (error: unknown) {
        results[name] = {
          status: 'unhealthy',
          details: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        };
        unhealthyCount++;
      }
    });

    await Promise.all(healthChecks);

    let status: PlatformHealth['status'] = 'healthy';
    if (unhealthyCount > 0) status = 'unhealthy';
    else if (degradedCount > 0) status = 'degraded';

    return {
      status,
      agents: results,
      timestamp: new Date().toISOString(),
      degradedCount,
      unhealthyCount,
      totalCount: entries.length,
    };
  }

  /** Check health of a single agent by name. */
  async checkAgent(name: string): Promise<AgentHealthStatus> {
    const agent = this.agents.get(name);
    if (!agent) {
      return { status: 'unhealthy', details: `Agent '${name}' not registered.` };
    }
    try {
      return await agent.health();
    } catch (error: unknown) {
      return {
        status: 'unhealthy',
        details: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

export type { PlatformHealth } from './types.js';
