/**
 * Waitlist Management — Agent 5.6
 *
 * Waitlist position tracking, priority scoring, clearance management,
 * and suggested alternatives.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  AgentHealthStatus,
} from '@otaip/core';
import {
  AgentNotInitializedError,
  AgentInputValidationError,
} from '@otaip/core';
import type {
  WaitlistManagementInput,
  WaitlistManagementOutput,
  WaitlistEntry,
  WaitlistPosition,
  CabinClass,
  CorporateTier,
  ClearanceLikelihood,
  AlternativeFlight,
} from './types.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const TIER_SCORES: Record<CorporateTier, number> = {
  ELITE: 30,
  PREMIUM: 15,
  STANDARD: 0,
};

const CABIN_SCORES: Record<CabinClass, number> = {
  F: 20,
  C: 15,
  W: 10,
  Y: 0,
};

const MAX_TIME_BONUS = 10;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

let entryCounter = 0;

function generateEntryId(): string {
  entryCounter += 1;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `wl-${ts}-${rand}-${entryCounter}`;
}

function computePriority(
  tier: CorporateTier,
  cabin: CabinClass,
  addedAt: string,
): number {
  const tierScore = TIER_SCORES[tier];
  const cabinScore = CABIN_SCORES[cabin];

  // Time bonus: earlier entries get higher bonus, up to MAX_TIME_BONUS
  // We use a simple formula: bonus = max(0, 10 - (ageInHours / 2))
  const ageMs = Date.now() - new Date(addedAt).getTime();
  const ageHours = ageMs / 3_600_000;
  const timeBonus = Math.max(0, Math.min(MAX_TIME_BONUS, MAX_TIME_BONUS - ageHours / 2));

  return tierScore + cabinScore + timeBonus;
}

function getClearanceLikelihood(position: number): ClearanceLikelihood {
  if (position <= 3) return 'HIGH';
  if (position <= 10) return 'MEDIUM';
  return 'LOW';
}

/* ------------------------------------------------------------------ */
/*  Agent class                                                       */
/* ------------------------------------------------------------------ */

export class WaitlistManagementAgent
  implements Agent<WaitlistManagementInput, WaitlistManagementOutput>
{
  readonly id = '5.6';
  readonly name = 'Waitlist Management';
  readonly version = '0.1.0';

  private initialized = false;

  /** In-memory store grouped by flightKey */
  private store: Map<string, WaitlistEntry[]> = new Map();

  /** Index by entryId for fast lookup */
  private entryIndex: Map<string, WaitlistEntry> = new Map();

  async initialize(): Promise<void> {
    this.store.clear();
    this.entryIndex.clear();
    this.initialized = true;
  }

  async execute(
    input: AgentInput<WaitlistManagementInput>,
  ): Promise<AgentOutput<WaitlistManagementOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    const { operation } = input.data;

    switch (operation) {
      case 'addToWaitlist':
        return this.handleAdd(input.data);
      case 'getPosition':
        return this.handleGetPosition(input.data);
      case 'checkStatus':
        return this.handleCheckStatus(input.data);
      case 'confirmCleared':
        return this.handleConfirmCleared(input.data);
      case 'removeFromWaitlist':
        return this.handleRemove(input.data);
      case 'getSuggestedAlternatives':
        return this.handleSuggestedAlternatives(input.data);
      case 'getPriorityQueue':
        return this.handleGetPriorityQueue(input.data);
      default:
        throw new AgentInputValidationError(
          this.id,
          'operation',
          `Unknown operation: ${String(operation)}`,
        );
    }
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return {
        status: 'unhealthy',
        details: 'Not initialized. Call initialize() first.',
      };
    }
    return { status: 'healthy' };
  }

  destroy(): void {
    this.store.clear();
    this.entryIndex.clear();
    this.initialized = false;
  }

  /* ---------------------------------------------------------------- */
  /*  addToWaitlist                                                    */
  /* ---------------------------------------------------------------- */

  private handleAdd(
    data: WaitlistManagementInput,
  ): AgentOutput<WaitlistManagementOutput> {
    if (!data.pnrRef || data.pnrRef.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'pnrRef', 'pnrRef is required.');
    }
    if (!data.segmentRef || data.segmentRef.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'segmentRef', 'segmentRef is required.');
    }
    if (!data.flightKey || data.flightKey.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'flightKey', 'flightKey is required.');
    }
    if (!data.requestedCabin) {
      throw new AgentInputValidationError(this.id, 'requestedCabin', 'requestedCabin is required.');
    }

    const tier = data.corporateTier ?? 'STANDARD';
    const addedAt = new Date().toISOString();
    const priority = computePriority(tier, data.requestedCabin, addedAt);

    const entry: WaitlistEntry = {
      entryId: generateEntryId(),
      pnrRef: data.pnrRef,
      segmentRef: data.segmentRef,
      flightKey: data.flightKey,
      requestedCabin: data.requestedCabin,
      addedAt,
      priority,
      passengerCount: data.passengerCount ?? 1,
      corporateTier: tier,
      bookingClass: data.bookingClass ?? data.requestedCabin,
      status: 'WAITLISTED',
    };

    // Add to store
    const queue = this.store.get(data.flightKey) ?? [];
    queue.push(entry);
    // Sort by priority descending
    queue.sort((a, b) => b.priority - a.priority);
    this.store.set(data.flightKey, queue);
    this.entryIndex.set(entry.entryId, entry);

    return {
      data: { entry },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: 'addToWaitlist',
        entryId: entry.entryId,
        flightKey: data.flightKey,
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /*  getPosition                                                     */
  /* ---------------------------------------------------------------- */

  private handleGetPosition(
    data: WaitlistManagementInput,
  ): AgentOutput<WaitlistManagementOutput> {
    const entry = this.lookupEntry(data.entryId);

    const queue = this.store.get(entry.flightKey) ?? [];
    const activeQueue = queue.filter((e) => e.status === 'WAITLISTED');
    const idx = activeQueue.findIndex((e) => e.entryId === entry.entryId);

    if (idx === -1 || entry.status !== 'WAITLISTED') {
      return {
        data: {
          error: {
            code: 'SEGMENT_NOT_ON_WAITLIST',
            message: `Entry ${entry.entryId} is not currently waitlisted (status: ${entry.status}).`,
          },
        },
        confidence: 1.0,
        metadata: {
          agent_id: this.id,
          agent_version: this.version,
          operation: 'getPosition',
        },
      };
    }

    const position = idx + 1;
    const positionInfo: WaitlistPosition = {
      entryId: entry.entryId,
      position,
      queueSize: activeQueue.length,
      clearanceLikelihood: getClearanceLikelihood(position),
    };

    return {
      data: { position: positionInfo },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: 'getPosition',
        entryId: entry.entryId,
        position,
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /*  checkStatus                                                     */
  /* ---------------------------------------------------------------- */

  private handleCheckStatus(
    data: WaitlistManagementInput,
  ): AgentOutput<WaitlistManagementOutput> {
    const entry = this.lookupEntry(data.entryId);

    return {
      data: { entry },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: 'checkStatus',
        entryId: entry.entryId,
        status: entry.status,
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /*  confirmCleared                                                  */
  /* ---------------------------------------------------------------- */

  private handleConfirmCleared(
    data: WaitlistManagementInput,
  ): AgentOutput<WaitlistManagementOutput> {
    const entry = this.lookupEntry(data.entryId);

    if (entry.status === 'CLEARED') {
      return {
        data: {
          error: {
            code: 'ALREADY_CONFIRMED',
            message: `Entry ${entry.entryId} has already been confirmed as cleared.`,
          },
        },
        confidence: 1.0,
        metadata: {
          agent_id: this.id,
          agent_version: this.version,
          operation: 'confirmCleared',
        },
      };
    }

    if (entry.status !== 'WAITLISTED') {
      return {
        data: {
          error: {
            code: 'SEGMENT_NOT_ON_WAITLIST',
            message: `Entry ${entry.entryId} cannot be cleared (status: ${entry.status}).`,
          },
        },
        confidence: 1.0,
        metadata: {
          agent_id: this.id,
          agent_version: this.version,
          operation: 'confirmCleared',
        },
      };
    }

    entry.status = 'CLEARED';

    return {
      data: { entry },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: 'confirmCleared',
        entryId: entry.entryId,
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /*  removeFromWaitlist                                              */
  /* ---------------------------------------------------------------- */

  private handleRemove(
    data: WaitlistManagementInput,
  ): AgentOutput<WaitlistManagementOutput> {
    const entry = this.lookupEntry(data.entryId);

    entry.status = 'REMOVED';

    return {
      data: { entry },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: 'removeFromWaitlist',
        entryId: entry.entryId,
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /*  getSuggestedAlternatives                                        */
  /* ---------------------------------------------------------------- */

  private handleSuggestedAlternatives(
    data: WaitlistManagementInput,
  ): AgentOutput<WaitlistManagementOutput> {
    const alternatives = data.alternatives ?? [];

    // Filter to only flights with available seats, sorted by seats descending
    const suggested: AlternativeFlight[] = alternatives
      .filter((f) => f.seatsAvailable > 0)
      .sort((a, b) => b.seatsAvailable - a.seatsAvailable);

    return {
      data: { suggestedAlternatives: suggested },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: 'getSuggestedAlternatives',
        totalAlternatives: suggested.length,
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /*  getPriorityQueue                                                */
  /* ---------------------------------------------------------------- */

  private handleGetPriorityQueue(
    data: WaitlistManagementInput,
  ): AgentOutput<WaitlistManagementOutput> {
    if (!data.flightKey || data.flightKey.trim().length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'flightKey',
        'flightKey is required for getPriorityQueue.',
      );
    }

    const queue = this.store.get(data.flightKey) ?? [];
    // Return only active waitlisted entries, sorted by priority desc
    const activeQueue = queue
      .filter((e) => e.status === 'WAITLISTED')
      .sort((a, b) => b.priority - a.priority);

    return {
      data: { queue: activeQueue },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: 'getPriorityQueue',
        flightKey: data.flightKey,
        queueSize: activeQueue.length,
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Internal helpers                                                */
  /* ---------------------------------------------------------------- */

  private lookupEntry(entryId: string | undefined): WaitlistEntry {
    if (!entryId || entryId.trim().length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'entryId',
        'entryId is required.',
      );
    }
    const entry = this.entryIndex.get(entryId);
    if (!entry) {
      throw new AgentInputValidationError(
        this.id,
        'entryId',
        `Entry not found: ${entryId}`,
      );
    }
    return entry;
  }
}

export type {
  WaitlistManagementInput,
  WaitlistManagementOutput,
  WaitlistOperation,
  WaitlistStatus,
  ClearanceLikelihood,
  CorporateTier,
  CabinClass,
  WaitlistErrorCode,
  WaitlistEntry,
  WaitlistPosition,
  AlternativeFlight,
  WaitlistError,
} from './types.js';
