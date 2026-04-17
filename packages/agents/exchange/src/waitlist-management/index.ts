/**
 * Waitlist Management — Agent 5.6
 *
 * Stateful in-memory queue manager for passenger waitlists.
 *
 * Operations:
 *   - addEntry     Add a waitlisted passenger (priority computed at add time)
 *   - clear        Given N seats opened on a segment, remove top-N by priority
 *   - queryStatus  Return 1-based position + estimated clearance probability
 *   - expire       Prune entries past their cutoff window
 *
 * State is in-memory only — not durable across restarts. Same
 * reference-implementation pattern as MockOtaAdapter and
 * NavitaireOrderOperations. Production deployments should pair this
 * agent with a durable persistence layer (out of scope here).
 */

import type { Agent, AgentHealthStatus, AgentInput, AgentOutput } from '@otaip/core';
import { AgentInputValidationError, AgentNotInitializedError } from '@otaip/core';
import {
  computeExpiryAt,
  computePriorityScore,
  resolveClearanceRate,
  segmentKey,
} from './priority.js';
import type {
  AddEntryInput,
  ClearInput,
  ClearResult,
  ExpireInput,
  ExpireResult,
  QueryStatusInput,
  QueryStatusResult,
  WaitlistEntry,
  WaitlistInput,
  WaitlistOperation,
  WaitlistOutput,
} from './types.js';

const VALID_OPERATIONS: WaitlistOperation[] = ['addEntry', 'clear', 'queryStatus', 'expire'];
const VALID_STATUSES = new Set(['general', 'silver', 'gold', 'platinum']);
const VALID_CLASS_TYPES = new Set(['full_fare', 'discount']);
const CARRIER_RE = /^[A-Z0-9]{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class WaitlistManagementAgent implements Agent<WaitlistInput, WaitlistOutput> {
  readonly id = '5.6';
  readonly name = 'Waitlist Management';
  readonly version = '0.2.0';

  private initialized = false;

  /** entryId → entry */
  private readonly entries = new Map<string, WaitlistEntry>();

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(input: AgentInput<WaitlistInput>): Promise<AgentOutput<WaitlistOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);
    const d = input.data;

    if (!VALID_OPERATIONS.includes(d.operation)) {
      throw new AgentInputValidationError(
        this.id,
        'operation',
        `Must be one of: ${VALID_OPERATIONS.join(', ')}.`,
      );
    }

    switch (d.operation) {
      case 'addEntry': {
        if (!d.addEntry) {
          throw new AgentInputValidationError(this.id, 'addEntry', 'Required for addEntry operation.');
        }
        const entry = this.addEntry(d.addEntry);
        return {
          data: { operation: 'addEntry', entryId: entry.entryId, entry },
          confidence: 1.0,
          metadata: { agent_id: this.id, priorityScore: entry.priorityScore },
        };
      }
      case 'clear': {
        if (!d.clear) {
          throw new AgentInputValidationError(this.id, 'clear', 'Required for clear operation.');
        }
        const clearResult = this.clear(d.clear);
        return {
          data: { operation: 'clear', clearResult },
          confidence: 1.0,
          metadata: { agent_id: this.id, clearedCount: clearResult.cleared.length },
        };
      }
      case 'queryStatus': {
        if (!d.queryStatus) {
          throw new AgentInputValidationError(this.id, 'queryStatus', 'Required for queryStatus operation.');
        }
        const statusResult = this.queryStatus(d.queryStatus);
        return {
          data: { operation: 'queryStatus', statusResult },
          confidence: 1.0,
          metadata: { agent_id: this.id, position: statusResult.position },
        };
      }
      case 'expire': {
        const expireResult = this.expire(d.expire ?? {});
        return {
          data: { operation: 'expire', expireResult },
          confidence: 1.0,
          metadata: { agent_id: this.id, expiredCount: expireResult.expired.length },
        };
      }
    }
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
    this.entries.clear();
  }

  /** Snapshot of the current queue size — primarily for tests. */
  size(): number {
    return this.entries.size;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Operation implementations
  // ─────────────────────────────────────────────────────────────────────────

  private addEntry(input: AddEntryInput): WaitlistEntry {
    this.validateAddEntry(input);
    const now = new Date();
    const requestedAt = input.requestedAt ?? now.toISOString();
    const cutoff = input.cutoffBeforeDepartureHours ?? 24;
    const score = computePriorityScore({
      statusTier: input.statusTier,
      fareClassType: input.fareClassType,
      requestedAt,
      now,
    });
    const entry: WaitlistEntry = {
      entryId: input.entryId,
      bookingReference: input.bookingReference,
      segment: input.segment,
      statusTier: input.statusTier,
      fareClass: input.fareClass,
      fareClassType: input.fareClassType,
      requestedAt,
      cutoffBeforeDepartureHours: cutoff,
      priorityScore: score,
    };
    this.entries.set(entry.entryId, entry);
    return entry;
  }

  private clear(input: ClearInput): ClearResult {
    if (input.seatsAvailable < 0) {
      throw new AgentInputValidationError(this.id, 'seatsAvailable', 'Must be >= 0.');
    }
    const key = segmentKey(input.segment);
    const queue = this.entriesForSegment(key).sort(compareByPriority);
    const cleared = queue.slice(0, input.seatsAvailable);
    const remaining = queue.slice(input.seatsAvailable);
    for (const entry of cleared) this.entries.delete(entry.entryId);
    return { cleared, remaining };
  }

  private queryStatus(input: QueryStatusInput): QueryStatusResult {
    const entry = this.entries.get(input.entryId);
    if (!entry) {
      return {
        entry: null,
        position: null,
        estimatedClearanceProbability: null,
        willExpireAt: null,
      };
    }
    const key = segmentKey(entry.segment);
    const queue = this.entriesForSegment(key).sort(compareByPriority);
    const position = queue.findIndex((e) => e.entryId === entry.entryId) + 1;
    const rate = resolveClearanceRate(entry.segment.bookingClass, input.historicalClearanceRates);
    // Probability of clearing given you are in position `position`:
    // approximate as rate^position (each ahead-of-you passenger must clear).
    const estimated = Math.pow(rate, position);
    const willExpireAt = computeExpiryAt(entry.segment.departureDate, entry.cutoffBeforeDepartureHours);
    return {
      entry,
      position,
      estimatedClearanceProbability: estimated,
      willExpireAt,
    };
  }

  private expire(input: ExpireInput): ExpireResult {
    const now = input.currentTime ? new Date(input.currentTime) : new Date();
    const expired: WaitlistEntry[] = [];
    for (const entry of [...this.entries.values()]) {
      const expiryMs = Date.parse(
        computeExpiryAt(entry.segment.departureDate, entry.cutoffBeforeDepartureHours),
      );
      if (now.getTime() >= expiryMs) {
        expired.push(entry);
        this.entries.delete(entry.entryId);
      }
    }
    return { expired, remaining: this.entries.size };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private entriesForSegment(key: string): WaitlistEntry[] {
    const result: WaitlistEntry[] = [];
    for (const entry of this.entries.values()) {
      if (segmentKey(entry.segment) === key) result.push(entry);
    }
    return result;
  }

  private validateAddEntry(input: AddEntryInput): void {
    if (!input.entryId) {
      throw new AgentInputValidationError(this.id, 'entryId', 'Required.');
    }
    if (this.entries.has(input.entryId)) {
      throw new AgentInputValidationError(
        this.id,
        'entryId',
        `Duplicate entryId '${input.entryId}'.`,
      );
    }
    if (!input.bookingReference) {
      throw new AgentInputValidationError(this.id, 'bookingReference', 'Required.');
    }
    if (!input.segment) {
      throw new AgentInputValidationError(this.id, 'segment', 'Required.');
    }
    if (!CARRIER_RE.test(input.segment.carrier)) {
      throw new AgentInputValidationError(this.id, 'segment.carrier', 'Must be a 2-char IATA code.');
    }
    if (!DATE_RE.test(input.segment.departureDate)) {
      throw new AgentInputValidationError(
        this.id,
        'segment.departureDate',
        'Must be YYYY-MM-DD.',
      );
    }
    if (!VALID_STATUSES.has(input.statusTier)) {
      throw new AgentInputValidationError(
        this.id,
        'statusTier',
        `Must be one of: ${[...VALID_STATUSES].join(', ')}.`,
      );
    }
    if (!VALID_CLASS_TYPES.has(input.fareClassType)) {
      throw new AgentInputValidationError(
        this.id,
        'fareClassType',
        `Must be one of: ${[...VALID_CLASS_TYPES].join(', ')}.`,
      );
    }
  }
}

/** Priority-first, then earliest requestedAt wins ties. */
function compareByPriority(a: WaitlistEntry, b: WaitlistEntry): number {
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  return a.requestedAt.localeCompare(b.requestedAt);
}

export type {
  AddEntryInput,
  ClearInput,
  ClearResult,
  ClearanceRateMap,
  ExpireInput,
  ExpireResult,
  FareClassType,
  QueryStatusInput,
  QueryStatusResult,
  StatusTier,
  WaitlistEntry,
  WaitlistInput,
  WaitlistOperation,
  WaitlistOutput,
  WaitlistSegment,
} from './types.js';
