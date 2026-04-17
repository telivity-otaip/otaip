/**
 * Search Service — orchestrates adapter search with optional airport code validation.
 *
 * Caches returned offers in memory for the offer detail route.
 */

import type {
  DistributionAdapter,
  SearchRequest,
  SearchOffer,
  PassengerType,
} from '@otaip/core';
import { AirportCodeResolver } from '@otaip/agents-reference';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchParams {
  origin: string;
  destination: string;
  date: string;
  returnDate?: string;
  passengers: number;
  cabinClass?: 'economy' | 'premium_economy' | 'business' | 'first';
}

export interface SearchResult {
  offers: SearchOffer[];
  totalFound: number;
  sources: string[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SearchService {
  private readonly adapter: DistributionAdapter;
  private readonly offerCache = new Map<string, SearchOffer>();
  private airportResolver: AirportCodeResolver | null = null;

  constructor(adapter: DistributionAdapter) {
    this.adapter = adapter;
  }

  /** Attempt to initialize the airport code resolver for validation. */
  async initializeResolver(): Promise<void> {
    try {
      this.airportResolver = new AirportCodeResolver();
      await this.airportResolver.initialize();
    } catch {
      // Reference data may not be available — skip validation
      this.airportResolver = null;
    }
  }

  /** Get a cached offer by ID. */
  getOffer(offerId: string): SearchOffer | undefined {
    return this.offerCache.get(offerId);
  }

  /** Search for flight offers. */
  async search(params: SearchParams): Promise<SearchResult> {
    // Validate airport codes if resolver is available
    if (this.airportResolver) {
      await this.validateAirportCode(params.origin, 'origin');
      await this.validateAirportCode(params.destination, 'destination');
    }

    // Build the canonical search request
    const request: SearchRequest = {
      segments: [
        {
          origin: params.origin.toUpperCase(),
          destination: params.destination.toUpperCase(),
          departure_date: params.date,
        },
      ],
      passengers: [{ type: 'ADT' as PassengerType, count: params.passengers }],
      cabin_class: params.cabinClass,
    };

    // Add return segment if round trip
    if (params.returnDate) {
      request.segments.push({
        origin: params.destination.toUpperCase(),
        destination: params.origin.toUpperCase(),
        departure_date: params.returnDate,
      });
    }

    const response = await this.adapter.search(request);

    // Sort by price (lowest first) as default
    const sortedOffers = [...response.offers].sort(
      (a, b) => a.price.total - b.price.total,
    );

    // Cache offers for detail lookup
    for (const offer of sortedOffers) {
      this.offerCache.set(offer.offer_id, offer);
    }

    // Collect unique sources
    const sources = [...new Set(sortedOffers.map((o) => o.source))];

    return {
      offers: sortedOffers,
      totalFound: sortedOffers.length,
      sources,
    };
  }

  /** Validate a single airport code using the resolver. */
  private async validateAirportCode(
    code: string,
    field: string,
  ): Promise<void> {
    if (!this.airportResolver) return;

    try {
      const result = await this.airportResolver.execute({
        data: { code: code.toUpperCase(), code_type: 'iata' },
      });

      if (result.data.resolved_airport === null) {
        const suggestion = result.data.suggestion
          ? ` Did you mean ${result.data.suggestion}?`
          : '';
        throw new Error(`Invalid airport code for ${field}: ${code}.${suggestion}`);
      }
    } catch (err) {
      // If the error is our own validation error, rethrow
      if (err instanceof Error && err.message.startsWith('Invalid airport')) {
        throw err;
      }
      // Otherwise swallow — let the adapter handle it
    }
  }
}
