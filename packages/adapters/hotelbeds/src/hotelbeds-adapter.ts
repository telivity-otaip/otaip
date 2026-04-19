/**
 * Live Hotelbeds APItude adapter — Hotels API v1.0.
 *
 * Implements:
 *   - HotelSourceAdapter (search-only) so the existing search-aggregator
 *     (Agent 20.1) can call this class through its pluggable interface.
 *   - The full Hotels lifecycle (availability, checkrate, book, retrieve,
 *     cancel) as direct methods on this class.
 *
 * Endpoints used:
 *   POST   /hotel-api/1.0/availability
 *   POST   /hotel-api/1.0/checkrates
 *   POST   /hotel-api/1.0/bookings
 *   GET    /hotel-api/1.0/bookings/{ref}
 *   GET    /hotel-api/1.0/bookings
 *   DELETE /hotel-api/1.0/bookings/{ref}?cancellationFlag={SIMULATION|CANCELLATION}
 *   GET    /hotel-api/1.0/status                 (health)
 *
 * Retry policy is delegated to `fetchWithRetry`, which retries 5xx, 429,
 * and network errors. 4xx other than 429 is surfaced as an error.
 *
 * Hotelbeds test sandbox is rate-limited to 50 requests/day. The adapter
 * does NOT enforce that client-side; callers are expected to throttle.
 */

import { fetchWithRetry } from '@otaip/core';
import type { RawHotelResult } from '@otaip/agents-lodging';

import { buildAuthHeaders, type HotelbedsCredentials } from './auth.js';
import { mapHotelToRawResult, summarizeBooking, type BookingSummary } from './field-mapper.js';
import type {
  HotelbedsAdapterConfig,
  HotelbedsAvailabilityRequest,
  HotelbedsAvailabilityResponse,
  HotelbedsBookingRequest,
  HotelbedsBookingResponse,
  HotelbedsBookingListResponse,
  HotelbedsCancellationFlag,
  HotelbedsCancellationResponse,
  HotelbedsCheckRateRequest,
  HotelbedsCheckRateResponse,
  HotelbedsEnvironment,
  HotelbedsErrorResponse,
} from './types.js';
import { HOTELBEDS_BASE_URLS } from './types.js';
import type { HotelSearchParams, HotelSourceAdapter } from './lodging-source-interface.js';

const HOTELS_BASE_PATH = '/hotel-api/1.0';

/**
 * The `HotelSourceAdapter` interface lives in `@otaip/agents-lodging`. We
 * re-state it locally to keep this package's dependency surface narrow and
 * avoid a circular import — the lodging package is allowed to depend on
 * adapters in future iterations.
 */
export type { HotelSearchParams, HotelSourceAdapter } from './lodging-source-interface.js';

export class HotelbedsAdapter implements HotelSourceAdapter {
  readonly adapterId = 'hotelbeds';
  readonly adapterName = 'Hotelbeds APItude API';

  private readonly credentials: HotelbedsCredentials;
  private readonly baseUrl: string;
  private readonly environment: HotelbedsEnvironment;
  private readonly timeoutMs: number | undefined;

  constructor(config: HotelbedsAdapterConfig = {}) {
    const apiKey = config.apiKey ?? process.env['HOTELBEDS_API_KEY'] ?? '';
    const secret = config.secret ?? process.env['HOTELBEDS_SECRET'] ?? '';

    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error(
        'HotelbedsAdapter requires HOTELBEDS_API_KEY (constructor or env var).',
      );
    }
    if (!secret || secret.trim().length === 0) {
      throw new Error(
        'HotelbedsAdapter requires HOTELBEDS_SECRET (constructor or env var).',
      );
    }

    const envFromArgsOrEnv = config.environment ?? (process.env['HOTELBEDS_ENV'] as HotelbedsEnvironment | undefined);
    this.environment = envFromArgsOrEnv === 'production' ? 'production' : 'test';
    this.baseUrl = config.baseUrl ?? HOTELBEDS_BASE_URLS[this.environment];
    this.credentials = { apiKey, secret };
    this.timeoutMs = config.timeoutMs;
  }

  // -------------------------------------------------------------------------
  // HotelSourceAdapter — search bridge
  // -------------------------------------------------------------------------

  /**
   * Adapts the search-aggregator's `HotelSearchParams` to a Hotelbeds
   * availability request and maps the response back to `RawHotelResult[]`.
   *
   * Destination handling: Hotelbeds expects a destination *code* (its own
   * 3-letter identifier). When the caller hands us anything else we pass
   * it through verbatim — Hotelbeds returns an empty result set rather
   * than a 4xx for unknown codes. Resolving free-text destinations to
   * Hotelbeds destination codes is the search-aggregator's job, not the
   * adapter's.
   */
  async searchHotels(params: HotelSearchParams): Promise<RawHotelResult[]> {
    const start = Date.now();
    const occupancies = [
      {
        rooms: params.rooms,
        adults: params.adults,
        children: params.children ?? 0,
      },
    ];

    const body: HotelbedsAvailabilityRequest = {
      stay: { checkIn: params.checkIn, checkOut: params.checkOut },
      occupancies,
      destination: { code: params.destination.toUpperCase() },
    };

    const response = await this.availability(body);
    const latency = Date.now() - start;

    const hotels = response.hotels?.hotels ?? [];
    return hotels.map((h) =>
      mapHotelToRawResult(h, {
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        responseLatencyMs: latency,
      }),
    );
  }

  /**
   * Implementation of `HotelSourceAdapter.isAvailable`. Hits the Hotelbeds
   * `/status` endpoint, which is small and cheap (counts toward the
   * sandbox 50/day quota — call sparingly).
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.request('GET', `${HOTELS_BASE_PATH}/status`);
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Hotels API — direct operations
  // -------------------------------------------------------------------------

  async availability(request: HotelbedsAvailabilityRequest): Promise<HotelbedsAvailabilityResponse> {
    return (await this.request(
      'POST',
      `${HOTELS_BASE_PATH}/hotels`,
      request,
    )) as HotelbedsAvailabilityResponse;
  }

  async checkRate(request: HotelbedsCheckRateRequest): Promise<HotelbedsCheckRateResponse> {
    return (await this.request(
      'POST',
      `${HOTELS_BASE_PATH}/checkrates`,
      request,
    )) as HotelbedsCheckRateResponse;
  }

  async book(request: HotelbedsBookingRequest): Promise<HotelbedsBookingResponse> {
    return (await this.request(
      'POST',
      `${HOTELS_BASE_PATH}/bookings`,
      request,
    )) as HotelbedsBookingResponse;
  }

  async getBooking(reference: string): Promise<HotelbedsBookingResponse> {
    return (await this.request(
      'GET',
      `${HOTELS_BASE_PATH}/bookings/${encodeURIComponent(reference)}`,
    )) as HotelbedsBookingResponse;
  }

  async listBookings(params: { from: string; to: string; filterType?: 'CHECKIN' | 'CHECKOUT' | 'CREATION' } = {
    from: '',
    to: '',
  }): Promise<HotelbedsBookingListResponse> {
    const search = new URLSearchParams();
    if (params.from) search.set('from', params.from);
    if (params.to) search.set('to', params.to);
    if (params.filterType) search.set('filterType', params.filterType);
    const query = search.toString();
    return (await this.request(
      'GET',
      `${HOTELS_BASE_PATH}/bookings${query ? `?${query}` : ''}`,
    )) as HotelbedsBookingListResponse;
  }

  /**
   * Cancel a booking. Two-step pattern recommended by Hotelbeds:
   *   1. Call with `flag = 'SIMULATION'` to preview the penalty.
   *   2. Call with `flag = 'CANCELLATION'` to actually cancel.
   *
   * Callers (the hotel-modification agent) are responsible for the
   * simulate-then-confirm flow.
   */
  async cancelBooking(
    reference: string,
    flag: HotelbedsCancellationFlag = 'SIMULATION',
  ): Promise<HotelbedsCancellationResponse> {
    return (await this.request(
      'DELETE',
      `${HOTELS_BASE_PATH}/bookings/${encodeURIComponent(reference)}?cancellationFlag=${flag}`,
    )) as HotelbedsCancellationResponse;
  }

  // -------------------------------------------------------------------------
  // Convenience helpers — mapped output
  // -------------------------------------------------------------------------

  /** Run availability + map every hotel to OTAIP `RawHotelResult`. */
  async availabilityRawResults(
    request: HotelbedsAvailabilityRequest,
  ): Promise<RawHotelResult[]> {
    const start = Date.now();
    const response = await this.availability(request);
    const latency = Date.now() - start;
    const hotels = response.hotels?.hotels ?? [];
    return hotels.map((h) =>
      mapHotelToRawResult(h, {
        checkIn: request.stay.checkIn,
        checkOut: request.stay.checkOut,
        responseLatencyMs: latency,
      }),
    );
  }

  /** Run book + return the OTAIP-friendly summary or null if Hotelbeds returned no booking. */
  async bookSummary(request: HotelbedsBookingRequest): Promise<BookingSummary | null> {
    const response = await this.book(request);
    if (!response.booking) return null;
    return summarizeBooking(response.booking);
  }

  // -------------------------------------------------------------------------
  // Low-level request
  // -------------------------------------------------------------------------

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      ...buildAuthHeaders(this.credentials),
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetchWithRetry(
        url,
        {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        },
        this.timeoutMs !== undefined ? { timeoutMs: this.timeoutMs } : {},
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown network error';
      throw new Error(`Hotelbeds API network error: ${message}`);
    }

    if (!response.ok) {
      let detail = '';
      try {
        const errorBody = (await response.json()) as HotelbedsErrorResponse;
        detail = errorBody.error?.message ?? '';
      } catch {
        // ignore parse errors — Hotelbeds occasionally returns text/html on 5xx
      }

      if (response.status === 429) {
        throw new Error(`Hotelbeds API rate limited (429). ${detail}`.trim());
      }

      throw new Error(
        `Hotelbeds API error ${response.status}: ${detail || response.statusText}`.trim(),
      );
    }

    // 204 No Content — uncommon but the spec allows it for some empty results.
    if (response.status === 204) return {};
    return response.json();
  }
}
