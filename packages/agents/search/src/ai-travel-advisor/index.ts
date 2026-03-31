// Coming soon — Tier 4
import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError } from '@otaip/core';

export class AITravelAdvisorAgent implements Agent<Record<string, unknown>, Record<string, unknown>> {
  readonly id = '1.8';
  readonly name = 'AI Travel Advisor';
  readonly version = '0.0.0';
  private initialized = false;

  async initialize(): Promise<void> { this.initialized = true; }
  async execute(_input: AgentInput<Record<string, unknown>>): Promise<AgentOutput<Record<string, unknown>>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);
    throw new Error('AITravelAdvisorAgent is not yet implemented. This agent requires LLM integration and is scheduled for a future release.');
  }
  async health(): Promise<AgentHealthStatus> {
    return { status: 'degraded', details: 'Coming soon. Not yet implemented.' };
  }
  destroy(): void { this.initialized = false; }
}
