/**
 * Recommendation — Types
 *
 * Agent 9.7: Accepts performance and routing audit reports and produces
 * deterministic recommendations based on threshold rules. All
 * recommendations have `auto_applicable: false` in v1.
 *
 * Read-only analytics — no side effects.
 */

import type { PerformanceReport } from '../performance-audit/types.js';
import type { RoutingReport } from '../routing-audit/types.js';

export type RecommendationType =
  | 'route_adjustment'
  | 'adapter_health'
  | 'capacity'
  | 'config_update';

export type RecommendationSeverity = 'info' | 'warning' | 'critical';

export interface Recommendation {
  type: RecommendationType;
  severity: RecommendationSeverity;
  confidence: number;
  action: string;
  supporting_data: string;
  auto_applicable: boolean;
}

export interface RecommendationInput {
  performance_report: { report: PerformanceReport };
  routing_report: { report: RoutingReport };
}

export interface RecommendationOutput {
  recommendations: Recommendation[];
}
