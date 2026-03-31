/**
 * Live Duffel Adapter — connects to the Duffel NDC REST API.
 *
 * Implements DistributionAdapter for real Duffel API calls.
 * Uses global fetch (Node 20+). All monetary math via decimal.js.
 *
 * Endpoints used:
 *   POST /air/offer_requests   — search
 *   POST /air/offer_price_confirmations — price (currently not available in Duffel public API, uses offers endpoint)
 *   GET  /air/airlines          — health check
 */

import type {
  DistributionAdapter,
  SearchRequest,
  SearchResponse,
  SearchOffer,
  FlightSegment,
  PriceRequest,
  PriceResponse,
  PriceBreakdown,
} from '@otaip/core';
import Decimal from 'decimal.js';

const DUFFEL_BASE_URL = 'https://api.duffel.com';

/**
 * Parse ISO 8601 duration (e.g., "PT5H30M") to minutes.
 * Returns 0 for unparseable input.
 */
export function parseDurationToMinutes(iso: string | null | undefined): number {
  if (!iso) return 0;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? '0', 10);
  const minutes = parseInt(match[2] ?? '0', 10);
  return hours * 60 + minutes;
}

function mapCabinClass(duffelCabin: string): FlightSegment['cabin_class'] {
  switch (duffelCabin) {
    case 'economy': return 'economy';
    case 'premium_economy': return 'premium_economy';
    case 'business': return 'business';
    case 'first': return 'first';
    default: return 'economy';
  }
}

interface DuffelSlice {
  segments: DuffelSegment[];
  duration?: string;
}

interface DuffelSegment {
  marketing_carrier?: { iata_code?: string };
  operating_carrier?: { iata_code?: string };
  marketing_carrier_flight_number?: string;
  origin?: { iata_code?: string };
  destination?: { iata_code?: string };
  departing_at?: string;
  arriving_at?: string;
  duration?: string;
  aircraft?: { name?: string };
  passengers?: Array<{
    cabin_class?: string;
    cabin_class_marketing_name?: string;
    fare_basis_code?: string;
  }>;
}

interface DuffelOffer {
  id: string;
  slices?: DuffelSlice[];
  total_amount?: string;
  total_currency?: string;
  base_amount?: string;
  base_currency?: string;
  tax_amount?: string;
  tax_currency?: string;
  passengers?: Array<{
    type?: string;
    fare_basis_codes?: Array<{ fare_basis_code?: string }>;
  }>;
  live_mode?: boolean;
  expires_at?: string;
  payment_requirements?: {
    requires_instant_payment?: boolean;
  };
}

interface DuffelApiError {
  errors?: Array<{ message?: string; type?: string; code?: string }>;
}

function mapDuffelOffer(offer: DuffelOffer): SearchOffer {
  const segments: FlightSegment[] = [];
  let totalDuration = 0;

  for (const slice of offer.slices ?? []) {
    for (const seg of slice.segments ?? []) {
      const duration = parseDurationToMinutes(seg.duration);
      totalDuration += duration;

      const pax0 = seg.passengers?.[0];

      segments.push({
        carrier: seg.marketing_carrier?.iata_code ?? '',
        flight_number: seg.marketing_carrier_flight_number ?? '',
        operating_carrier: seg.operating_carrier?.iata_code,
        origin: seg.origin?.iata_code ?? '',
        destination: seg.destination?.iata_code ?? '',
        departure_time: seg.departing_at ?? '',
        arrival_time: seg.arriving_at ?? '',
        duration_minutes: duration,
        aircraft: seg.aircraft?.name,
        cabin_class: mapCabinClass(pax0?.cabin_class ?? 'economy'),
        stops: 0,
      });
    }
  }

  const baseFare = offer.base_amount ? new Decimal(offer.base_amount).toNumber() : 0;
  const taxes = offer.tax_amount ? new Decimal(offer.tax_amount).toNumber() : 0;
  const total = offer.total_amount ? new Decimal(offer.total_amount).toNumber() : 0;
  const currency = offer.total_currency ?? 'USD';

  const price: PriceBreakdown = {
    base_fare: baseFare,
    taxes,
    total,
    currency,
  };

  const fareBasisCodes: string[] = [];
  for (const pax of offer.passengers ?? []) {
    for (const fbc of pax.fare_basis_codes ?? []) {
      if (fbc.fare_basis_code) fareBasisCodes.push(fbc.fare_basis_code);
    }
  }

  return {
    offer_id: offer.id,
    source: 'duffel',
    itinerary: {
      source_id: offer.id,
      source: 'duffel',
      segments,
      total_duration_minutes: totalDuration,
      connection_count: Math.max(0, segments.length - 1),
    },
    price,
    fare_basis: fareBasisCodes.length > 0 ? fareBasisCodes : undefined,
    instant_ticketing: offer.payment_requirements?.requires_instant_payment ?? false,
    expires_at: offer.expires_at,
  };
}

export class DuffelAdapter implements DistributionAdapter {
  readonly name = 'duffel';
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('DuffelAdapter requires a valid API key.');
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? DUFFEL_BASE_URL;
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const slices = request.segments.map((seg) => ({
      origin: seg.origin,
      destination: seg.destination,
      departure_date: seg.departure_date,
    }));

    const passengers = request.passengers.flatMap((p) =>
      Array.from({ length: p.count }, () => ({ type: p.type === 'ADT' ? 'adult' : p.type === 'CHD' ? 'child' : 'infant_without_seat' })),
    );

    const body: Record<string, unknown> = {
      data: {
        slices,
        passengers,
        cabin_class: request.cabin_class ?? 'economy',
        return_offers: true,
        max_connections: request.direct_only ? 0 : (request.max_connections ?? undefined),
      },
    };

    if (request.currency) {
      (body['data'] as Record<string, unknown>)['currency'] = request.currency;
    }

    const response = await this.request('POST', '/air/offer_requests', body);
    const offers: DuffelOffer[] = response?.data?.offers ?? [];

    return {
      offers: offers.map(mapDuffelOffer),
      truncated: false,
      metadata: { source: 'duffel', offer_request_id: response?.data?.id },
    };
  }

  async price(request: PriceRequest): Promise<PriceResponse> {
    const response = await this.request('GET', `/air/offers/${request.offer_id}`);
    const offer: DuffelOffer | undefined = response?.data;

    if (!offer) {
      return {
        price: { base_fare: 0, taxes: 0, total: 0, currency: request.currency ?? 'USD' },
        available: false,
      };
    }

    const mapped = mapDuffelOffer(offer);
    return {
      price: mapped.price,
      available: true,
      expires_at: mapped.expires_at,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.request('GET', '/air/airlines?limit=1');
      return true;
    } catch {
      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async request(method: string, path: string, body?: Record<string, unknown>): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Duffel-Version': 'v2',
      'Accept': 'application/json',
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown network error';
      throw new Error(`Duffel API network error: ${message}`);
    }

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorBody = await response.json() as DuffelApiError;
        errorDetail = errorBody.errors?.[0]?.message ?? '';
      } catch {
        // ignore parse errors
      }

      if (response.status === 429) {
        throw new Error(`Duffel API rate limited (429). ${errorDetail}`.trim());
      }

      throw new Error(`Duffel API error ${response.status}: ${errorDetail || response.statusText}`.trim());
    }

    return response.json();
  }
}
