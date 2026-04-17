/**
 * AI Travel Advisor — Agent 1.8
 *
 * Rule-based flight recommendation engine. Orchestrates AvailabilitySearch
 * (1.1) to gather candidate offers, optionally expands the search to
 * flexible dates (±3 days), applies preference-weighted scoring, and
 * returns ranked recommendations with deterministic explanations.
 *
 * NOT an LLM agent. All decisions come from pure scoring functions in
 * ./scoring.ts — no external model calls.
 */

import type {
  Agent,
  AgentHealthStatus,
  AgentInput,
  AgentOutput,
  SearchOffer,
} from '@otaip/core';
import { AgentInputValidationError, AgentNotInitializedError } from '@otaip/core';
import { AvailabilitySearch } from '../availability-search/index.js';
import type {
  AvailabilitySearchInput,
  CabinClass as AvailabilityCabinClass,
} from '../availability-search/types.js';
import {
  composite,
  expandDates,
  explain,
  passesBudget,
  passesCabin,
  passesConnections,
  resolvePreferences,
  scoreOffer,
} from './scoring.js';
import type {
  AdvisorInput,
  AdvisorOutput,
  Recommendation,
  SearchSummary,
} from './types.js';

export interface AITravelAdvisorAgentOptions {
  /** Injected search agent. Required — the advisor orchestrates it. */
  availabilitySearch: AvailabilitySearch;
}

const IATA_RE = /^[A-Z]{3}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class AITravelAdvisorAgent implements Agent<AdvisorInput, AdvisorOutput> {
  readonly id = '1.8';
  readonly name = 'AI Travel Advisor';
  readonly version = '0.2.0';

  private initialized = false;
  private readonly search: AvailabilitySearch;

  constructor(options: AITravelAdvisorAgentOptions) {
    this.search = options.availabilitySearch;
  }

  async initialize(): Promise<void> {
    await this.search.initialize();
    this.initialized = true;
  }

  async execute(input: AgentInput<AdvisorInput>): Promise<AgentOutput<AdvisorOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);
    const d = input.data;

    this.validateInput(d);

    const resolved = resolvePreferences(d.preferences);
    const datesToSearch = expandDates(d.departureDate, d.flexibleDates ?? false);

    // Fan out one availability search per date. Same origin/destination for
    // all of them — flexibleDates only expands the departure date window.
    const searchInputs: AvailabilitySearchInput[] = datesToSearch.map((date) =>
      this.buildSearchInput(d, resolved, date),
    );

    const searchResults = await Promise.all(
      searchInputs.map((si) => this.search.execute({ data: si }).catch(() => null)),
    );

    const allOffers: SearchOffer[] = [];
    const adapterSet = new Set<string>();
    let totalRaw = 0;

    for (const result of searchResults) {
      if (!result) continue;
      const offers = result.data.offers;
      totalRaw += result.data.total_raw_offers;
      for (const offer of offers) {
        allOffers.push(offer);
        adapterSet.add(offer.source);
      }
    }

    // Apply filters BEFORE scoring: budget, cabin, connections.
    const eligible = allOffers.filter(
      (o) => passesBudget(o, resolved) && passesCabin(o, resolved) && passesConnections(o, resolved),
    );

    const searchSummary: SearchSummary = {
      totalOffersFound: totalRaw,
      totalOffersEligible: eligible.length,
      dateRangeSearched: datesToSearch,
      adaptersUsed: [...adapterSet].sort(),
    };

    if (eligible.length === 0) {
      return {
        data: {
          recommendations: [],
          searchSummary,
          appliedPreferences: resolved,
        },
        confidence: 0.5,
        metadata: { agent_id: this.id, offerCount: 0 },
      };
    }

    // Compute cheapest / most expensive within eligible set.
    const prices = eligible.map((o) => o.price.total);
    const cheapest = Math.min(...prices);
    const mostExpensive = Math.max(...prices);

    // Score every eligible offer, sort descending by composite score.
    const scored = eligible.map((offer) => {
      const breakdown = scoreOffer(offer, cheapest, mostExpensive, resolved);
      const score = composite(breakdown, resolved.weights);
      return { offer, breakdown, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const maxN = d.maxRecommendations ?? 5;
    const top = scored.slice(0, maxN);

    const recommendations: Recommendation[] = top.map((s, i) => ({
      rank: i + 1,
      offer: s.offer,
      score: s.score,
      scoreBreakdown: s.breakdown,
      explanation: explain(i + 1, s.offer, s.breakdown, cheapest, resolved, d.departureDate),
    }));

    return {
      data: {
        recommendations,
        searchSummary,
        appliedPreferences: resolved,
      },
      confidence: 1.0,
      metadata: { agent_id: this.id, offerCount: recommendations.length },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    const inner = await this.search.health();
    if (inner.status !== 'healthy') return inner;
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
  }

  // ─────────────────────────────────────────────────────────────────────────

  private validateInput(d: AdvisorInput): void {
    if (!IATA_RE.test(d.origin)) {
      throw new AgentInputValidationError(
        this.id,
        'origin',
        'Must be a 3-letter IATA code.',
      );
    }
    if (!IATA_RE.test(d.destination)) {
      throw new AgentInputValidationError(
        this.id,
        'destination',
        'Must be a 3-letter IATA code.',
      );
    }
    if (d.origin === d.destination) {
      throw new AgentInputValidationError(
        this.id,
        'destination',
        'Must differ from origin.',
      );
    }
    if (!ISO_DATE_RE.test(d.departureDate)) {
      throw new AgentInputValidationError(
        this.id,
        'departureDate',
        'Must be YYYY-MM-DD.',
      );
    }
    if (d.returnDate !== undefined && !ISO_DATE_RE.test(d.returnDate)) {
      throw new AgentInputValidationError(
        this.id,
        'returnDate',
        'Must be YYYY-MM-DD.',
      );
    }
    if (d.maxRecommendations !== undefined && d.maxRecommendations < 1) {
      throw new AgentInputValidationError(
        this.id,
        'maxRecommendations',
        'Must be >= 1.',
      );
    }
  }

  private buildSearchInput(
    d: AdvisorInput,
    resolved: ReturnType<typeof resolvePreferences>,
    date: string,
  ): AvailabilitySearchInput {
    const passengers: AvailabilitySearchInput['passengers'] = [];
    if (resolved.passengers.adults > 0) {
      passengers.push({ type: 'ADT', count: resolved.passengers.adults });
    }
    if (resolved.passengers.children > 0) {
      passengers.push({ type: 'CHD', count: resolved.passengers.children });
    }
    if (resolved.passengers.infants > 0) {
      passengers.push({ type: 'INF', count: resolved.passengers.infants });
    }

    const si: AvailabilitySearchInput = {
      origin: d.origin,
      destination: d.destination,
      departure_date: date,
      passengers,
      max_connections: resolved.maxConnections,
    };
    if (d.returnDate !== undefined) si.return_date = d.returnDate;
    if (resolved.cabinClass !== undefined) {
      si.cabin_class = resolved.cabinClass as AvailabilityCabinClass;
    }
    if (resolved.currency !== undefined) si.currency = resolved.currency;
    return si;
  }
}

export type {
  AdvisorInput,
  AdvisorOutput,
  CabinClass,
  PassengerCounts,
  Recommendation,
  ResolvedPreferences,
  ScoreBreakdown,
  ScoringWeights,
  SearchSummary,
  TravelerPreferences,
  TripPurpose,
} from './types.js';
