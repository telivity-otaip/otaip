/**
 * Zod schemas for FareRuleAgent (Agent 2.1).
 */

import { z } from 'zod';

export const fareRuleInputSchema = z.object({
  fare_basis: z.string().min(1).max(15),
  carrier: z.string().min(2).max(3),
  origin: z.string().length(3),
  destination: z.string().length(3),
  travel_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categories: z.array(z.number().int().min(1).max(20)).optional(),
});

const moneySchema = z.object({
  amount: z.string(),
  currency: z.string(),
});

const advancePurchaseRuleSchema = z.object({ min_days: z.number() });
const minimumStayRuleSchema = z.object({
  min_days: z.number(),
  saturday_night_required: z.boolean(),
});
const maximumStayRuleSchema = z.object({ max_months: z.number() });
const blackoutPeriodSchema = z.object({ from: z.string(), to: z.string() });
const seasonalityRuleSchema = z.object({
  season: z.string(),
  valid_from: z.string(),
  valid_to: z.string(),
  blackout_dates: z.array(blackoutPeriodSchema),
});
const penaltyRuleSchema = z.object({
  refundable: z.boolean(),
  changeable: z.boolean(),
  change_fee: moneySchema.nullable(),
  no_show_fee: moneySchema.nullable(),
});

const fareRuleCategorySchema = z.object({
  category_number: z.number(),
  name: z.string(),
  text: z.string(),
  structured: z.record(z.string(), z.unknown()).nullable(),
});

const fareRuleResultSchema = z.object({
  rule_id: z.string(),
  carrier: z.string(),
  fare_basis: z.string(),
  market: z.object({ origin: z.string(), destination: z.string() }),
  tariff: z.string(),
  rule_number: z.string(),
  effective_date: z.string(),
  discontinue_date: z.string(),
  categories: z.array(fareRuleCategorySchema),
  penalty_summary: penaltyRuleSchema.nullable(),
  advance_purchase: advancePurchaseRuleSchema.nullable(),
  minimum_stay: minimumStayRuleSchema.nullable(),
  maximum_stay: maximumStayRuleSchema.nullable(),
  seasonality: seasonalityRuleSchema.nullable(),
});

export const fareRuleOutputSchema = z.object({
  rules: z.array(fareRuleResultSchema),
  total_rules: z.number(),
  valid_for_date: z.boolean().nullable(),
  in_blackout: z.boolean().nullable(),
});
