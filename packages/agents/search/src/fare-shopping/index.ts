/**
 * Fare Shopping — Agent 1.4
 *
 * Multi-source fare comparison with fare basis decoding, class mapping,
 * branded fare family grouping, and passenger type pricing.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  AgentHealthStatus,
  DistributionAdapter,
  SearchRequest,
} from '@otaip/core';
import {
  AgentNotInitializedError,
  AgentInputValidationError,
} from '@otaip/core';
import type {
  FareShoppingInput,
  FareShoppingOutput,
  FareOffer,
  FareFamilyGroup,
  FareFamily,
} from './types.js';
import {
  decodeFareBasis,
  mapClassOfService,
  classifyFareFamily,
  calculatePassengerPricing,
} from './fare-classifier.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_CABIN_CLASSES = new Set(['economy', 'premium_economy', 'business', 'first']);

export class FareShopping
  implements Agent<FareShoppingInput, FareShoppingOutput>
{
  readonly id = '1.4';
  readonly name = 'Fare Shopping';
  readonly version = '0.1.0';

  private adapters: DistributionAdapter[] = [];
  private initialized = false;

  constructor(private readonly adapterProviders: DistributionAdapter[] = []) {}

  async initialize(): Promise<void> {
    this.adapters = [];
    for (const adapter of this.adapterProviders) {
      const available = await adapter.isAvailable();
      if (available) {
        this.adapters.push(adapter);
      }
    }
    this.initialized = true;
  }

  async execute(
    input: AgentInput<FareShoppingInput>,
  ): Promise<AgentOutput<FareShoppingOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const data = input.data;
    const decodeFares = data.decode_fare_basis !== false;
    const groupByFamily = data.group_by_fare_family !== false;

    // Build search request
    const searchRequest: SearchRequest = {
      segments: [{
        origin: data.origin,
        destination: data.destination,
        departure_date: data.departure_date,
      }],
      passengers: data.passengers,
      cabin_class: data.cabin_class,
      currency: data.currency,
    };

    // Filter adapters by source
    let activeAdapters = this.adapters;
    if (data.sources && data.sources.length > 0) {
      const sourceSet = new Set(data.sources);
      activeAdapters = this.adapters.filter((a) => sourceSet.has(a.name));
    }

    // Query all adapters
    const allOffers = [];
    const sourcesQueried: string[] = [];

    for (const adapter of activeAdapters) {
      try {
        const response = await adapter.search(searchRequest);
        allOffers.push(...response.offers);
        sourcesQueried.push(adapter.name);
      } catch {
        // Skip failed adapters silently for fare shopping
        sourcesQueried.push(adapter.name);
      }
    }

    // Build fare offers
    const fares: FareOffer[] = allOffers.map((offer) => {
      // Decode fare basis codes
      const fareBasisDecoded = decodeFares && offer.fare_basis
        ? offer.fare_basis.map((fb) => decodeFareBasis(fb))
        : null;

      // Map class of service
      const classOfService = offer.booking_classes
        ? offer.booking_classes.map((bc) => mapClassOfService(bc))
        : null;

      // Classify fare family
      const primaryFareBasis = offer.fare_basis?.[0] ?? '';
      const primaryBookingClass = offer.booking_classes?.[0];
      const fareFamily = classifyFareFamily(primaryFareBasis, primaryBookingClass);

      // Calculate passenger pricing
      const passengerPricing = calculatePassengerPricing(offer, data.passengers);

      return {
        offer,
        fare_basis_decoded: fareBasisDecoded,
        class_of_service: classOfService,
        fare_family: fareFamily,
        passenger_pricing: passengerPricing,
      };
    });

    // Sort by price
    fares.sort((a, b) => a.offer.price.total - b.offer.price.total);

    // Group by fare family
    let fareFamilies: FareFamilyGroup[] | null = null;
    if (groupByFamily && fares.length > 0) {
      const familyMap = new Map<FareFamily, FareOffer[]>();
      for (const fare of fares) {
        const existing = familyMap.get(fare.fare_family) ?? [];
        existing.push(fare);
        familyMap.set(fare.fare_family, existing);
      }

      fareFamilies = [...familyMap.entries()].map(([family, offers]) => ({
        family,
        offers,
        cheapest_total: Math.min(...offers.map((o) => o.offer.price.total)),
        most_expensive_total: Math.max(...offers.map((o) => o.offer.price.total)),
      }));

      // Sort families by cheapest price
      fareFamilies.sort((a, b) => a.cheapest_total - b.cheapest_total);
    }

    return {
      data: {
        fares,
        fare_families: fareFamilies,
        total_fares: fares.length,
        sources_queried: sourcesQueried,
      },
      confidence: fares.length > 0 ? 1.0 : 0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        fare_count: fares.length,
        family_count: fareFamilies?.length ?? 0,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }
    if (this.adapters.length === 0) {
      return { status: 'degraded', details: 'No distribution adapters available.' };
    }
    return { status: 'healthy' };
  }

  destroy(): void {
    this.adapters = [];
    this.initialized = false;
  }

  private validateInput(data: FareShoppingInput): void {
    if (!data.origin || typeof data.origin !== 'string' || data.origin.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'origin', 'Required non-empty string.');
    }

    if (!data.destination || typeof data.destination !== 'string' || data.destination.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'destination', 'Required non-empty string.');
    }

    if (!data.departure_date || !ISO_DATE_RE.test(data.departure_date)) {
      throw new AgentInputValidationError(this.id, 'departure_date', 'Required ISO 8601 date (YYYY-MM-DD).');
    }

    if (!data.passengers || !Array.isArray(data.passengers) || data.passengers.length === 0) {
      throw new AgentInputValidationError(this.id, 'passengers', 'At least one passenger required.');
    }

    if (data.cabin_class !== undefined && !VALID_CABIN_CLASSES.has(data.cabin_class)) {
      throw new AgentInputValidationError(this.id, 'cabin_class', `Must be one of: ${[...VALID_CABIN_CLASSES].join(', ')}`);
    }
  }
}

export type {
  FareShoppingInput,
  FareShoppingOutput,
  FareOffer,
  FareFamilyGroup,
  FareFamily,
  DecodedFareBasisInfo,
  ClassOfServiceInfo,
  PassengerPricing,
} from './types.js';
