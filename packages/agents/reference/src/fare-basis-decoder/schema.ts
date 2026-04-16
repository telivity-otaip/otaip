/**
 * Zod schemas for FareBasisDecoder (Agent 0.3).
 */

import { z } from 'zod';

export const fareBasisDecoderInputSchema = z.object({
  fare_basis: z.string().min(1).max(15),
  carrier: z.string().min(2).max(3).optional(),
});

const cabinClassSchema = z.enum([
  'first',
  'business',
  'premium_economy',
  'economy',
  'unknown',
]);
const fareTypeSchema = z.enum([
  'normal',
  'special',
  'excursion',
  'promotional',
  'corporate',
  'unknown',
]);
const seasonSchema = z.enum(['high', 'low', 'shoulder']);
const dayOfWeekSchema = z.enum(['weekday', 'weekend']);
const stayUnitSchema = z.enum(['days', 'months']);

const advancePurchaseSchema = z.object({
  days: z.number().nullable(),
  description: z.string(),
});

const stayRequirementSchema = z.object({
  value: z.number().nullable(),
  unit: stayUnitSchema.nullable(),
  description: z.string(),
});

const farePenaltiesSchema = z.object({
  refundable: z.boolean(),
  changeable: z.boolean(),
  change_fee_applies: z.boolean(),
  description: z.string().nullable(),
});

const decodedFareBasisSchema = z.object({
  fare_basis: z.string(),
  primary_code: z.string(),
  cabin_class: cabinClassSchema,
  fare_type: fareTypeSchema,
  season: seasonSchema.nullable(),
  day_of_week: dayOfWeekSchema.nullable(),
  advance_purchase: advancePurchaseSchema.nullable(),
  min_stay: stayRequirementSchema.nullable(),
  max_stay: stayRequirementSchema.nullable(),
  penalties: farePenaltiesSchema,
  ticket_designator: z.string().nullable(),
});

export const fareBasisDecoderOutputSchema = z.object({
  decoded: decodedFareBasisSchema.nullable(),
  match_confidence: z.number().min(0).max(1),
  unparsed_segments: z.array(z.string()),
});
