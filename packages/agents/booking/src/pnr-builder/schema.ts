/**
 * Zod schemas for PnrBuilder (Agent 3.2).
 */

import { z } from 'zod';

const gdsSchema = z.enum(['AMADEUS', 'SABRE', 'TRAVELPORT']);
const passengerTypeSchema = z.enum(['ADT', 'CHD', 'INF']);
const ssrCodeSchema = z.enum(['WCHR', 'VGML', 'DOCS', 'FOID', 'CTCE', 'CTCM', 'INFT']);

const pnrPassengerSchema = z.object({
  last_name: z.string().min(1),
  first_name: z.string().min(1),
  title: z.string().optional(),
  passenger_type: passengerTypeSchema,
  date_of_birth: z.string().optional(),
  gender: z.enum(['M', 'F']).optional(),
  nationality: z.string().optional(),
  passport_number: z.string().optional(),
  passport_expiry: z.string().optional(),
  passport_country: z.string().optional(),
  infant_accompanying_adult: z.number().int().min(0).optional(),
  foid: z.string().optional(),
});

const pnrSegmentSchema = z.object({
  carrier: z.string().min(2).max(3),
  flight_number: z.string(),
  booking_class: z.string(),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  origin: z.string().length(3),
  destination: z.string().length(3),
  quantity: z.number().int().positive(),
  status: z.enum(['SS', 'NN', 'GK']),
});

const pnrContactSchema = z.object({
  phone: z.string(),
  email: z.string().optional(),
  type: z.enum(['AGENCY', 'PASSENGER', 'EMERGENCY']),
});

const pnrTicketingSchema = z.object({
  time_limit: z.string(),
  type: z.enum(['TL', 'OK', 'XL']),
});

const ssrElementSchema = z.object({
  code: ssrCodeSchema,
  carrier: z.string(),
  text: z.string(),
  passenger_index: z.number().int().min(1),
  segment_index: z.number().int().min(1).optional(),
});

const osiElementSchema = z.object({
  carrier: z.string(),
  text: z.string(),
});

export const pnrBuilderInputSchema = z.object({
  gds: gdsSchema,
  passengers: z.array(pnrPassengerSchema).min(1),
  segments: z.array(pnrSegmentSchema).min(1),
  contacts: z.array(pnrContactSchema),
  ticketing: pnrTicketingSchema,
  received_from: z.string().min(1),
  ssrs: z.array(ssrElementSchema).optional(),
  osis: z.array(osiElementSchema).optional(),
  is_group: z.boolean().optional(),
  group_name: z.string().optional(),
  approvalToken: z.string().optional(),
});

const pnrCommandSchema = z.object({
  command: z.string(),
  description: z.string(),
  element_type: z.enum([
    'NAME',
    'SEGMENT',
    'CONTACT',
    'TICKETING',
    'RECEIVED_FROM',
    'SSR',
    'OSI',
    'GROUP',
    'END_TRANSACT',
  ]),
});

export const pnrBuilderOutputSchema = z.object({
  gds: gdsSchema,
  commands: z.array(pnrCommandSchema),
  passenger_count: z.number(),
  segment_count: z.number(),
  is_group: z.boolean(),
  infant_count: z.number(),
});
