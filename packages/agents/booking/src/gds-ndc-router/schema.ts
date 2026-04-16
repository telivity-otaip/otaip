/**
 * Zod schemas for GdsNdcRouter (Agent 3.1).
 */

import { z } from 'zod';

const channelSchema = z.enum(['GDS', 'NDC', 'DIRECT']);
const gdsSchema = z.enum(['AMADEUS', 'SABRE', 'TRAVELPORT']);
const ndcVersionSchema = z.enum(['17.2', '18.1', '21.3']);

const routingSegmentSchema = z.object({
  marketing_carrier: z.string().min(2).max(3),
  operating_carrier: z.string().min(2).max(3).optional(),
  origin: z.string().length(3),
  destination: z.string().length(3),
  flight_number: z.string().optional(),
});

export const gdsNdcRouterInputSchema = z.object({
  segments: z.array(routingSegmentSchema).min(1),
  preferred_channel: channelSchema.optional(),
  preferred_gds: gdsSchema.optional(),
  include_fallbacks: z.boolean(),
});

const gdsPnrSegmentSchema = z.object({
  carrier: z.string(),
  flight_number: z.string(),
  origin: z.string(),
  destination: z.string(),
  booking_class: z.string(),
  date: z.string(),
  status: z.string(),
});

const gdsPnrFormatSchema = z.object({
  format: z.literal('GDS_PNR'),
  gds: gdsSchema,
  record_locator: z.string().nullable(),
  segments: z.array(gdsPnrSegmentSchema),
});

const ndcOfferItemSchema = z.object({
  carrier: z.string(),
  origin: z.string(),
  destination: z.string(),
  service_id: z.string(),
});

const ndcOrderFormatSchema = z.object({
  format: z.literal('NDC_ORDER'),
  ndc_version: ndcVersionSchema,
  order_id: z.string().nullable(),
  offer_items: z.array(ndcOfferItemSchema),
});

const channelRoutingSchema = z.object({
  primary_channel: channelSchema,
  gds_system: gdsSchema.nullable(),
  ndc_version: ndcVersionSchema.nullable(),
  ndc_provider_id: z.string().nullable(),
  fallbacks: z.array(channelSchema),
  routed_carrier: z.string(),
  codeshare_applied: z.boolean(),
  booking_format: z.enum(['GDS_PNR', 'NDC_ORDER', 'DIRECT_API']),
});

export const gdsNdcRouterOutputSchema = z.object({
  routings: z.array(channelRoutingSchema),
  unified_channel: z.boolean(),
  recommended_channel: channelSchema.nullable(),
  gds_format: gdsPnrFormatSchema.nullable(),
  ndc_format: ndcOrderFormatSchema.nullable(),
});
