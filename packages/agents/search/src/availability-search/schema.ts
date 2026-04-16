/**
 * Zod schemas for AvailabilitySearch (Agent 1.1).
 */

import { z } from 'zod';

const passengerTypeSchema = z.enum(['ADT', 'CHD', 'INF', 'UNN', 'STU', 'YTH']);

const passengerCountSchema = z.object({
  type: passengerTypeSchema,
  count: z.number().int().min(1),
});

const cabinClassSchema = z.enum(['economy', 'premium_economy', 'business', 'first']);
const sortFieldSchema = z.enum([
  'price',
  'duration',
  'departure',
  'arrival',
  'connections',
]);
const sortOrderSchema = z.enum(['asc', 'desc']);

export const availabilitySearchInputSchema = z.object({
  origin: z.string().length(3),
  destination: z.string().length(3),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  passengers: z.array(passengerCountSchema).min(1),
  cabin_class: cabinClassSchema.optional(),
  direct_only: z.boolean().optional(),
  max_connections: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  max_results: z.number().int().positive().optional(),
  sort_by: sortFieldSchema.optional(),
  sort_order: sortOrderSchema.optional(),
  sources: z.array(z.string()).optional(),
});

const flightSegmentSchema = z.object({
  carrier: z.string(),
  flight_number: z.string(),
  operating_carrier: z.string().optional(),
  origin: z.string(),
  destination: z.string(),
  departure_time: z.string(),
  arrival_time: z.string(),
  duration_minutes: z.number(),
  aircraft: z.string().optional(),
  booking_class: z.string().optional(),
  cabin_class: cabinClassSchema.optional(),
  stops: z.number().optional(),
});

const itinerarySchema = z.object({
  source_id: z.string(),
  source: z.string(),
  segments: z.array(flightSegmentSchema),
  total_duration_minutes: z.number(),
  connection_count: z.number(),
});

const perPassengerPriceSchema = z.object({
  type: passengerTypeSchema,
  base_fare: z.number(),
  taxes: z.number(),
  total: z.number(),
});

const priceBreakdownSchema = z.object({
  base_fare: z.number(),
  taxes: z.number(),
  total: z.number(),
  currency: z.string(),
  per_passenger: z.array(perPassengerPriceSchema).optional(),
});

const searchOfferSchema = z.object({
  offer_id: z.string(),
  source: z.string(),
  itinerary: itinerarySchema,
  price: priceBreakdownSchema,
  fare_basis: z.array(z.string()).optional(),
  booking_classes: z.array(z.string()).optional(),
  instant_ticketing: z.boolean().optional(),
  expires_at: z.string().optional(),
});

const sourceStatusSchema = z.object({
  source: z.string(),
  success: z.boolean(),
  offer_count: z.number(),
  error: z.string().optional(),
  response_time_ms: z.number(),
});

export const availabilitySearchOutputSchema = z.object({
  offers: z.array(searchOfferSchema),
  total_raw_offers: z.number(),
  source_status: z.array(sourceStatusSchema),
  truncated: z.boolean(),
});
