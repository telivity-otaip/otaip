/**
 * Zod schemas for HotelCarSearchAgent (Agent 1.7).
 */

import { z } from 'zod';

const carCategorySchema = z.enum([
  'ECONOMY', 'COMPACT', 'MIDSIZE', 'FULLSIZE', 'SUV', 'LUXURY', 'VAN',
]);

const hotelSortBySchema = z.enum(['price', 'rating', 'name']);
const carSortBySchema = z.enum(['price', 'category']);

const hotelSearchInputSchema = z.object({
  destination: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rooms: z.number().int().positive(),
  adults: z.number().int().positive(),
  children: z.number().int().min(0).optional(),
  starRating: z.number().int().min(1).max(5).optional(),
  maxRatePerNight: z.string().optional(),
  currency: z.string().length(3).optional(),
  sortBy: hotelSortBySchema.optional(),
  maxResults: z.number().int().positive().optional(),
});

const carSearchInputSchema = z.object({
  pickupLocation: z.string().min(1),
  dropoffLocation: z.string().optional(),
  pickupDateTime: z.string(),
  dropoffDateTime: z.string(),
  driverAge: z.number().int().min(16).optional(),
  carCategory: carCategorySchema.optional(),
  sortBy: carSortBySchema.optional(),
  maxResults: z.number().int().positive().optional(),
});

export const hotelCarSearchInputSchema = z
  .object({
    operation: z.enum(['searchHotels', 'searchCars']),
    hotel: hotelSearchInputSchema.optional(),
    car: carSearchInputSchema.optional(),
  })
  .refine(
    (d) => (d.operation === 'searchHotels' ? d.hotel !== undefined : d.car !== undefined),
    { message: 'operation-specific input (hotel or car) is required' },
  );

const hotelOfferSchema = z.object({
  hotelId: z.string(),
  name: z.string(),
  starRating: z.number(),
  ratePerNight: z.string(),
  currency: z.string(),
  roomType: z.string(),
  cancellationPolicy: z.string(),
  source: z.string(),
});

const carOfferSchema = z.object({
  carId: z.string(),
  category: carCategorySchema,
  supplier: z.string(),
  dailyRate: z.string(),
  totalRate: z.string(),
  currency: z.string(),
  features: z.array(z.string()),
  source: z.string(),
});

const adapterSummarySchema = z.object({
  adapter: z.string(),
  offerCount: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  error: z.string().optional(),
});

const hotelSearchOutputSchema = z.object({
  hotels: z.array(hotelOfferSchema),
  currency: z.string(),
  noAdaptersConfigured: z.boolean(),
  adapterSummary: z.array(adapterSummarySchema).optional(),
});

const carSearchOutputSchema = z.object({
  cars: z.array(carOfferSchema),
  currency: z.string(),
  noAdaptersConfigured: z.boolean(),
  adapterSummary: z.array(adapterSummarySchema).optional(),
});

export const hotelCarSearchOutputSchema = z.object({
  hotelResults: hotelSearchOutputSchema.optional(),
  carResults: carSearchOutputSchema.optional(),
});
