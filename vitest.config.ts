import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@otaip/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@otaip/agents-reference': resolve(__dirname, 'packages/agents/reference/src/index.ts'),
      '@otaip/agents-search': resolve(__dirname, 'packages/agents/search/src/index.ts'),
      '@otaip/agents-pricing': resolve(__dirname, 'packages/agents/pricing/src/index.ts'),
      '@otaip/agents-booking': resolve(__dirname, 'packages/agents/booking/src/index.ts'),
      '@otaip/agents-ticketing': resolve(__dirname, 'packages/agents/ticketing/src/index.ts'),
      '@otaip/agents-exchange': resolve(__dirname, 'packages/agents/exchange/src/index.ts'),
      '@otaip/agents-settlement': resolve(__dirname, 'packages/agents/settlement/src/index.ts'),
      '@otaip/agents-reconciliation': resolve(__dirname, 'packages/agents/reconciliation/src/index.ts'),
      '@otaip/agents-lodging': resolve(__dirname, 'packages/agents/lodging/src/index.ts'),
      '@otaip/agents-tmc': resolve(__dirname, 'packages/agents-tmc/src/index.ts'),
      '@otaip/agents-platform': resolve(__dirname, 'packages/agents-platform/src/index.ts'),
      '@otaip/adapter-duffel': resolve(__dirname, 'packages/adapters/duffel/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/__tests__/**/*.test.ts', 'packages/agents/*/src/**/__tests__/**/*.test.ts', 'packages/adapters/*/src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'packages/agents/*/src/**/*.ts', 'packages/adapters/*/src/**/*.ts'],
      exclude: ['**/__tests__/**', '**/index.ts'],
    },
    testTimeout: 10000,
  },
});
