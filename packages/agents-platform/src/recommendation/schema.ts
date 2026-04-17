/**
 * Zod schemas for Recommendation (Agent 9.7).
 */

import { z } from 'zod';
import { performanceReportSchema } from '../performance-audit/schema.js';
import { routingReportSchema } from '../routing-audit/schema.js';

export const recommendationInputSchema = z.object({
  performance_report: z.object({ report: performanceReportSchema }),
  routing_report: z.object({ report: routingReportSchema }),
});

const recommendationItemSchema = z.object({
  type: z.enum(['route_adjustment', 'adapter_health', 'capacity', 'config_update']),
  severity: z.enum(['info', 'warning', 'critical']),
  confidence: z.number().min(0).max(1),
  action: z.string(),
  supporting_data: z.string(),
  auto_applicable: z.boolean(),
});

export const recommendationOutputSchema = z.object({
  recommendations: z.array(recommendationItemSchema),
});
