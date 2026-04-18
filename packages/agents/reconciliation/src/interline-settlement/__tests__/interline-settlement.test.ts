import { describe, it, expect } from 'vitest';
import { UnimplementedDomainInputError } from '@otaip/core';
import { InterlineSettlementAgent } from '../index.js';

describe('InterlineSettlementAgent (coming soon)', () => {
  it('throws UnimplementedDomainInputError', async () => {
    const a = new InterlineSettlementAgent();
    await a.initialize();
    await expect(a.execute({ data: {} })).rejects.toBeInstanceOf(
      UnimplementedDomainInputError,
    );
  });
  it('health returns degraded', async () => {
    const a = new InterlineSettlementAgent();
    const h = await a.health();
    expect(h.status).toBe('degraded');
  });
});
