/**
 * Hotel Search Aggregator — core logic.
 *
 * Parallel async calls to all registered adapters with configurable timeout.
 * Returns partial results if some sources timeout (don't block on slowest source).
 *
 * Domain rules:
 * - GDS does NOT store hotel inventory — pulls real-time from CRS/PMS
 * - Each source returns its own property ID — no cross-source ID exists
 * - Must handle rate limiting per API (Hotelbeds eval: 50 req/day)
 */

import type { HotelSourceAdapter, HotelSearchParams } from './adapters/base-adapter.js';
import type { RawHotelResult } from '../types/hotel-common.js';
import type { AdapterResult } from './types.js';

interface AggregatedSearchResult {
  properties: RawHotelResult[];
  adapterResults: AdapterResult[];
  partialResults: boolean;
}

/**
 * Executes a search across all adapters in parallel with a timeout.
 * Returns whatever results are available when the timeout fires.
 */
export async function aggregateSearch(
  adapters: HotelSourceAdapter[],
  params: HotelSearchParams,
  timeoutMs: number,
): Promise<AggregatedSearchResult> {
  if (adapters.length === 0) {
    return { properties: [], adapterResults: [], partialResults: false };
  }

  const adapterPromises = adapters.map(
    async (
      adapter,
    ): Promise<{
      adapter: HotelSourceAdapter;
      results: RawHotelResult[];
      error?: string;
      timedOut: boolean;
      durationMs: number;
    }> => {
      const start = Date.now();
      try {
        const results = await adapter.searchHotels(params);
        return { adapter, results, timedOut: false, durationMs: Date.now() - start };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return {
          adapter,
          results: [],
          error: message,
          timedOut: false,
          durationMs: Date.now() - start,
        };
      }
    },
  );

  // Race all adapters against a timeout
  const timeoutPromise = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), timeoutMs),
  );

  const settledResults: Array<{
    adapter: HotelSourceAdapter;
    results: RawHotelResult[];
    error?: string;
    timedOut: boolean;
    durationMs: number;
  }> = [];

  // Use Promise.allSettled with a wrapping timeout per adapter
  const withTimeout = adapterPromises.map(async (p, _idx) => {
    const result = await Promise.race([p, timeoutPromise]);
    if (result === 'timeout') {
      return null; // timed out
    }
    return result;
  });

  const outcomes = await Promise.allSettled(withTimeout);

  let hasTimeout = false;

  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    if (!outcome) continue;

    if (outcome.status === 'fulfilled' && outcome.value !== null) {
      settledResults.push(outcome.value);
    } else {
      hasTimeout = true;
      settledResults.push({
        adapter: adapters[i]!,
        results: [],
        timedOut: true,
        durationMs: timeoutMs,
      });
    }
  }

  const allProperties: RawHotelResult[] = [];
  const adapterResults: AdapterResult[] = [];

  for (const sr of settledResults) {
    allProperties.push(...sr.results);
    adapterResults.push({
      adapterId: sr.adapter.adapterId,
      adapterName: sr.adapter.adapterName,
      resultCount: sr.results.length,
      responseTimeMs: sr.durationMs,
      timedOut: sr.timedOut,
      error: sr.error,
    });
  }

  const hasErrors = adapterResults.some((r) => r.error !== undefined || r.timedOut);

  return {
    properties: allProperties,
    adapterResults,
    partialResults: hasTimeout || hasErrors,
  };
}
