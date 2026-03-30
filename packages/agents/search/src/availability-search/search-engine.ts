/**
 * Core search logic for Availability Search agent.
 *
 * Queries distribution adapters in parallel, normalizes, deduplicates,
 * filters, and sorts flight offers.
 */

import type {
  DistributionAdapter,
  SearchRequest,
  SearchOffer,
} from '@otaip/core';
import type {
  AvailabilitySearchInput,
  AvailabilitySearchOutput,
  SourceStatus,
  SortField,
  SortOrder,
} from './types.js';

// ---------------------------------------------------------------------------
// Adapter query
// ---------------------------------------------------------------------------

interface AdapterResult {
  source: string;
  offers: SearchOffer[];
  error?: string;
  responseTimeMs: number;
}

async function queryAdapter(
  adapter: DistributionAdapter,
  request: SearchRequest,
): Promise<AdapterResult> {
  const start = Date.now();
  try {
    const response = await adapter.search(request);
    return {
      source: adapter.name,
      offers: response.offers,
      responseTimeMs: Date.now() - start,
    };
  } catch (err) {
    return {
      source: adapter.name,
      offers: [],
      error: err instanceof Error ? err.message : String(err),
      responseTimeMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Generate a fingerprint for an offer based on flight segments.
 * Two offers are considered duplicates if they have the same carrier,
 * flight number, and departure time for all segments.
 */
function offerFingerprint(offer: SearchOffer): string {
  return offer.itinerary.segments
    .map((s) => `${s.carrier}${s.flight_number}-${s.departure_time}`)
    .join('|');
}

/**
 * Deduplicate offers, keeping the cheapest when duplicates found.
 */
function deduplicateOffers(offers: SearchOffer[]): SearchOffer[] {
  const seen = new Map<string, SearchOffer>();

  for (const offer of offers) {
    const fp = offerFingerprint(offer);
    const existing = seen.get(fp);
    if (!existing || offer.price.total < existing.price.total) {
      seen.set(fp, offer);
    }
  }

  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function filterOffers(
  offers: SearchOffer[],
  input: AvailabilitySearchInput,
): SearchOffer[] {
  let filtered = offers;

  if (input.direct_only) {
    filtered = filtered.filter((o) => o.itinerary.connection_count === 0);
  }

  if (input.max_connections !== undefined) {
    filtered = filtered.filter(
      (o) => o.itinerary.connection_count <= input.max_connections!,
    );
  }

  if (input.cabin_class) {
    filtered = filtered.filter((o) =>
      o.itinerary.segments.some((s) => s.cabin_class === input.cabin_class),
    );
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function getDepartureTime(offer: SearchOffer): number {
  const firstSeg = offer.itinerary.segments[0];
  return firstSeg ? new Date(firstSeg.departure_time).getTime() : 0;
}

function getArrivalTime(offer: SearchOffer): number {
  const lastSeg = offer.itinerary.segments[offer.itinerary.segments.length - 1];
  return lastSeg ? new Date(lastSeg.arrival_time).getTime() : 0;
}

function sortOffers(
  offers: SearchOffer[],
  sortBy: SortField = 'price',
  sortOrder: SortOrder = 'asc',
): SearchOffer[] {
  const sorted = [...offers];
  const multiplier = sortOrder === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    let diff: number;
    switch (sortBy) {
      case 'price':
        diff = a.price.total - b.price.total;
        break;
      case 'duration':
        diff = a.itinerary.total_duration_minutes - b.itinerary.total_duration_minutes;
        break;
      case 'departure':
        diff = getDepartureTime(a) - getDepartureTime(b);
        break;
      case 'arrival':
        diff = getArrivalTime(a) - getArrivalTime(b);
        break;
      case 'connections':
        diff = a.itinerary.connection_count - b.itinerary.connection_count;
        break;
      default:
        diff = a.price.total - b.price.total;
    }
    return diff * multiplier;
  });

  return sorted;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function executeSearch(
  input: AvailabilitySearchInput,
  adapters: DistributionAdapter[],
): Promise<AvailabilitySearchOutput> {
  // Build the canonical search request
  const searchRequest: SearchRequest = {
    segments: [
      {
        origin: input.origin,
        destination: input.destination,
        departure_date: input.departure_date,
      },
    ],
    passengers: input.passengers,
    cabin_class: input.cabin_class,
    max_connections: input.max_connections,
    direct_only: input.direct_only,
    currency: input.currency,
  };

  // Add return segment if round-trip
  if (input.return_date) {
    searchRequest.segments.push({
      origin: input.destination,
      destination: input.origin,
      departure_date: input.return_date,
    });
  }

  // Filter adapters by source names if specified
  let activeAdapters = adapters;
  if (input.sources && input.sources.length > 0) {
    const sourceSet = new Set(input.sources);
    activeAdapters = adapters.filter((a) => sourceSet.has(a.name));
  }

  // Query all adapters in parallel
  const results = await Promise.all(
    activeAdapters.map((adapter) => queryAdapter(adapter, searchRequest)),
  );

  // Build source status
  const sourceStatus: SourceStatus[] = results.map((r) => ({
    source: r.source,
    success: !r.error,
    offer_count: r.offers.length,
    error: r.error,
    response_time_ms: r.responseTimeMs,
  }));

  // Merge all offers
  const allOffers = results.flatMap((r) => r.offers);
  const totalRaw = allOffers.length;

  // Deduplicate
  const deduped = deduplicateOffers(allOffers);

  // Filter
  const filtered = filterOffers(deduped, input);

  // Sort
  const sorted = sortOffers(filtered, input.sort_by, input.sort_order);

  // Truncate
  const maxResults = input.max_results ?? 50;
  const truncated = sorted.length > maxResults;
  const finalOffers = sorted.slice(0, maxResults);

  return {
    offers: finalOffers,
    total_raw_offers: totalRaw,
    source_status: sourceStatus,
    truncated,
  };
}
