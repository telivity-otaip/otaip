/**
 * Zod schemas for SelfServiceRebookingAgent (5.5).
 */

import { z } from 'zod';

const originalTicketSchema = z.object({
  ticket_number: z.string().regex(/^\d{13}$/),
  conjunction_tickets: z.array(z.string()).optional(),
  issuing_carrier: z.string().min(2).max(3),
  passenger_name: z.string(),
  record_locator: z.string().regex(/^[A-Z0-9]{6}$/),
  issue_date: z.string(),
  base_fare: z.string(),
  base_fare_currency: z.string().length(3),
  total_tax: z.string(),
  total_amount: z.string(),
  fare_basis: z.string(),
  is_refundable: z.boolean(),
  booking_date: z.string().optional(),
});

export const rebookingInputSchema = z.object({
  originalTicket: originalTicketSchema,
  newOrigin: z.string().regex(/^[A-Z]{3}$/),
  newDestination: z.string().regex(/^[A-Z]{3}$/),
  newDepartureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sameDay: z.boolean().optional(),
  maxAlternatives: z.number().int().positive().optional(),
  reason: z.enum(['voluntary', 'schedule_change', 'missed_connection', 'cancellation']),
  requestedAt: z.string().optional(),
});

const moneySchema = z.object({
  amount: z.string(),
  currency: z.string(),
});

const alternativeSchema = z.object({
  rank: z.number().int().positive(),
  newItinerary: z.any(), // SearchOffer — opaque passthrough
  changeFee: moneySchema,
  fareDifference: moneySchema,
  taxDifference: moneySchema,
  totalCost: moneySchema,
  action: z.enum(['REISSUE', 'REBOOK', 'REJECT']),
  policyRestrictions: z.array(z.string()),
});

const changeFeeRuleSchema = z.object({
  fare_basis_pattern: z.string(),
  change_fee: z.string(),
  currency: z.string(),
  free_change_hours: z.number(),
  forfeit_difference_on_downgrade: z.boolean(),
  notes: z.string(),
});

export const rebookingOutputSchema = z.object({
  alternatives: z.array(alternativeSchema),
  noAlternativesFound: z.boolean(),
  originalFarePolicy: z.object({
    isRefundable: z.boolean(),
    changeFeeRule: changeFeeRuleSchema.optional(),
  }),
});
