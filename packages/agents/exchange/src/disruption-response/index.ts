/**
 * Disruption Response — Agent 5.4
 *
 * IRROPS disruption impact assessment, response plan generation,
 * and automated response execution for flight disruptions.
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
  DisruptionResponseInput,
  DisruptionResponseOutput,
  DisruptionEvent,
  AffectedPNR,
  PriorityLevel,
  ResponseActionType,
  ResponseAction,
  ResponsePlan,
  ImpactAssessment,
  ExecutionResult,
  AvailableFlight,
  PriorityBreakdown,
} from './types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

let planCounter = 0;

function generatePlanId(): string {
  planCounter += 1;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `plan-${ts}-${rand}-${planCounter}`;
}

function computePriority(pnr: AffectedPNR): PriorityLevel {
  const tier = pnr.passengerTier ?? 'STANDARD';

  if (tier === 'ELITE') return 'CRITICAL';
  if (
    pnr.isConnecting &&
    pnr.connectionWindowMinutes !== undefined &&
    pnr.connectionWindowMinutes < 90
  ) {
    return 'CRITICAL';
  }

  if (pnr.isConnecting) return 'HIGH';
  if (tier === 'PREMIUM') return 'HIGH';
  if (
    pnr.elapsedJourneyPercent !== undefined &&
    pnr.elapsedJourneyPercent > 50
  ) {
    return 'HIGH';
  }

  return 'STANDARD';
}

function determineAction(
  pnr: AffectedPNR,
  event: DisruptionEvent,
  availableFlights: AvailableFlight[],
): { actionType: ResponseActionType; reason: string; rebookFlight?: string } {
  const maxDelay = Math.max(
    ...event.affectedFlights.map((f) => f.delayMinutes),
  );

  if (event.type === 'DELAYED' && maxDelay < 60) {
    return { actionType: 'NOTIFY_ONLY', reason: 'Delay under 60 minutes' };
  }

  // Find a matching available flight with seats
  const match = availableFlights.find(
    (f) => f.seatsAvailable > 0 && f.cabin === pnr.cabin,
  );

  if (event.type === 'CANCELLED' || maxDelay >= 60) {
    if (match) {
      return {
        actionType: 'REBOOK',
        reason:
          event.type === 'CANCELLED'
            ? 'Flight cancelled — rebook to available flight'
            : `Delay ${maxDelay}min — rebook to available flight`,
        rebookFlight: `${match.carrier}${match.flightNumber}`,
      };
    }

    // Check if there is a flight at all (even if full)
    const fullMatch = availableFlights.find((f) => f.cabin === pnr.cabin);
    if (fullMatch) {
      return {
        actionType: 'WAITLIST',
        reason: 'Flight exists but full — add to waitlist',
      };
    }

    if (event.type === 'CANCELLED') {
      return {
        actionType: 'REFUND_OFFER',
        reason: 'No alternative flight within 24 hours',
      };
    }
  }

  // Diverted or other edge cases
  if (event.type === 'DIVERTED') {
    if (match) {
      return {
        actionType: 'REBOOK',
        reason: 'Flight diverted — rebook to available flight',
        rebookFlight: `${match.carrier}${match.flightNumber}`,
      };
    }
    return { actionType: 'NOTIFY_ONLY', reason: 'Diversion — monitoring' };
  }

  return { actionType: 'NOTIFY_ONLY', reason: 'No action required' };
}

const PRIORITY_ORDER: Record<PriorityLevel, number> = {
  CRITICAL: 0,
  HIGH: 1,
  STANDARD: 2,
};

/* ------------------------------------------------------------------ */
/*  Agent class                                                       */
/* ------------------------------------------------------------------ */

export class DisruptionResponseAgent
  implements Agent<DisruptionResponseInput, DisruptionResponseOutput>
{
  readonly id = '5.4';
  readonly name = 'Disruption Response';
  readonly version = '0.1.0';

  private initialized = false;
  private plans: Map<string, ResponsePlan> = new Map();

  async initialize(): Promise<void> {
    this.plans.clear();
    this.initialized = true;
  }

  async execute(
    input: AgentInput<DisruptionResponseInput>,
  ): Promise<AgentOutput<DisruptionResponseOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    const { operation } = input.data;

    switch (operation) {
      case 'assessImpact':
        return this.handleAssessImpact(input.data);
      case 'buildResponsePlan':
        return this.handleBuildResponsePlan(input.data);
      case 'executeResponse':
        return this.handleExecuteResponse(input.data);
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
    this.plans.clear();
    this.initialized = false;
  }

  /* ---------------------------------------------------------------- */
  /*  Operations                                                      */
  /* ---------------------------------------------------------------- */

  private handleAssessImpact(
    data: DisruptionResponseInput,
  ): AgentOutput<DisruptionResponseOutput> {
    if (!data.event) {
      throw new AgentInputValidationError(
        this.id,
        'event',
        'DisruptionEvent is required for assessImpact.',
      );
    }
    this.validateEvent(data.event);

    const event = data.event;

    let totalPassengers = 0;
    let connectingAtRisk = 0;
    const breakdown: PriorityBreakdown = { critical: 0, high: 0, standard: 0 };

    for (const pnr of event.affectedPNRs) {
      totalPassengers += pnr.passengerCount;
      if (pnr.isConnecting) {
        connectingAtRisk += pnr.passengerCount;
      }
      const priority = computePriority(pnr);
      if (priority === 'CRITICAL') breakdown.critical += pnr.passengerCount;
      else if (priority === 'HIGH') breakdown.high += pnr.passengerCount;
      else breakdown.standard += pnr.passengerCount;
    }

    const impact: ImpactAssessment = {
      eventId: event.eventId,
      totalAffectedPassengers: totalPassengers,
      connectingAtRisk,
      priorityBreakdown: breakdown,
      summary: `Disruption ${event.eventId}: ${event.type} affecting ${totalPassengers} passengers (${breakdown.critical} critical, ${breakdown.high} high, ${breakdown.standard} standard). ${connectingAtRisk} connecting at risk.`,
    };

    return {
      data: { impact },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: 'assessImpact',
        eventId: event.eventId,
      },
    };
  }

  private handleBuildResponsePlan(
    data: DisruptionResponseInput,
  ): AgentOutput<DisruptionResponseOutput> {
    if (!data.event) {
      throw new AgentInputValidationError(
        this.id,
        'event',
        'DisruptionEvent is required for buildResponsePlan.',
      );
    }
    this.validateEvent(data.event);

    const event = data.event;
    const availableFlights = data.availableFlights ?? [];
    const actions: ResponseAction[] = [];

    for (const pnr of event.affectedPNRs) {
      const priority = computePriority(pnr);
      const actionResult = determineAction(pnr, event, availableFlights);

      actions.push({
        pnrRef: pnr.pnrRef,
        priority,
        actionType: actionResult.actionType,
        reason: actionResult.reason,
        rebookFlight: actionResult.rebookFlight,
        status: 'PENDING',
      });
    }

    // Sort: CRITICAL -> HIGH -> STANDARD
    actions.sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
    );

    const planId = generatePlanId();
    const plan: ResponsePlan = {
      planId,
      eventId: event.eventId,
      actions,
      createdAt: new Date().toISOString(),
    };

    this.plans.set(planId, plan);

    return {
      data: { plan },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: 'buildResponsePlan',
        planId,
        eventId: event.eventId,
        actionCount: actions.length,
      },
    };
  }

  private handleExecuteResponse(
    data: DisruptionResponseInput,
  ): AgentOutput<DisruptionResponseOutput> {
    if (!data.planId) {
      throw new AgentInputValidationError(
        this.id,
        'planId',
        'planId is required for executeResponse.',
      );
    }

    const plan = this.plans.get(data.planId);
    if (!plan) {
      throw new AgentInputValidationError(
        this.id,
        'planId',
        `Plan not found: ${data.planId}`,
      );
    }

    // Mock execution: mark all actions as SUCCESS
    const executedActions: ResponseAction[] = plan.actions.map((action) => ({
      ...action,
      status: 'SUCCESS' as const,
    }));

    const execution: ExecutionResult = {
      planId: plan.planId,
      executedActions,
      successCount: executedActions.length,
      failedCount: 0,
      completedAt: new Date().toISOString(),
    };

    return {
      data: { execution },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: 'executeResponse',
        planId: plan.planId,
        successCount: execution.successCount,
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Validation                                                      */
  /* ---------------------------------------------------------------- */

  private validateEvent(event: DisruptionEvent): void {
    if (!event.eventId || event.eventId.trim().length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'eventId',
        'eventId is required.',
      );
    }
    const validTypes = new Set(['CANCELLED', 'DELAYED', 'DIVERTED']);
    if (!validTypes.has(event.type)) {
      throw new AgentInputValidationError(
        this.id,
        'type',
        `Must be one of: ${[...validTypes].join(', ')}`,
      );
    }
    if (!event.affectedFlights || event.affectedFlights.length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'affectedFlights',
        'At least one affected flight is required.',
      );
    }
    if (!event.affectedPNRs || event.affectedPNRs.length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'affectedPNRs',
        'At least one affected PNR is required.',
      );
    }
    if (!event.detectedAt || event.detectedAt.trim().length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'detectedAt',
        'detectedAt is required.',
      );
    }

    for (const pnr of event.affectedPNRs) {
      if (!pnr.pnrRef || pnr.pnrRef.trim().length === 0) {
        throw new AgentInputValidationError(
          this.id,
          'pnrRef',
          'Each PNR must have a pnrRef.',
        );
      }
      if (pnr.passengerCount < 1) {
        throw new AgentInputValidationError(
          this.id,
          'passengerCount',
          'passengerCount must be at least 1.',
        );
      }
    }
  }
}

export type {
  DisruptionResponseInput,
  DisruptionResponseOutput,
  DisruptionEvent,
  DisruptionType,
  DisruptionOperation,
  AffectedFlight,
  AffectedPNR,
  PassengerTier,
  PriorityLevel,
  ResponseActionType,
  ActionStatus,
  ResponseAction,
  ResponsePlan,
  ImpactAssessment,
  ExecutionResult,
  AvailableFlight,
  PriorityBreakdown,
} from './types.js';
