import { describe, it, expect, beforeEach } from 'vitest';
import { DisruptionResponseAgent } from '../index.js';

describe('DisruptionResponseAgent (5.4)', () => {
  let agent: DisruptionResponseAgent;
  beforeEach(() => {
    agent = new DisruptionResponseAgent();
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
