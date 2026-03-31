import { describe, it, expect, beforeAll } from 'vitest';
import { AITravelAdvisorAgent } from '../index.js';

describe('AITravelAdvisorAgent (coming soon)', () => {
  it('throws not implemented on execute', async () => {
    const agent = new AITravelAdvisorAgent();
    await agent.initialize();
    await expect(agent.execute({ data: {} })).rejects.toThrow('not yet implemented');
  });
  it('health returns degraded/coming_soon', async () => {
    const agent = new AITravelAdvisorAgent();
    const h = await agent.health();
    expect(h.status).toBe('degraded');
  });
});
