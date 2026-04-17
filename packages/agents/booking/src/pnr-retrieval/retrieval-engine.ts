/**
 * PNR Retrieval Engine
 *
 * Core retrieval logic. In production, this would delegate to the
 * appropriate distribution adapter based on the `source` field (or
 * try all available adapters in priority order). For now, the engine
 * implements the deterministic retrieval contract — the actual adapter
 * calls are stubbed and will be wired when the adapter interface
 * exposes a `retrieveBooking()` method.
 *
 * // TODO: DOMAIN_QUESTION: What is the adapter fallback order when
 * // source is omitted? Is it always GDS-first, or does it depend on
 * // the original booking channel? Park for when multi-adapter retrieval
 * // is wired.
 */

import type {
  PnrRetrievalInput,
  PnrRetrievalOutput,
  RetrievalSource,
  BookingStatus,
} from './types.js';

/**
 * Retrieve a PNR by record locator.
 *
 * Current implementation: returns a stub response shaped correctly for
 * the contract. Production wiring will inject adapter(s) and delegate.
 */
export function retrievePnr(input: PnrRetrievalInput): PnrRetrievalOutput {
  const source: RetrievalSource = input.source ?? 'AMADEUS';

  // Stub: returns a minimal valid PNR.
  // This will be replaced with actual adapter calls when
  // ConnectAdapter gains a retrieveBooking() method.
  return {
    record_locator: input.record_locator,
    source,
    booking_status: 'CONFIRMED' as BookingStatus,
    passengers: [],
    segments: [],
    contacts: [],
    ticketing: { status: 'NOT_TICKETED' },
    remarks: [
      `Stub retrieval for ${input.record_locator} via ${source}. Wire adapter for real data.`,
    ],
  };
}
