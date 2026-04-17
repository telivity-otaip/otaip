/**
 * Zod schemas for Alert (Agent 9.8).
 */

import { z } from 'zod';

export const alertInputSchema = z.object({
  time_window: z.object({
    from: z.string(),
    to: z.string(),
  }),
  thresholds: z
    .object({
      gds_error_rate_warning: z.number().optional(),
      gds_error_rate_critical: z.number().optional(),
      ndc_error_rate_warning: z.number().optional(),
      ndc_error_rate_critical: z.number().optional(),
      latency_p95_warning_ms: z.number().optional(),
      consecutive_failures_critical: z.number().optional(),
      pipeline_rejection_rate_warning: z.number().optional(),
    })
    .optional(),
});

const alertItemSchema = z.object({
  id: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  type: z.string(),
  message: z.string(),
  threshold: z.number(),
  actual: z.number(),
  triggered_at: z.string(),
});

export const alertOutputSchema = z.object({
  alerts: z.array(alertItemSchema),
});
