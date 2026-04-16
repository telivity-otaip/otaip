/**
 * Zod schemas for TicketIssuance (Agent 4.1).
 */

import { z } from 'zod';

const couponStatusSchema = z.enum(['O', 'A', 'E', 'R', 'V', 'C', 'L', 'S']);
const fopTypeSchema = z.enum(['CASH', 'CREDIT_CARD', 'INVOICE', 'MISCELLANEOUS']);

const formOfPaymentSchema = z.object({
  type: fopTypeSchema,
  card_code: z.string().optional(),
  card_last_four: z.string().optional(),
  approval_code: z.string().optional(),
  amount: z.string(),
  currency: z.string().length(3),
});

const taxBreakdownItemSchema = z.object({
  code: z.string(),
  amount: z.string(),
  currency: z.string().length(3),
});

const commissionDataSchema = z.object({
  type: z.enum(['PERCENTAGE', 'FLAT']),
  rate: z.string(),
  amount: z.string(),
  currency: z.string().length(3),
});

const bspReportingFieldsSchema = z.object({
  settlement_code: z.string().optional(),
  remittance_currency: z.string().length(3),
  billing_period: z.string().optional(),
  reporting_office_id: z.string().optional(),
});

const ticketIssuanceSegmentSchema = z.object({
  carrier: z.string().min(2).max(3),
  flight_number: z.string(),
  origin: z.string().length(3),
  destination: z.string().length(3),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departure_time: z.string().optional(),
  booking_class: z.string(),
  fare_basis: z.string(),
  not_valid_before: z.string().optional(),
  not_valid_after: z.string().optional(),
  baggage_allowance: z.string().optional(),
});

export const ticketIssuanceInputSchema = z.object({
  record_locator: z.string().min(1),
  issuing_carrier: z.string().min(2).max(3),
  passenger_name: z.string().min(1),
  segments: z.array(ticketIssuanceSegmentSchema).min(1),
  base_fare: z.string(),
  base_fare_currency: z.string().length(3),
  equivalent_fare: z.string().optional(),
  equivalent_fare_currency: z.string().length(3).optional(),
  taxes: z.array(taxBreakdownItemSchema),
  fare_calculation: z.string(),
  form_of_payment: formOfPaymentSchema,
  endorsements: z.string().optional(),
  commission: commissionDataSchema.optional(),
  bsp_reporting: bspReportingFieldsSchema.optional(),
  issue_date: z.string().optional(),
  ticket_number_prefix: z.string().length(3).optional(),
  original_issue: z.string().optional(),
  approvalToken: z.string().optional(),
});

const ticketSegmentSchema = ticketIssuanceSegmentSchema.extend({
  coupon_number: z.number().int().positive(),
  status: couponStatusSchema,
});

const ticketRecordSchema = z.object({
  ticket_number: z.string(),
  conjunction_suffix: z.string().optional(),
  record_locator: z.string(),
  issuing_carrier: z.string(),
  issue_date: z.string(),
  passenger_name: z.string(),
  coupons: z.array(ticketSegmentSchema),
  base_fare: z.string(),
  base_fare_currency: z.string(),
  equivalent_fare: z.string().optional(),
  equivalent_fare_currency: z.string().optional(),
  total_tax: z.string(),
  taxes: z.array(taxBreakdownItemSchema),
  total_amount: z.string(),
  fare_calculation: z.string(),
  form_of_payment: formOfPaymentSchema,
  endorsements: z.string().optional(),
  commission: commissionDataSchema.optional(),
  bsp_reporting: bspReportingFieldsSchema.optional(),
  original_issue: z.string().optional(),
});

export const ticketIssuanceOutputSchema = z.object({
  tickets: z.array(ticketRecordSchema).min(1),
  total_coupons: z.number(),
  is_conjunction: z.boolean(),
});
