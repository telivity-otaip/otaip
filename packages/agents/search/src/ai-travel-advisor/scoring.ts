/**
 * Scoring functions for AITravelAdvisorAgent (1.8).
 *
 * Pure, deterministic functions. No I/O, no randomness. Unit tested
 * independently of the orchestrator. Each dimension scores 0..1;
 * composite score is weighted sum.
 */

import Decimal from 'decimal.js';
import type { SearchOffer } from '@otaip/core';
import type {
  ResolvedPreferences,
  ScoreBreakdown,
  ScoringWeights,
  TravelerPreferences,
  TripPurpose,
} from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS_BUSINESS: ScoringWeights = {
  price: 0.2,
  schedule: 0.4,
  airline: 0.2,
  connections: 0.2,
};

const WEIGHTS_LEISURE: ScoringWeights = {
  price: 0.5,
  schedule: 0.2,
  airline: 0.1,
  connections: 0.2,
};

const WEIGHTS_DEFAULT: ScoringWeights = {
  price: 0.4,
  schedule: 0.3,
  airline: 0.1,
  connections: 0.2,
};

export function weightsFor(purpose: TripPurpose | undefined): ScoringWeights {
  if (purpose === 'business') return { ...WEIGHTS_BUSINESS };
  if (purpose === 'leisure') return { ...WEIGHTS_LEISURE };
  return { ...WEIGHTS_DEFAULT };
}

export function resolvePreferences(prefs: TravelerPreferences | undefined): ResolvedPreferences {
  const passengers = prefs?.passengers;
  const resolved: ResolvedPreferences = {
    currency: prefs?.currency ?? 'USD',
    passengers: {
      adults: passengers?.adults ?? 1,
      children: passengers?.children ?? 0,
      infants: passengers?.infants ?? 0,
    },
    maxConnections: prefs?.maxConnections ?? 1,
    weights: prefs?.scoringWeights ?? weightsFor(prefs?.tripPurpose),
    preferredAirlines: prefs?.preferredAirlines ?? [],
  };
  if (prefs?.tripPurpose !== undefined) resolved.tripPurpose = prefs.tripPurpose;
  if (prefs?.cabinClass !== undefined) resolved.cabinClass = prefs.cabinClass;
  if (prefs?.budgetMin !== undefined) resolved.budgetMin = prefs.budgetMin;
  if (prefs?.budgetMax !== undefined) resolved.budgetMax = prefs.budgetMax;
  return resolved;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters (applied BEFORE scoring — exclude, not penalize)
// ─────────────────────────────────────────────────────────────────────────────

export function passesBudget(offer: SearchOffer, resolved: ResolvedPreferences): boolean {
  const total = offer.price.total;
  if (resolved.budgetMin !== undefined && total < resolved.budgetMin) return false;
  if (resolved.budgetMax !== undefined && total > resolved.budgetMax) return false;
  return true;
}

export function passesCabin(offer: SearchOffer, resolved: ResolvedPreferences): boolean {
  if (resolved.cabinClass === undefined) return true;
  const segments = offer.itinerary.segments;
  if (segments.length === 0) return false;
  return segments.every((s) => s.cabin_class === resolved.cabinClass);
}

export function passesConnections(offer: SearchOffer, resolved: ResolvedPreferences): boolean {
  return offer.itinerary.connection_count <= resolved.maxConnections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-dimension scores (0..1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Linear price score: 1.0 for the cheapest, 0.0 for the most expensive.
 * When all offers are the same price, everyone scores 1.0.
 */
export function scorePrice(offer: SearchOffer, cheapest: number, mostExpensive: number): number {
  if (mostExpensive === cheapest) return 1.0;
  const norm = (offer.price.total - cheapest) / (mostExpensive - cheapest);
  return clamp01(1.0 - norm);
}

/**
 * Schedule score: prefers 07:00-10:00 or 17:00-20:00 departure windows.
 * Linear falloff outside those windows. Returns 0.3 floor for truly
 * unfriendly hours (red-eye etc.) so schedule-weighted scores don't go
 * to zero for outliers.
 */
export function scoreSchedule(offer: SearchOffer): number {
  const first = offer.itinerary.segments[0];
  if (!first) return 0.5;
  const hour = parseHourUtc(first.departure_time);
  if (hour === undefined) return 0.5;

  // Discrete buckets, clearest signal under weight combinations.
  // Peak business windows.
  if ((hour >= 7 && hour < 10) || (hour >= 17 && hour < 20)) return 1.0;
  // Shoulders (6am is reasonable, 5am is redeye).
  if (hour === 6 || (hour >= 20 && hour < 23)) return 0.6;
  // Daytime middle — slightly penalised but usable.
  if (hour >= 10 && hour < 17) return 0.7;
  // Deep night / redeye (23:00–06:00).
  return 0.2;
}

/**
 * Airline score: 1.0 if all segments' marketing carriers are in the
 * preferred list; 0.5 when no preferences supplied; else proportion
 * of preferred-carrier segments.
 */
export function scoreAirline(offer: SearchOffer, preferredAirlines: string[]): number {
  if (preferredAirlines.length === 0) return 0.5;
  const segments = offer.itinerary.segments;
  if (segments.length === 0) return 0.0;
  const matches = segments.filter((s) => preferredAirlines.includes(s.carrier)).length;
  return matches / segments.length;
}

/** 1.0 for direct, 0.5 for 1 stop, 0.33 for 2, etc. */
export function scoreConnections(offer: SearchOffer): number {
  return 1.0 / (1 + offer.itinerary.connection_count);
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite
// ─────────────────────────────────────────────────────────────────────────────

export function composite(breakdown: ScoreBreakdown, weights: ScoringWeights): number {
  const total =
    breakdown.price * weights.price +
    breakdown.schedule * weights.schedule +
    breakdown.airline * weights.airline +
    breakdown.connections * weights.connections;
  const weightSum = weights.price + weights.schedule + weights.airline + weights.connections;
  return weightSum === 0 ? 0 : total / weightSum;
}

export function scoreOffer(
  offer: SearchOffer,
  cheapest: number,
  mostExpensive: number,
  resolved: ResolvedPreferences,
): ScoreBreakdown {
  return {
    price: scorePrice(offer, cheapest, mostExpensive),
    schedule: scoreSchedule(offer),
    airline: scoreAirline(offer, resolved.preferredAirlines),
    connections: scoreConnections(offer),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Explanation
// ─────────────────────────────────────────────────────────────────────────────

export function explain(
  rank: number,
  offer: SearchOffer,
  breakdown: ScoreBreakdown,
  cheapest: number,
  resolved: ResolvedPreferences,
  requestedDepartureDate?: string,
): string {
  const parts: string[] = [`Rank #${rank}`];

  if (Math.abs(offer.price.total - cheapest) < 0.01) {
    parts.push('cheapest option');
  } else {
    const pct = new Decimal(offer.price.total - cheapest)
      .dividedBy(new Decimal(cheapest))
      .times(100)
      .toFixed(0);
    parts.push(`${pct}% above cheapest`);
  }

  if (offer.itinerary.connection_count === 0) {
    parts.push('direct flight');
  } else if (offer.itinerary.connection_count === 1) {
    parts.push('1 stop');
  } else {
    parts.push(`${offer.itinerary.connection_count} stops`);
  }

  if (resolved.preferredAirlines.length > 0 && breakdown.airline >= 1.0) {
    parts.push(`on preferred airline (${offer.itinerary.segments[0]?.carrier ?? '?'})`);
  }

  const first = offer.itinerary.segments[0];
  if (first && requestedDepartureDate) {
    const offerDate = first.departure_time.slice(0, 10);
    if (offerDate !== requestedDepartureDate) {
      parts.push(`departs ${offerDate} (flexible)`);
    }
  }

  return `${parts[0]}: ${parts.slice(1).join(', ')}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
function parseHourUtc(iso: string): number | undefined {
  // Expect "YYYY-MM-DDTHH:mm:ss(Z|±hh:mm)" — extract local HH.
  const match = iso.match(/T(\d{2}):/);
  if (!match) return undefined;
  const h = parseInt(match[1]!, 10);
  if (Number.isNaN(h) || h < 0 || h > 23) return undefined;
  return h;
}

/** Expand a single date ±3 days (7 dates total), in ISO format. */
export function expandDates(center: string, flexible: boolean): string[] {
  if (!flexible) return [center];
  const base = new Date(center + 'T00:00:00Z');
  if (Number.isNaN(base.getTime())) return [center];
  const dates: string[] = [];
  for (let offset = -3; offset <= 3; offset++) {
    const d = new Date(base.getTime());
    d.setUTCDate(d.getUTCDate() + offset);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
