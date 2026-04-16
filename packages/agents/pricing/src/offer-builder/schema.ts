/**
 * Zod schemas for OfferBuilderAgent (Agent 2.4).
 */

import { z } from 'zod';

const pricingSourceSchema = z.enum(['GDS', 'NDC', 'DIRECT']);
const offerStatusSchema = z.enum(['ACTIVE', 'EXPIRED', 'USED']);
const offerOperationSchema = z.enum([
  'buildOffer',
  'getOffer',
  'validateOffer',
  'markUsed',
  'expireOffer',
  'cleanExpired',
]);

const flightSegmentSchema = z.object({
  carrier: z.string(),
  flightNumber: z.string(),
  origin: z.string(),
  destination: z.string(),
  departureDate: z.string(),
  cabin: z.string(),
});

const taxItemSchema = z.object({
  code: z.string(),
  amount: z.string(),
  currency: z.string(),
});

const ancillaryItemSchema = z.object({
  ancillaryId: z.string(),
  amount: z.string(),
  currency: z.string(),
  description: z.string(),
});

const fareInfoSchema = z.object({
  basis: z.string(),
  cabin: z.string(),
  nuc: z.string(),
  roe: z.string(),
  baseAmount: z.string(),
  currency: z.string(),
});

const buildOfferInputSchema = z.object({
  segments: z.array(flightSegmentSchema).min(1),
  fare: fareInfoSchema,
  taxes: z.array(taxItemSchema),
  ancillaries: z.array(ancillaryItemSchema).optional(),
  passengerCount: z.number().int().positive(),
  pricingSource: pricingSourceSchema,
  ttlMinutes: z.number().int().positive().optional(),
});

export const offerBuilderInputSchema = z.object({
  operation: offerOperationSchema,
  buildInput: buildOfferInputSchema.optional(),
  offerId: z.string().optional(),
  currentTime: z.string().optional(),
});

const offerSchema = z.object({
  offerId: z.string(),
  segments: z.array(flightSegmentSchema),
  fare: z.object({
    basis: z.string(),
    cabin: z.string(),
    baseAmount: z.string(),
    currency: z.string(),
  }),
  taxes: z.array(taxItemSchema),
  ancillaries: z.array(ancillaryItemSchema),
  subtotal: z.string(),
  ancillaryTotal: z.string(),
  totalAmount: z.string(),
  currency: z.string(),
  passengerCount: z.number(),
  perPassengerTotal: z.string(),
  pricingSource: pricingSourceSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
  status: offerStatusSchema,
});

export const offerBuilderOutputSchema = z.object({
  offer: offerSchema.optional(),
  valid: z.boolean().optional(),
  reason: z.string().optional(),
  cleanedCount: z.number().optional(),
  message: z.string().optional(),
});
