/**
 * Zod schemas for PerformanceAudit (Agent 9.5).
 */

import { z } from 'zod';

export const performanceAuditInputSchema = z.object({
  time_window: z.object({
    from: z.string(),
    to: z.string(),
  }),
  filters: z
    .object({
      agent_id: z.string().optional(),
      adapter_id: z.string().optional(),
    })
    .optional(),
});

export const performanceReportSchema = z.object({
  total_executions: z.number().int().nonnegative(),
  success_rate: z.number().min(0).max(1),
  avg_duration_ms: z.number().nonnegative(),
  p95_duration_ms: z.number().nonnegative(),
  p99_duration_ms: z.number().nonnegative(),
  error_rate: z.number().min(0).max(1),
  degraded_agents: z.array(z.string()),
});

export const performanceAuditOutputSchema = z.object({
  report: performanceReportSchema,
});
