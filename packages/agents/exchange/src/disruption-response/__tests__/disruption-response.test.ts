import { describe, it, expect, beforeEach } from 'vitest';
import { UnimplementedDomainInputError } from '@otaip/core';
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

  it('throws UnimplementedDomainInputError after initialization', async () => {
    await agent.initialize();
    await expect(agent.execute({ data: {} })).rejects.toBeInstanceOf(
      UnimplementedDomainInputError,
    );
  });

  it('error carries agent id and code', async () => {
    await agent.initialize();
    try {
      await agent.execute({ data: {} });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UnimplementedDomainInputError);
      const e = err as UnimplementedDomainInputError;
      expect(e.agentId).toBe('5.4');
      expect(e.code).toBe('UNIMPLEMENTED_DOMAIN_INPUT');
    }
  });
});
