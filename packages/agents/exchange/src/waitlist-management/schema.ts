/**
 * Zod schemas for WaitlistManagementAgent (5.6).
 */

import { z } from 'zod';

const waitlistSegmentSchema = z.object({
  carrier: z.string().regex(/^[A-Z0-9]{2}$/),
  flightNumber: z.string().min(1),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bookingClass: z.string().min(1),
});

const statusTierSchema = z.enum(['general', 'silver', 'gold', 'platinum']);
const fareClassTypeSchema = z.enum(['full_fare', 'discount']);

const addEntryInputSchema = z.object({
  entryId: z.string().min(1),
  bookingReference: z.string().min(1),
  segment: waitlistSegmentSchema,
  statusTier: statusTierSchema,
  fareClass: z.string().min(1),
  fareClassType: fareClassTypeSchema,
  requestedAt: z.string().optional(),
  cutoffBeforeDepartureHours: z.number().min(0).optional(),
});

const clearInputSchema = z.object({
  segment: waitlistSegmentSchema,
  seatsAvailable: z.number().int().min(0),
  clearTime: z.string().optional(),
});

const queryStatusInputSchema = z.object({
  entryId: z.string().min(1),
  historicalClearanceRates: z.record(z.string(), z.number().min(0).max(1)).optional(),
});

const expireInputSchema = z.object({
  currentTime: z.string().optional(),
});

export const waitlistInputSchema = z
  .object({
    operation: z.enum(['addEntry', 'clear', 'queryStatus', 'expire']),
    addEntry: addEntryInputSchema.optional(),
    clear: clearInputSchema.optional(),
    queryStatus: queryStatusInputSchema.optional(),
    expire: expireInputSchema.optional(),
  })
  .refine((d) => {
    if (d.operation === 'addEntry') return d.addEntry !== undefined;
    if (d.operation === 'clear') return d.clear !== undefined;
    if (d.operation === 'queryStatus') return d.queryStatus !== undefined;
    return true; // expire allows missing input (uses defaults)
  }, { message: 'operation-specific input required for addEntry, clear, and queryStatus' });

const waitlistEntrySchema = z.object({
  entryId: z.string(),
  bookingReference: z.string(),
  segment: waitlistSegmentSchema,
  statusTier: statusTierSchema,
  fareClass: z.string(),
  fareClassType: fareClassTypeSchema,
  requestedAt: z.string(),
  cutoffBeforeDepartureHours: z.number(),
  priorityScore: z.number(),
});

const clearResultSchema = z.object({
  cleared: z.array(waitlistEntrySchema),
  remaining: z.array(waitlistEntrySchema),
});

const queryStatusResultSchema = z.object({
  entry: waitlistEntrySchema.nullable(),
  position: z.number().int().min(0).nullable(),
  estimatedClearanceProbability: z.number().nullable(),
  willExpireAt: z.string().nullable(),
});

const expireResultSchema = z.object({
  expired: z.array(waitlistEntrySchema),
  remaining: z.number().int().min(0),
});

export const waitlistOutputSchema = z.object({
  operation: z.enum(['addEntry', 'clear', 'queryStatus', 'expire']),
  entryId: z.string().optional(),
  entry: waitlistEntrySchema.optional(),
  clearResult: clearResultSchema.optional(),
  statusResult: queryStatusResultSchema.optional(),
  expireResult: expireResultSchema.optional(),
});
