/**
 * Zod schemas for AITravelAdvisorAgent (Agent 1.8).
 */

import { z } from 'zod';

const cabinClassSchema = z.enum(['economy', 'premium_economy', 'business', 'first']);
const tripPurposeSchema = z.enum(['business', 'leisure']);

const passengerCountsSchema = z.object({
  adults: z.number().int().min(0),
  children: z.number().int().min(0).optional(),
  infants: z.number().int().min(0).optional(),
});

const scoringWeightsSchema = z.object({
  price: z.number().min(0),
  schedule: z.number().min(0),
  airline: z.number().min(0),
  connections: z.number().min(0),
});

const travelerPreferencesSchema = z.object({
  budgetMin: z.number().min(0).optional(),
  budgetMax: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  cabinClass: cabinClassSchema.optional(),
  preferredAirlines: z.array(z.string().min(2).max(3)).optional(),
  tripPurpose: tripPurposeSchema.optional(),
  passengers: passengerCountsSchema.optional(),
  maxConnections: z.number().int().min(0).optional(),
  scoringWeights: scoringWeightsSchema.optional(),
});

export const advisorInputSchema = z.object({
  origin: z.string().regex(/^[A-Z]{3}$/),
  destination: z.string().regex(/^[A-Z]{3}$/),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  flexibleDates: z.boolean().optional(),
  preferences: travelerPreferencesSchema.optional(),
  maxRecommendations: z.number().int().positive().optional(),
});

const scoreBreakdownSchema = z.object({
  price: z.number(),
  schedule: z.number(),
  airline: z.number(),
  connections: z.number(),
});

const recommendationSchema = z.object({
  rank: z.number().int().positive(),
  offer: z.any(),  // SearchOffer from @otaip/core — opaque passthrough
  score: z.number(),
  scoreBreakdown: scoreBreakdownSchema,
  explanation: z.string(),
});

const searchSummarySchema = z.object({
  totalOffersFound: z.number().int().min(0),
  totalOffersEligible: z.number().int().min(0),
  dateRangeSearched: z.array(z.string()),
  adaptersUsed: z.array(z.string()),
});

const resolvedPreferencesSchema = z.object({
  currency: z.string(),
  passengers: z.object({
    adults: z.number(),
    children: z.number(),
    infants: z.number(),
  }),
  maxConnections: z.number(),
  weights: scoringWeightsSchema,
  tripPurpose: tripPurposeSchema.optional(),
  cabinClass: cabinClassSchema.optional(),
  preferredAirlines: z.array(z.string()),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
});

export const advisorOutputSchema = z.object({
  recommendations: z.array(recommendationSchema),
  searchSummary: searchSummarySchema,
  appliedPreferences: resolvedPreferencesSchema,
});
