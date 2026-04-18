import { describe, it, expect } from 'vitest';
import { UnimplementedDomainInputError } from '@otaip/core';
import { RevenueManagementAgent } from '../index.js';

describe('RevenueManagementAgent (coming soon)', () => {
  it('throws UnimplementedDomainInputError', async () => {
    const a = new RevenueManagementAgent();
    await a.initialize();
    await expect(a.execute({ data: {} })).rejects.toBeInstanceOf(
      UnimplementedDomainInputError,
    );
  });
});
