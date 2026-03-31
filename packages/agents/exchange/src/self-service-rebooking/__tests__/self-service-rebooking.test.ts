import { describe, it, expect, beforeEach } from 'vitest';
import { SelfServiceRebookingAgent } from '../index.js';

describe('SelfServiceRebookingAgent (5.5)', () => {
  let agent: SelfServiceRebookingAgent;
  beforeEach(() => {
    agent = new SelfServiceRebookingAgent();
  });

  it('throws before initialization', async () => {
    await expect(agent.execute({ data: {} })).rejects.toThrow();
  });

  it('reports degraded health when initialized', async () => {
    await agent.initialize();
    const h = await agent.health();
    expect(h.status).toBe('degraded');
  });

  it('throws not-implemented after initialization', async () => {
    await agent.initialize();
    await expect(agent.execute({ data: {} })).rejects.toThrow('not yet implemented');
  });
});
