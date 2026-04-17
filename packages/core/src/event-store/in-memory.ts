/**
 * In-memory EventStore implementation.
 *
 * Array-backed, single-process, zero-config. Suitable for development,
 * testing, and lightweight demos. Production deployments should use an
 * external store adapter (Postgres, Supabase, Redis — built later).
 *
 * Events are stored in insertion order. `query()` does a linear scan
 * with filter predicates. `aggregate()` computes percentiles via sort.
 */

import type {
  AggregateResult,
  EventFilter,
  EventStore,
  OtaipEvent,
  OtaipEventType,
  TimeWindow,
} from './types.js';

export class InMemoryEventStore implements EventStore {
  private readonly events: OtaipEvent[] = [];
  private readonly seen = new Set<string>();

  async append(event: OtaipEvent): Promise<void> {
    // Idempotent on eventId.
    if (this.seen.has(event.eventId)) return;
    this.seen.add(event.eventId);
    this.events.push(event);
  }

  async query(filter: EventFilter): Promise<OtaipEvent[]> {
    let results = this.events.filter((e) => matchesFilter(e, filter));
    // Sorted by timestamp ascending (insertion order should already be
    // chronological, but sort to be safe).
    results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (filter.limit !== undefined && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }
    return results;
  }

  async aggregate(
    metric: string,
    window: TimeWindow,
    filter?: Omit<EventFilter, 'window'>,
  ): Promise<AggregateResult> {
    const events = await this.query({ ...filter, window });
    const values: number[] = [];
    for (const event of events) {
      const v = (event as unknown as Record<string, unknown>)[metric];
      if (typeof v === 'number') values.push(v);
    }

    if (values.length === 0) {
      return { metric, window, count: 0 };
    }

    values.sort((a, b) => a - b);
    const sum = values.reduce((s, v) => s + v, 0);

    return {
      metric,
      window,
      count: values.length,
      sum,
      avg: sum / values.length,
      min: values[0],
      max: values[values.length - 1],
      p50: percentile(values, 50),
      p95: percentile(values, 95),
      p99: percentile(values, 99),
    };
  }

  /** Total events stored. */
  get size(): number {
    return this.events.length;
  }

  /** Clear all events (useful in tests). */
  clear(): void {
    this.events.length = 0;
    this.seen.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function matchesFilter(event: OtaipEvent, filter: EventFilter): boolean {
  if (filter.type !== undefined) {
    const types: readonly OtaipEventType[] = Array.isArray(filter.type)
      ? filter.type
      : [filter.type];
    if (!types.includes(event.type)) return false;
  }
  if (filter.sessionId !== undefined && event.sessionId !== filter.sessionId) return false;
  if (filter.agentId !== undefined) {
    if (!('agentId' in event) || (event as { agentId: string }).agentId !== filter.agentId) {
      return false;
    }
  }
  if (filter.adapterId !== undefined) {
    if (!('adapterId' in event) || (event as { adapterId: string }).adapterId !== filter.adapterId) {
      return false;
    }
  }
  if (filter.window !== undefined) {
    if (event.timestamp < filter.window.from || event.timestamp >= filter.window.to) {
      return false;
    }
  }
  return true;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = ((p / 100) * (sorted.length - 1));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}
