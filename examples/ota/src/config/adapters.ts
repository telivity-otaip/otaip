/**
 * Adapter configuration — selects DuffelAdapter or MockDuffelAdapter
 * based on environment variables.
 */

import type { DistributionAdapter } from '@otaip/core';
import { MockDuffelAdapter, DuffelAdapter } from '@otaip/adapter-duffel';

/**
 * Create the distribution adapter based on environment configuration.
 *
 * - If `DUFFEL_API_TOKEN` is set, uses the real DuffelAdapter.
 * - Otherwise, falls back to MockDuffelAdapter with realistic test data.
 */
export function createAdapter(): DistributionAdapter {
  const token = process.env['DUFFEL_API_TOKEN'];

  if (token && token !== 'duffel_test_your_token_here') {
    return new DuffelAdapter(token);
  }

  return new MockDuffelAdapter();
}
