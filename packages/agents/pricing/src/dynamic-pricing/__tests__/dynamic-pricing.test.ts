import { describe, it, expect } from 'vitest';
import { DynamicPricingAgent } from '../index.js';

describe('DynamicPricingAgent (coming soon)', () => {
  it('throws not implemented', async () => {
    const a = new DynamicPricingAgent(); await a.initialize();
    await expect(a.execute({ data: {} })).rejects.toThrow('not yet implemented');
  });
});
