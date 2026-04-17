/**
 * Zod schemas for RoutingAudit (Agent 9.6).
 */

import { z } from 'zod';

export const routingAuditInputSchema = z.object({
  time_window: z.object({
    from: z.string(),
    to: z.string(),
  }),
});

const channelStatsSchema = z.object({
  decisions: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
});

export const routingReportSchema = z.object({
  total_decisions: z.number().int().nonnegative(),
  success_rate: z.number().min(0).max(1),
  fallback_rate: z.number().min(0).max(1),
  channel_breakdown: z.record(z.string(), channelStatsSchema),
});

export const routingAuditOutputSchema = z.object({
  report: routingReportSchema,
});
