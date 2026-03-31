/**
 * Disruption Response — Unit Tests
 *
 * Agent 5.4: IRROPS disruption impact assessment, response planning,
 * and automated response execution.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DisruptionResponseAgent } from '../index.js';
import type {
  DisruptionResponseInput,
  DisruptionEvent,
  AffectedPNR,
  AffectedFlight,
  AvailableFlight,
} from '../types.js';

let agent: DisruptionResponseAgent;

beforeAll(async () => {
  agent = new DisruptionResponseAgent();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeFlight(overrides: Partial<AffectedFlight> = {}): AffectedFlight {
  return {
    carrier: 'BA',
    flightNumber: '117',
    origin: 'LHR',
    destination: 'JFK',
    scheduledDeparture: '2026-04-01T08:00:00Z',
    delayMinutes: 0,
    ...overrides,
  };
}

function makePNR(overrides: Partial<AffectedPNR> = {}): AffectedPNR {
  return {
    pnrRef: 'ABC123',
    passengerCount: 1,
    cabin: 'Y',
    isConnecting: false,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<DisruptionEvent> = {}): DisruptionEvent {
  return {
    eventId: 'EVT001',
    type: 'CANCELLED',
    affectedFlights: [makeFlight()],
    affectedPNRs: [makePNR()],
    detectedAt: '2026-04-01T06:00:00Z',
    ...overrides,
  };
}

function makeAvailable(overrides: Partial<AvailableFlight> = {}): AvailableFlight {
  return {
    carrier: 'BA',
    flightNumber: '119',
    origin: 'LHR',
    destination: 'JFK',
    departure: '2026-04-01T12:00:00Z',
    seatsAvailable: 5,
    cabin: 'Y',
    ...overrides,
  };
}

function makeInput(overrides: Partial<DisruptionResponseInput> = {}): DisruptionResponseInput {
  return {
    operation: 'assessImpact',
    event: makeEvent(),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('DisruptionResponseAgent', () => {
  /* ---- Agent interface compliance ---- */
  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('5.4');
      expect(agent.name).toBe('Disruption Response');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy after initialization', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('reports unhealthy when not initialized', async () => {
      const uninit = new DisruptionResponseAgent();
      const health = await uninit.health();
      expect(health.status).toBe('unhealthy');
    });

    it('throws when not initialized', async () => {
      const uninit = new DisruptionResponseAgent();
      await expect(uninit.execute({ data: makeInput() })).rejects.toThrow(
        'not been initialized',
      );
    });
  });

  /* ---- assessImpact ---- */
  describe('assessImpact', () => {
    it('counts total affected passengers', async () => {
      const event = makeEvent({
        affectedPNRs: [
          makePNR({ pnrRef: 'A1', passengerCount: 2 }),
          makePNR({ pnrRef: 'A2', passengerCount: 3 }),
        ],
      });
      const result = await agent.execute({
        data: makeInput({ event }),
      });
      expect(result.data.impact!.totalAffectedPassengers).toBe(5);
    });

    it('counts connecting passengers at risk', async () => {
      const event = makeEvent({
        affectedPNRs: [
          makePNR({ pnrRef: 'A1', isConnecting: true, passengerCount: 2 }),
          makePNR({ pnrRef: 'A2', isConnecting: false, passengerCount: 1 }),
        ],
      });
      const result = await agent.execute({
        data: makeInput({ event }),
      });
      expect(result.data.impact!.connectingAtRisk).toBe(2);
    });

    it('assigns CRITICAL priority to ELITE tier', async () => {
      const event = makeEvent({
        affectedPNRs: [
          makePNR({ pnrRef: 'E1', passengerTier: 'ELITE', passengerCount: 1 }),
        ],
      });
      const result = await agent.execute({
        data: makeInput({ event }),
      });
      expect(result.data.impact!.priorityBreakdown.critical).toBe(1);
    });

    it('assigns CRITICAL priority to connecting with <90min window', async () => {
      const event = makeEvent({
        affectedPNRs: [
          makePNR({
            pnrRef: 'C1',
            isConnecting: true,
            connectionWindowMinutes: 60,
            passengerCount: 1,
          }),
        ],
      });
      const result = await agent.execute({
        data: makeInput({ event }),
      });
      expect(result.data.impact!.priorityBreakdown.critical).toBe(1);
    });

    it('assigns HIGH priority to PREMIUM tier', async () => {
      const event = makeEvent({
        affectedPNRs: [
          makePNR({ pnrRef: 'P1', passengerTier: 'PREMIUM', passengerCount: 2 }),
        ],
      });
      const result = await agent.execute({
        data: makeInput({ event }),
      });
      expect(result.data.impact!.priorityBreakdown.high).toBe(2);
    });

    it('assigns HIGH priority to connecting passengers', async () => {
      const event = makeEvent({
        affectedPNRs: [
          makePNR({
            pnrRef: 'C2',
            isConnecting: true,
            connectionWindowMinutes: 120,
            passengerCount: 1,
          }),
        ],
      });
      const result = await agent.execute({
        data: makeInput({ event }),
      });
      expect(result.data.impact!.priorityBreakdown.high).toBe(1);
    });

    it('assigns HIGH priority when elapsedJourneyPercent > 50', async () => {
      const event = makeEvent({
        affectedPNRs: [
          makePNR({ pnrRef: 'J1', elapsedJourneyPercent: 75, passengerCount: 1 }),
        ],
      });
      const result = await agent.execute({
        data: makeInput({ event }),
      });
      expect(result.data.impact!.priorityBreakdown.high).toBe(1);
    });

    it('assigns STANDARD priority by default', async () => {
      const event = makeEvent({
        affectedPNRs: [
          makePNR({ pnrRef: 'S1', passengerCount: 3 }),
        ],
      });
      const result = await agent.execute({
        data: makeInput({ event }),
      });
      expect(result.data.impact!.priorityBreakdown.standard).toBe(3);
    });

    it('generates summary text', async () => {
      const result = await agent.execute({
        data: makeInput(),
      });
      expect(result.data.impact!.summary).toContain('CANCELLED');
      expect(result.data.impact!.summary.length).toBeGreaterThan(10);
    });

    it('returns eventId in assessment', async () => {
      const result = await agent.execute({
        data: makeInput(),
      });
      expect(result.data.impact!.eventId).toBe('EVT001');
    });
  });

  /* ---- buildResponsePlan ---- */
  describe('buildResponsePlan', () => {
    it('creates a plan with a planId', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildResponsePlan',
          availableFlights: [makeAvailable()],
        }),
      });
      expect(result.data.plan!.planId).toBeTruthy();
    });

    it('REBOOK when cancelled and seats available', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildResponsePlan',
          event: makeEvent({ type: 'CANCELLED' }),
          availableFlights: [makeAvailable()],
        }),
      });
      const action = result.data.plan!.actions[0];
      expect(action.actionType).toBe('REBOOK');
      expect(action.rebookFlight).toBe('BA119');
    });

    it('WAITLIST when cancelled and flight full', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildResponsePlan',
          event: makeEvent({ type: 'CANCELLED' }),
          availableFlights: [makeAvailable({ seatsAvailable: 0 })],
        }),
      });
      expect(result.data.plan!.actions[0].actionType).toBe('WAITLIST');
    });

    it('REFUND_OFFER when cancelled and no flights available', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildResponsePlan',
          event: makeEvent({ type: 'CANCELLED' }),
          availableFlights: [],
        }),
      });
      expect(result.data.plan!.actions[0].actionType).toBe('REFUND_OFFER');
    });

    it('NOTIFY_ONLY when delay under 60 min', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildResponsePlan',
          event: makeEvent({
            type: 'DELAYED',
            affectedFlights: [makeFlight({ delayMinutes: 30 })],
          }),
          availableFlights: [makeAvailable()],
        }),
      });
      expect(result.data.plan!.actions[0].actionType).toBe('NOTIFY_ONLY');
    });

    it('REBOOK when delay >= 60 min and seats available', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildResponsePlan',
          event: makeEvent({
            type: 'DELAYED',
            affectedFlights: [makeFlight({ delayMinutes: 120 })],
          }),
          availableFlights: [makeAvailable()],
        }),
      });
      expect(result.data.plan!.actions[0].actionType).toBe('REBOOK');
    });

    it('sorts actions CRITICAL > HIGH > STANDARD', async () => {
      const event = makeEvent({
        affectedPNRs: [
          makePNR({ pnrRef: 'STD1', passengerCount: 1 }),
          makePNR({ pnrRef: 'ELT1', passengerTier: 'ELITE', passengerCount: 1 }),
          makePNR({ pnrRef: 'PRM1', passengerTier: 'PREMIUM', passengerCount: 1 }),
        ],
      });
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildResponsePlan',
          event,
          availableFlights: [makeAvailable()],
        }),
      });
      const priorities = result.data.plan!.actions.map((a) => a.priority);
      expect(priorities[0]).toBe('CRITICAL');
      expect(priorities[1]).toBe('HIGH');
      expect(priorities[2]).toBe('STANDARD');
    });

    it('all actions start as PENDING', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildResponsePlan',
          availableFlights: [makeAvailable()],
        }),
      });
      for (const action of result.data.plan!.actions) {
        expect(action.status).toBe('PENDING');
      }
    });

    it('stores plan in memory for later execution', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildResponsePlan',
          availableFlights: [makeAvailable()],
        }),
      });
      const planId = result.data.plan!.planId;

      // Execute the stored plan
      const execResult = await agent.execute({
        data: { operation: 'executeResponse', planId },
      });
      expect(execResult.data.execution!.planId).toBe(planId);
    });
  });

  /* ---- executeResponse ---- */
  describe('executeResponse', () => {
    it('executes a stored plan', async () => {
      const planResult = await agent.execute({
        data: makeInput({
          operation: 'buildResponsePlan',
          availableFlights: [makeAvailable()],
        }),
      });
      const planId = planResult.data.plan!.planId;

      const result = await agent.execute({
        data: { operation: 'executeResponse', planId },
      });
      expect(result.data.execution).toBeDefined();
      expect(result.data.execution!.planId).toBe(planId);
    });

    it('marks all actions as SUCCESS', async () => {
      const planResult = await agent.execute({
        data: makeInput({
          operation: 'buildResponsePlan',
          event: makeEvent({
            affectedPNRs: [
              makePNR({ pnrRef: 'X1' }),
              makePNR({ pnrRef: 'X2' }),
            ],
          }),
          availableFlights: [makeAvailable()],
        }),
      });
      const planId = planResult.data.plan!.planId;

      const result = await agent.execute({
        data: { operation: 'executeResponse', planId },
      });
      for (const action of result.data.execution!.executedActions) {
        expect(action.status).toBe('SUCCESS');
      }
    });

    it('reports correct success count', async () => {
      const planResult = await agent.execute({
        data: makeInput({
          operation: 'buildResponsePlan',
          event: makeEvent({
            affectedPNRs: [
              makePNR({ pnrRef: 'Y1' }),
              makePNR({ pnrRef: 'Y2' }),
              makePNR({ pnrRef: 'Y3' }),
            ],
          }),
          availableFlights: [makeAvailable()],
        }),
      });
      const planId = planResult.data.plan!.planId;

      const result = await agent.execute({
        data: { operation: 'executeResponse', planId },
      });
      expect(result.data.execution!.successCount).toBe(3);
      expect(result.data.execution!.failedCount).toBe(0);
    });

    it('has a completedAt timestamp', async () => {
      const planResult = await agent.execute({
        data: makeInput({
          operation: 'buildResponsePlan',
          availableFlights: [makeAvailable()],
        }),
      });
      const result = await agent.execute({
        data: { operation: 'executeResponse', planId: planResult.data.plan!.planId },
      });
      expect(result.data.execution!.completedAt).toBeTruthy();
    });
  });

  /* ---- Input validation ---- */
  describe('Input validation', () => {
    it('rejects unknown operation', async () => {
      await expect(
        agent.execute({
          data: { operation: 'unknown' as DisruptionResponseInput['operation'] },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects assessImpact without event', async () => {
      await expect(
        agent.execute({
          data: { operation: 'assessImpact' },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects event with empty eventId', async () => {
      await expect(
        agent.execute({
          data: makeInput({ event: makeEvent({ eventId: '' }) }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects event with invalid type', async () => {
      await expect(
        agent.execute({
          data: makeInput({
            event: makeEvent({ type: 'INVALID' as DisruptionEvent['type'] }),
          }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects event with no affected flights', async () => {
      await expect(
        agent.execute({
          data: makeInput({ event: makeEvent({ affectedFlights: [] }) }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects event with no affected PNRs', async () => {
      await expect(
        agent.execute({
          data: makeInput({ event: makeEvent({ affectedPNRs: [] }) }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects PNR with empty pnrRef', async () => {
      await expect(
        agent.execute({
          data: makeInput({
            event: makeEvent({
              affectedPNRs: [makePNR({ pnrRef: '' })],
            }),
          }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects PNR with passengerCount < 1', async () => {
      await expect(
        agent.execute({
          data: makeInput({
            event: makeEvent({
              affectedPNRs: [makePNR({ passengerCount: 0 })],
            }),
          }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects executeResponse without planId', async () => {
      await expect(
        agent.execute({
          data: { operation: 'executeResponse' },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects executeResponse with unknown planId', async () => {
      await expect(
        agent.execute({
          data: { operation: 'executeResponse', planId: 'nonexistent' },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  /* ---- Metadata ---- */
  describe('Output metadata', () => {
    it('includes agent_id in metadata', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['agent_id']).toBe('5.4');
    });

    it('includes operation in metadata', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['operation']).toBe('assessImpact');
    });

    it('confidence is 1.0', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.confidence).toBe(1.0);
    });
  });
});
