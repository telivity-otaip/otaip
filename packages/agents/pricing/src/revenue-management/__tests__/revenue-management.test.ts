import { describe, it, expect } from 'vitest';
import { RevenueManagementAgent } from '../index.js';

describe('RevenueManagementAgent (coming soon)', () => {
  it('throws not implemented', async () => {
    const a = new RevenueManagementAgent(); await a.initialize();
    await expect(a.execute({ data: {} })).rejects.toThrow('not yet implemented');
  });
});
