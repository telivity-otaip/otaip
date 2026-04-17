/**
 * Zod schemas for PnrRetrieval (Agent 3.8).
 */

import { z } from 'zod';

const retrievalSourceSchema = z.enum(['AMADEUS', 'SABRE', 'TRAVELPORT', 'NDC', 'DIRECT']);
const bookingStatusSchema = z.enum([
  'CONFIRMED',
  'CANCELLED',
  'WAITLISTED',
  'TICKETED',
  'PENDING',
  'UNKNOWN',
]);
const segmentStatusSchema = z.enum([
  'HK', 'UN', 'HL', 'TK', 'UC', 'NO', 'SS', 'GK', 'KK',
]);

export const pnrRetrievalInputSchema = z.object({
  record_locator: z.string().min(5).max(8).regex(/^[A-Z0-9]+$/),
  source: retrievalSourceSchema.optional(),
  include_pricing: z.boolean().optional(),
});

const retrievedPassengerSchema = z.object({
  pax_number: z.number().int().positive(),
  last_name: z.string(),
  first_name: z.string(),
  title: z.string().optional(),
  passenger_type: z.enum(['ADT', 'CHD', 'INF']),
  date_of_birth: z.string().optional(),
  gender: z.enum(['M', 'F']).optional(),
  frequent_flyer: z.string().optional(),
  ticket_numbers: z.array(z.string()).optional(),
});

const retrievedSegmentSchema = z.object({
  segment_number: z.number().int().positive(),
  carrier: z.string().min(2).max(3),
  flight_number: z.string(),
  origin: z.string().length(3),
  destination: z.string().length(3),
  departure_date: z.string(),
  departure_time: z.string().optional(),
  arrival_date: z.string().optional(),
  arrival_time: z.string().optional(),
  booking_class: z.string(),
  status: segmentStatusSchema,
  fare_basis: z.string().optional(),
  operating_carrier: z.string().optional(),
});

const retrievedContactSchema = z.object({
  phone: z.string().optional(),
  email: z.string().optional(),
  type: z.enum(['AGENCY', 'PASSENGER', 'EMERGENCY']),
});

const retrievedTicketingSchema = z.object({
  time_limit: z.string().optional(),
  status: z.enum(['NOT_TICKETED', 'TICKETED', 'PARTIALLY_TICKETED', 'VOID']),
});

export const pnrRetrievalOutputSchema = z.object({
  record_locator: z.string(),
  source: retrievalSourceSchema,
  booking_status: bookingStatusSchema,
  passengers: z.array(retrievedPassengerSchema),
  segments: z.array(retrievedSegmentSchema),
  contacts: z.array(retrievedContactSchema),
  ticketing: retrievedTicketingSchema,
  created_at: z.string().optional(),
  modified_at: z.string().optional(),
  remarks: z.array(z.string()).optional(),
});
