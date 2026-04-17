/**
 * Offer Service — retrieves cached offer details from search results.
 *
 * In Sprint E this is a simple cache lookup. Sprint F will add
 * FareRuleAgent integration for enriched fare rule data.
 */

import type { SearchOffer } from '@otaip/core';
import type { SearchService } from './search-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OfferDetails {
  offer: SearchOffer;
  fareRules: FareRulesSummary;
}

export interface FareRulesSummary {
  /** Sprint E: placeholder. Sprint F adds real fare rule agent data. */
  available: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OfferService {
  private readonly searchService: SearchService;

  constructor(searchService: SearchService) {
    this.searchService = searchService;
  }

  /** Retrieve full offer details by offer ID. */
  getOfferDetails(offerId: string): OfferDetails | undefined {
    const offer = this.searchService.getOffer(offerId);

    if (!offer) {
      return undefined;
    }

    return {
      offer,
      fareRules: {
        available: false,
        message: 'Fare rules not yet available. Sprint F will integrate the FareRuleAgent.',
      },
    };
  }
}
