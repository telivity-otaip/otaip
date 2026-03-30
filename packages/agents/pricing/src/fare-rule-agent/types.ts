/**
 * Fare Rule Agent — Input/Output types
 *
 * Agent 2.1: Parses ATPCO fare rules (categories 1-20) into
 * human-readable structured format.
 */

export interface FareRuleInput {
  /** Fare basis code to look up */
  fare_basis: string;
  /** Marketing carrier IATA code */
  carrier: string;
  /** Origin airport IATA code */
  origin: string;
  /** Destination airport IATA code */
  destination: string;
  /** Travel date (ISO 8601 YYYY-MM-DD) for date-based rule filtering */
  travel_date?: string;
  /** Specific ATPCO categories to return (1-20). If omitted, return all. */
  categories?: number[];
}

export interface MoneyAmount {
  amount: string;
  currency: string;
}

export interface AdvancePurchaseRule {
  min_days: number;
}

export interface MinimumStayRule {
  min_days: number;
  saturday_night_required: boolean;
}

export interface MaximumStayRule {
  max_months: number;
}

export interface BlackoutPeriod {
  from: string;
  to: string;
}

export interface SeasonalityRule {
  season: string;
  valid_from: string;
  valid_to: string;
  blackout_dates: BlackoutPeriod[];
}

export interface PenaltyRule {
  refundable: boolean;
  changeable: boolean;
  change_fee: MoneyAmount | null;
  no_show_fee: MoneyAmount | null;
}

export interface FareRuleCategory {
  /** ATPCO category number */
  category_number: number;
  /** Category name */
  name: string;
  /** Human-readable rule text */
  text: string;
  /** Structured data (varies by category) */
  structured: Record<string, unknown> | null;
}

export interface FareRuleResult {
  /** Rule ID from the tariff database */
  rule_id: string;
  /** Carrier */
  carrier: string;
  /** Fare basis code */
  fare_basis: string;
  /** Market */
  market: { origin: string; destination: string };
  /** ATPCO tariff number */
  tariff: string;
  /** Rule number */
  rule_number: string;
  /** Effective date */
  effective_date: string;
  /** Discontinue date */
  discontinue_date: string;
  /** Parsed categories */
  categories: FareRuleCategory[];
  /** Quick-access penalty summary */
  penalty_summary: PenaltyRule | null;
  /** Quick-access advance purchase summary */
  advance_purchase: AdvancePurchaseRule | null;
  /** Quick-access minimum stay */
  minimum_stay: MinimumStayRule | null;
  /** Quick-access maximum stay */
  maximum_stay: MaximumStayRule | null;
  /** Quick-access seasonality */
  seasonality: SeasonalityRule | null;
}

export interface FareRuleOutput {
  /** Matched fare rules */
  rules: FareRuleResult[];
  /** Total rules found */
  total_rules: number;
  /** Whether the fare is valid for the given travel date */
  valid_for_date: boolean | null;
  /** Whether travel date falls in a blackout period */
  in_blackout: boolean | null;
}
