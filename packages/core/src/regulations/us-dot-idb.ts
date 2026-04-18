/**
 * US DOT 14 CFR Part 250 — Oversales / denied boarding compensation.
 *
 * Effective 2025-01-22. APPLIES ONLY TO INVOLUNTARY DENIED BOARDING due to
 * oversales — does NOT cover delays or cancellations.
 *
 * Source: 14 CFR §250.5 — "Amount of denied boarding compensation."
 * https://www.ecfr.gov/current/title-14/chapter-II/subchapter-A/part-250
 *
 * Constants below are PUBLISHED LAW. They are stable until DOT amends the rule.
 */

import Decimal from 'decimal.js';

export interface UsDotIdbBand {
  /** Inclusive upper bound on substitute-transport arrival lateness (minutes). */
  maxLateMinutes: number;
  /** Multiplier applied to the one-way fare. */
  multiplier: number;
  /** Maximum compensation cap in USD (0 means no compensation). */
  capUsd: number;
}

/** Domestic flights (within the United States). */
export const US_DOT_IDB_DOMESTIC: readonly UsDotIdbBand[] = [
  { maxLateMinutes: 60, multiplier: 0, capUsd: 0 },
  { maxLateMinutes: 120, multiplier: 2, capUsd: 1075 },
  { maxLateMinutes: Number.POSITIVE_INFINITY, multiplier: 4, capUsd: 2150 },
];

/** International flights to/from the United States. */
export const US_DOT_IDB_INTERNATIONAL: readonly UsDotIdbBand[] = [
  { maxLateMinutes: 60, multiplier: 0, capUsd: 0 },
  { maxLateMinutes: 240, multiplier: 2, capUsd: 1075 },
  { maxLateMinutes: Number.POSITIVE_INFINITY, multiplier: 4, capUsd: 2150 },
];

export interface UsDotIdbInput {
  /** True for flights wholly within the US; false for international. */
  isDomestic: boolean;
  /**
   * Lateness of the substitute transport's arrival vs. originally scheduled
   * arrival, in minutes. If the carrier offers no rerouting at all, pass
   * Infinity to land in the highest band.
   */
  substituteArrivalLateMinutes: number;
  /** One-way fare actually paid for the affected segment, in USD. */
  oneWayFareUsd: string | number;
}

export interface UsDotIdbResult {
  eligible: boolean;
  /** Compensation amount in USD (Decimal-safe string). */
  compensationUsd: string;
  /** The matched band, for audit. */
  band: UsDotIdbBand;
  /** Plain-English explanation. */
  reason: string;
}

function bandFor(
  table: readonly UsDotIdbBand[],
  lateMinutes: number,
): UsDotIdbBand {
  for (const band of table) {
    if (lateMinutes <= band.maxLateMinutes) return band;
  }
  return table[table.length - 1]!;
}

/**
 * Compute denied-boarding compensation under 14 CFR §250.5.
 *
 * Pure function: callers are responsible for confirming this was an
 * involuntary denied-boarding due to oversales, not a delay or cancel.
 */
export function applyUsDotIdb(input: UsDotIdbInput): UsDotIdbResult {
  const table = input.isDomestic ? US_DOT_IDB_DOMESTIC : US_DOT_IDB_INTERNATIONAL;
  const band = bandFor(table, input.substituteArrivalLateMinutes);
  const fare = new Decimal(input.oneWayFareUsd);

  if (band.multiplier === 0) {
    return {
      eligible: false,
      compensationUsd: '0.00',
      band,
      reason: `Substitute transport arrives within ${band.maxLateMinutes}min — no compensation owed under 14 CFR §250.5(a).`,
    };
  }

  const raw = fare.mul(band.multiplier);
  const capped = Decimal.min(raw, new Decimal(band.capUsd));
  return {
    eligible: true,
    compensationUsd: capped.toFixed(2),
    band,
    reason: `${band.multiplier * 100}% of one-way fare ($${fare.toFixed(2)}), capped at $${band.capUsd}. ${input.isDomestic ? 'Domestic' : 'International'} substitute lateness ${input.substituteArrivalLateMinutes}min.`,
  };
}
