import { describe, it, expect } from 'vitest';
import { UnimplementedDomainInputError } from '@otaip/core';
import { DynamicPricingAgent } from '../index.js';

describe('DynamicPricingAgent (coming soon)', () => {
  it('throws UnimplementedDomainInputError', async () => {
    const a = new DynamicPricingAgent();
    await a.initialize();
    await expect(a.execute({ data: {} })).rejects.toBeInstanceOf(
      UnimplementedDomainInputError,
    );
  });
});
