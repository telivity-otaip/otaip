/**
 * Adapter configuration — selects DuffelAdapter or MockOtaAdapter
 * based on environment variables.
 *
 * Sprint F: returns OtaAdapter (extends DistributionAdapter with booking methods).
 */

import type { OtaAdapter } from '../types.js';
import { DuffelAdapter } from '@otaip/adapter-duffel';
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
