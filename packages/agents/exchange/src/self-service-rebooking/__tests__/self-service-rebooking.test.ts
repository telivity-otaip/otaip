/**
 * Self-Service Rebooking — Unit Tests
 *
 * Agent 5.5: Self-service rebooking eligibility, fee calculation,
 * and rebooking option generation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SelfServiceRebookingAgent } from '../index.js';
import type {
  SelfServiceRebookingInput,
  OriginalBooking,
  RebookRequest,
  AvailableRebookFlight,
} from '../types.js';

let agent: SelfServiceRebookingAgent;

beforeAll(async () => {
  agent = new SelfServiceRebookingAgent();
  await agent.initialize();
});

afterAll(() => {
  agent.destroy();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeBooking(overrides: Partial<OriginalBooking> = {}): OriginalBooking {
  return {
    pnrRef: 'ABC123',
    passengerName: 'SMITH/JOHN',
    fareBasis: 'HOWUS',
    currentFare: '450.00',
    currency: 'USD',
    origin: 'LHR',
    destination: 'JFK',
    departureDateTime: '2026-06-15T08:00:00Z',
    cabin: 'Y',
    carrier: 'BA',
    flightNumber: '117',
    ...overrides,
  };
}

function makeRequest(overrides: Partial<RebookRequest> = {}): RebookRequest {
  return {
    desiredOrigin: 'LHR',
    desiredDestination: 'JFK',
    desiredDate: '2026-06-16',
    ...overrides,
  };
}

function makeAvailFlight(overrides: Partial<AvailableRebookFlight> = {}): AvailableRebookFlight {
  return {
    carrier: 'BA',
    flightNumber: '119',
    origin: 'LHR',
    destination: 'JFK',
    departure: '2026-06-16T10:00:00Z',
    cabin: 'Y',
    fare: '500.00',
    currency: 'USD',
    seatsAvailable: 5,
    ...overrides,
  };
}

function makeInput(overrides: Partial<SelfServiceRebookingInput> = {}): SelfServiceRebookingInput {
  return {
    operation: 'validateRebookEligibility',
    booking: makeBooking(),
    reason: 'VOLUNTARY',
    request: makeRequest(),
    currentDateTime: '2026-06-14T12:00:00Z',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('SelfServiceRebookingAgent', () => {
  /* ---- Agent interface compliance ---- */
  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      expect(agent.id).toBe('5.5');
      expect(agent.name).toBe('Self-Service Rebooking');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy after initialization', async () => {
      const health = await agent.health();
      expect(health.status).toBe('healthy');
    });

    it('reports unhealthy when not initialized', async () => {
      const uninit = new SelfServiceRebookingAgent();
      const health = await uninit.health();
      expect(health.status).toBe('unhealthy');
    });

    it('throws when not initialized', async () => {
      const uninit = new SelfServiceRebookingAgent();
      await expect(uninit.execute({ data: makeInput() })).rejects.toThrow(
        'not been initialized',
      );
    });
  });

  /* ---- validateRebookEligibility ---- */
  describe('validateRebookEligibility', () => {
    it('MEDICAL reason -> mustCallAgent', async () => {
      const result = await agent.execute({
        data: makeInput({ reason: 'MEDICAL' }),
      });
      expect(result.data.eligibility!.result).toBe('MUST_CALL_AGENT');
      expect(result.data.eligibility!.reason).toContain('MEDICAL');
    });

    it('BEREAVEMENT reason -> mustCallAgent', async () => {
      const result = await agent.execute({
        data: makeInput({ reason: 'BEREAVEMENT' }),
      });
      expect(result.data.eligibility!.result).toBe('MUST_CALL_AGENT');
      expect(result.data.eligibility!.reason).toContain('BEREAVEMENT');
    });

    it('departure within 2h -> mustCallAgent', async () => {
      const result = await agent.execute({
        data: makeInput({
          booking: makeBooking({ departureDateTime: '2026-06-14T13:30:00Z' }),
          currentDateTime: '2026-06-14T12:00:00Z',
        }),
      });
      expect(result.data.eligibility!.result).toBe('MUST_CALL_AGENT');
      expect(result.data.eligibility!.reason).toContain('2 hours');
    });

    it('origin change -> mustCallAgent', async () => {
      const result = await agent.execute({
        data: makeInput({
          request: makeRequest({ desiredOrigin: 'CDG' }),
        }),
      });
      expect(result.data.eligibility!.result).toBe('MUST_CALL_AGENT');
      expect(result.data.eligibility!.reason).toContain('Origin');
    });

    it('destination change -> mustCallAgent', async () => {
      const result = await agent.execute({
        data: makeInput({
          request: makeRequest({ desiredDestination: 'LAX' }),
        }),
      });
      expect(result.data.eligibility!.result).toBe('MUST_CALL_AGENT');
      expect(result.data.eligibility!.reason).toContain('destination');
    });

    it('fare basis starting B -> not eligible', async () => {
      const result = await agent.execute({
        data: makeInput({
          booking: makeBooking({ fareBasis: 'BOWUS' }),
        }),
      });
      expect(result.data.eligibility!.result).toBe('NOT_ELIGIBLE');
    });

    it('fare basis starting G -> not eligible', async () => {
      const result = await agent.execute({
        data: makeInput({
          booking: makeBooking({ fareBasis: 'GOWUS' }),
        }),
      });
      expect(result.data.eligibility!.result).toBe('NOT_ELIGIBLE');
    });

    it('SCHEDULE_CHANGE >60min -> eligible + no fee', async () => {
      const result = await agent.execute({
        data: makeInput({
          reason: 'SCHEDULE_CHANGE',
          scheduleChangeMinutes: 90,
        }),
      });
      expect(result.data.eligibility!.result).toBe('ELIGIBLE');
      expect(result.data.eligibility!.feeWaived).toBe(true);
      expect(result.data.eligibility!.isScheduleChange).toBe(true);
    });

    it('SCHEDULE_CHANGE <=60min -> eligible (no special waiver)', async () => {
      const result = await agent.execute({
        data: makeInput({
          reason: 'SCHEDULE_CHANGE',
          scheduleChangeMinutes: 30,
        }),
      });
      expect(result.data.eligibility!.result).toBe('ELIGIBLE');
      expect(result.data.eligibility!.feeWaived).toBe(false);
    });

    it('voluntary with standard fare -> eligible', async () => {
      const result = await agent.execute({
        data: makeInput(),
      });
      expect(result.data.eligibility!.result).toBe('ELIGIBLE');
    });

    it('departure far in future is eligible', async () => {
      const result = await agent.execute({
        data: makeInput({
          booking: makeBooking({ departureDateTime: '2026-12-01T08:00:00Z' }),
          currentDateTime: '2026-06-14T12:00:00Z',
        }),
      });
      expect(result.data.eligibility!.result).toBe('ELIGIBLE');
    });
  });

  /* ---- calculateRebookFee ---- */
  describe('calculateRebookFee', () => {
    it('VOLUNTARY fee is 150.00', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'calculateRebookFee',
          newFare: '500.00',
        }),
      });
      expect(result.data.fee!.changeFee).toBe('150.00');
    });

    it('FLEX fare -> fee is 0.00', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'calculateRebookFee',
          booking: makeBooking({ fareBasis: 'YFLEXUS' }),
          newFare: '500.00',
        }),
      });
      expect(result.data.fee!.changeFee).toBe('0.00');
      expect(result.data.fee!.feeWaived).toBe(true);
    });

    it('waiver -> fee is 0.00', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'calculateRebookFee',
          booking: makeBooking({ hasWaiver: true }),
          newFare: '500.00',
        }),
      });
      expect(result.data.fee!.changeFee).toBe('0.00');
      expect(result.data.fee!.feeWaived).toBe(true);
    });

    it('SCHEDULE_CHANGE -> fee waived', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'calculateRebookFee',
          reason: 'SCHEDULE_CHANGE',
          newFare: '500.00',
        }),
      });
      expect(result.data.fee!.changeFee).toBe('0.00');
      expect(result.data.fee!.feeWaived).toBe(true);
    });

    it('calculates positive fare difference', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'calculateRebookFee',
          newFare: '600.00',
        }),
      });
      expect(result.data.fee!.fareDifference).toBe('150.00');
    });

    it('calculates negative fare difference', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'calculateRebookFee',
          newFare: '400.00',
        }),
      });
      expect(result.data.fee!.fareDifference).toBe('-50.00');
    });

    it('totalDue = max(changeFee + fareDiff, 0)', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'calculateRebookFee',
          newFare: '500.00',
        }),
      });
      // changeFee=150 + fareDiff=50 = 200
      expect(result.data.fee!.totalDue).toBe('200.00');
    });

    it('totalDue floors at 0.00 when negative', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'calculateRebookFee',
          booking: makeBooking({ hasWaiver: true }),
          newFare: '300.00',
        }),
      });
      // changeFee=0 + fareDiff=-150 => max(-150, 0) = 0
      expect(result.data.fee!.totalDue).toBe('0.00');
    });

    it('includes currency in result', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'calculateRebookFee',
          newFare: '500.00',
        }),
      });
      expect(result.data.fee!.currency).toBe('USD');
    });

    it('generates summary text', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'calculateRebookFee',
          newFare: '500.00',
        }),
      });
      expect(result.data.fee!.summary).toContain('Total due');
    });
  });

  /* ---- buildRebookOptions ---- */
  describe('buildRebookOptions', () => {
    it('returns available options', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildRebookOptions',
          availableFlights: [makeAvailFlight()],
        }),
      });
      expect(result.data.rebookOptions!.totalOptions).toBe(1);
      expect(result.data.rebookOptions!.options.length).toBe(1);
    });

    it('filters out zero-seat flights', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildRebookOptions',
          availableFlights: [
            makeAvailFlight({ seatsAvailable: 0 }),
            makeAvailFlight({ flightNumber: '121', seatsAvailable: 3 }),
          ],
        }),
      });
      expect(result.data.rebookOptions!.totalOptions).toBe(1);
      expect(result.data.rebookOptions!.options[0].flightNumber).toBe('121');
    });

    it('calculates totalDue per option', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildRebookOptions',
          availableFlights: [makeAvailFlight({ fare: '600.00' })],
        }),
      });
      const opt = result.data.rebookOptions!.options[0];
      // changeFee=150 + fareDiff=150 = 300
      expect(opt.totalDue).toBe('300.00');
    });

    it('sorts options by totalDue ascending', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildRebookOptions',
          availableFlights: [
            makeAvailFlight({ flightNumber: 'EXPENSIVE', fare: '900.00', seatsAvailable: 2 }),
            makeAvailFlight({ flightNumber: 'CHEAP', fare: '460.00', seatsAvailable: 2 }),
          ],
        }),
      });
      const opts = result.data.rebookOptions!.options;
      expect(Number(opts[0].totalDue)).toBeLessThanOrEqual(Number(opts[1].totalDue));
    });

    it('returns empty if no flights available', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildRebookOptions',
          availableFlights: [],
        }),
      });
      expect(result.data.rebookOptions!.totalOptions).toBe(0);
    });

    it('FLEX fare has 0.00 changeFee in options', async () => {
      const result = await agent.execute({
        data: makeInput({
          operation: 'buildRebookOptions',
          booking: makeBooking({ fareBasis: 'YFLEXUS' }),
          availableFlights: [makeAvailFlight()],
        }),
      });
      expect(result.data.rebookOptions!.options[0].changeFee).toBe('0.00');
    });
  });

  /* ---- Input validation ---- */
  describe('Input validation', () => {
    it('rejects unknown operation', async () => {
      await expect(
        agent.execute({
          data: {
            operation: 'unknown' as SelfServiceRebookingInput['operation'],
            booking: makeBooking(),
            reason: 'VOLUNTARY',
          },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects empty pnrRef', async () => {
      await expect(
        agent.execute({
          data: makeInput({ booking: makeBooking({ pnrRef: '' }) }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid currentFare', async () => {
      await expect(
        agent.execute({
          data: makeInput({ booking: makeBooking({ currentFare: 'abc' }) }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects calculateRebookFee without newFare', async () => {
      await expect(
        agent.execute({
          data: makeInput({ operation: 'calculateRebookFee' }),
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects calculateRebookFee with invalid newFare', async () => {
      await expect(
        agent.execute({
          data: makeInput({ operation: 'calculateRebookFee', newFare: 'xyz' }),
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  /* ---- Metadata ---- */
  describe('Output metadata', () => {
    it('includes agent_id in metadata', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['agent_id']).toBe('5.5');
    });

    it('includes operation in metadata', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.metadata!['operation']).toBe('validateRebookEligibility');
    });

    it('confidence is 1.0', async () => {
      const result = await agent.execute({ data: makeInput() });
      expect(result.confidence).toBe(1.0);
    });
  });
});
