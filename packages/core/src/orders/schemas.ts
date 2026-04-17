/**
 * Zod schemas for the Offers & Orders data model.
 *
 * Single source of truth for runtime validation and JSON Schema
 * generation (via zodToJsonSchema). Every type in types.ts has a
 * corresponding schema here.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Money
// ─────────────────────────────────────────────────────────────────────────────

export const moneySchema = z.object({
  amount: z.string(),
  currencyCode: z.string().length(3),
});

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export const serviceTypeSchema = z.enum([
  'flight', 'seat', 'baggage', 'meal', 'lounge', 'insurance', 'ancillary',
]);

export const flightServiceSchema = z.object({
  marketingCarrier: z.string().min(2).max(3),
  flightNumber: z.string(),
  operatingCarrier: z.string().min(2).max(3).optional(),
  origin: z.string().length(3),
  destination: z.string().length(3),
  departureDateTime: z.string(),
  arrivalDateTime: z.string(),
  durationMinutes: z.number().int().positive(),
  cabinClass: z.enum(['economy', 'premium_economy', 'business', 'first']).optional(),
  bookingClass: z.string().optional(),
  fareBasis: z.string().optional(),
});

export const serviceSchema = z.object({
  serviceId: z.string(),
  type: serviceTypeSchema,
  flight: flightServiceSchema.optional(),
  description: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Passenger
// ─────────────────────────────────────────────────────────────────────────────

export const passengerTypeCodeSchema = z.enum(['ADT', 'CHD', 'INF']);

export const travelDocumentSchema = z.object({
  documentType: z.enum(['passport', 'national_id', 'visa']),
  documentNumber: z.string(),
  issuingCountry: z.string().length(2),
  expiryDate: z.string(),
  nationality: z.string().length(2),
});

export const loyaltyInfoSchema = z.object({
  programCode: z.string(),
  memberNumber: z.string(),
  tierLevel: z.string().optional(),
});

export const orderPassengerSchema = z.object({
  passengerId: z.string(),
  passengerType: passengerTypeCodeSchema,
  givenName: z.string().min(1),
  surname: z.string().min(1),
  title: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['Male', 'Female', 'Undisclosed']).optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  travelDocument: travelDocumentSchema.optional(),
  loyaltyProgram: loyaltyInfoSchema.optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Offer
// ─────────────────────────────────────────────────────────────────────────────

export const fareDetailSchema = z.object({
  fareBasis: z.string(),
  fareType: z.enum(['published', 'negotiated', 'private', 'web']).optional(),
  refundable: z.boolean().optional(),
  changeable: z.boolean().optional(),
  baggageAllowance: z.string().optional(),
});

export const offerItemSchema = z.object({
  offerItemId: z.string(),
  services: z.array(serviceSchema),
  price: moneySchema,
  passengerRefs: z.array(z.string()).optional(),
  fareDetail: fareDetailSchema.optional(),
});

export const offerSchema = z.object({
  offerId: z.string(),
  owner: z.string().min(2).max(3),
  offerItems: z.array(offerItemSchema).min(1),
  totalPrice: moneySchema,
  expiresAt: z.string(),
  paymentTimelimit: z.string().optional(),
  source: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Order
// ─────────────────────────────────────────────────────────────────────────────

export const orderStatusSchema = z.enum([
  'pending', 'confirmed', 'ticketed', 'partially_ticketed', 'cancelled', 'completed',
]);

export const orderItemStatusSchema = z.enum([
  'pending', 'confirmed', 'ticketed', 'cancelled', 'flown', 'refunded',
]);

export const orderItemSchema = z.object({
  orderItemId: z.string(),
  offerItemRef: z.string(),
  services: z.array(serviceSchema),
  status: orderItemStatusSchema,
  price: moneySchema,
});

export const ticketDocumentSchema = z.object({
  ticketNumber: z.string(),
  documentType: z.enum(['ET', 'EMD_A', 'EMD_S']),
  passengerRef: z.string(),
  couponNumbers: z.array(z.number().int().positive()),
  issueDate: z.string(),
});

export const orderPaymentSchema = z.object({
  paymentId: z.string(),
  method: z.enum(['credit_card', 'cash', 'invoice', 'other']),
  amount: moneySchema,
  status: z.enum(['pending', 'completed', 'failed', 'refunded']),
  processedAt: z.string().optional(),
});

export const orderSchema = z.object({
  orderId: z.string(),
  owner: z.string().min(2).max(3),
  orderItems: z.array(orderItemSchema),
  passengers: z.array(orderPassengerSchema),
  payments: z.array(orderPaymentSchema),
  status: orderStatusSchema,
  ticketDocuments: z.array(ticketDocumentSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  source: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// OrderChange
// ─────────────────────────────────────────────────────────────────────────────

export const orderChangeTypeSchema = z.enum(['add', 'remove', 'modify']);

export const orderChangeSchema = z.object({
  type: orderChangeTypeSchema,
  orderItemId: z.string().optional(),
  newServices: z.array(serviceSchema).optional(),
  reason: z.string().optional(),
});

export const orderChangeRequestSchema = z.object({
  orderId: z.string(),
  changes: z.array(orderChangeSchema).min(1),
});

// ─────────────────────────────────────────────────────────────────────────────
// Order Events
// ─────────────────────────────────────────────────────────────────────────────

export const orderEventTypeSchema = z.enum([
  'order.created', 'order.confirmed', 'order.ticketed',
  'order.changed', 'order.cancelled', 'order.payment_received',
  'order.payment_failed', 'order.refunded',
]);

export const orderEventSchema = z.object({
  eventId: z.string(),
  type: orderEventTypeSchema,
  orderId: z.string(),
  timestamp: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});
