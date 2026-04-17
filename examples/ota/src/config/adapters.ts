/**
 * Adapter configuration — selects DuffelAdapter or MockOtaAdapter
 * based on environment variables.
 *
 * Sprint F: returns OtaAdapter (extends DistributionAdapter with booking methods).
 * Sprint H: adds createMultiAdapter() for multi-source search.
 */

import type { DistributionAdapter } from '@otaip/core';
import type { OtaAdapter } from '../types.js';
import { MockDuffelAdapter } from '@otaip/adapter-duffel';
import { MockOtaAdapter } from '../mock-ota-adapter.js';

/**
 * Create the OTA adapter based on environment configuration.
 *
 * - If `DUFFEL_API_TOKEN` is set, the DuffelAdapter is used for search/price
 *   but booking methods are not available (throws at runtime).
 * - Otherwise, falls back to MockOtaAdapter with realistic test data and
 *   full booking/payment/ticketing support.
 */
export function createAdapter(): OtaAdapter {
  const token = process.env['DUFFEL_API_TOKEN'];

  if (token && token !== 'duffel_test_your_token_here') {
    // TODO: When DuffelAdapter supports booking, return a real OtaAdapter wrapper.
    // For now, production mode still uses MockOtaAdapter for booking methods.
    // The DuffelAdapter only covers search/price.
    console.warn('DUFFEL_API_TOKEN set but booking requires MockOtaAdapter. Using mock.');
  }

  return new MockOtaAdapter();
}

/**
 * Create a multi-adapter map for parallel search.
 *
 * Reads the `ADAPTERS` env var (comma-separated list of adapter names).
 * Supported names: 'mock', 'duffel-mock'.
 * Default: single 'mock' adapter (backward compatible).
 *
 * Returns a Map<string, DistributionAdapter> suitable for MultiSearchService.
 */
export function createMultiAdapter(): Map<string, DistributionAdapter> {
  const adaptersEnv = process.env['ADAPTERS'];
  const adapterNames = adaptersEnv
    ? adaptersEnv.split(',').map((s) => s.trim()).filter(Boolean)
    : ['mock'];

  const adapters = new Map<string, DistributionAdapter>();

  for (const name of adapterNames) {
    switch (name) {
      case 'mock':
        adapters.set('mock', new MockOtaAdapter());
        break;
      case 'duffel-mock':
        adapters.set('duffel-mock', new MockDuffelAdapter());
        break;
      default:
        console.warn(`Unknown adapter name: '${name}'. Skipping.`);
    }
  }

  // Fallback: always have at least one adapter
  if (adapters.size === 0) {
    adapters.set('mock', new MockOtaAdapter());
  }

  return adapters;
}
