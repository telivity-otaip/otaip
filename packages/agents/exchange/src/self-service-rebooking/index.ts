/**
 * Self-Service Rebooking — Agent 5.5
 *
 * Self-service rebooking eligibility validation, fee calculation,
 * and rebooking option generation.
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
import Decimal from 'decimal.js';
import type {
  SelfServiceRebookingInput,
  SelfServiceRebookingOutput,
  OriginalBooking,
  EligibilityAssessment,
  RebookFeeCalculation,
  RebookOption,
  RebookOptionsResult,
} from './types.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const VOLUNTARY_CHANGE_FEE = new Decimal('150.00');
const ZERO = new Decimal('0.00');
const DEPARTURE_PROXIMITY_MINUTES = 120; // 2 hours
const SCHEDULE_CHANGE_THRESHOLD_MINUTES = 60;

/** Fare bases starting with B or G are not eligible */
const INELIGIBLE_FARE_PREFIXES = new Set(['B', 'G']);

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function isFlex(fareBasis: string): boolean {
  return fareBasis.toUpperCase().includes('FLEX');
}

function minutesBetween(a: string, b: string): number {
  return Math.abs(
    (new Date(b).getTime() - new Date(a).getTime()) / 60_000,
  );
}

/* ------------------------------------------------------------------ */
/*  Agent class                                                       */
/* ------------------------------------------------------------------ */

export class SelfServiceRebookingAgent
  implements Agent<SelfServiceRebookingInput, SelfServiceRebookingOutput>
{
  readonly id = '5.5';
  readonly name = 'Self-Service Rebooking';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<SelfServiceRebookingInput>,
  ): Promise<AgentOutput<SelfServiceRebookingOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    const { operation } = input.data;

    switch (operation) {
      case 'validateRebookEligibility':
        return this.handleValidateEligibility(input.data);
      case 'calculateRebookFee':
        return this.handleCalculateRebookFee(input.data);
      case 'buildRebookOptions':
        return this.handleBuildRebookOptions(input.data);
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
    this.initialized = false;
  }

  /* ---------------------------------------------------------------- */
  /*  validateRebookEligibility                                       */
  /* ---------------------------------------------------------------- */

  private handleValidateEligibility(
    data: SelfServiceRebookingInput,
  ): AgentOutput<SelfServiceRebookingOutput> {
    this.validateBooking(data.booking);

    const booking = data.booking;
    const reason = data.reason;

    // MEDICAL or BEREAVEMENT -> must call agent
    if (reason === 'MEDICAL' || reason === 'BEREAVEMENT') {
      const eligibility: EligibilityAssessment = {
        result: 'MUST_CALL_AGENT',
        reason: `${reason} rebooking requires agent assistance.`,
        feeWaived: false,
        isScheduleChange: false,
      };
      return this.wrapEligibility(eligibility, data);
    }

    // Departure within 2 hours -> must call agent
    if (data.currentDateTime) {
      const minToDeparture = minutesBetween(
        data.currentDateTime,
        booking.departureDateTime,
      );
      if (minToDeparture < DEPARTURE_PROXIMITY_MINUTES) {
        const eligibility: EligibilityAssessment = {
          result: 'MUST_CALL_AGENT',
          reason: 'Departure within 2 hours — agent assistance required.',
          feeWaived: false,
          isScheduleChange: false,
        };
        return this.wrapEligibility(eligibility, data);
      }
    }

    // Origin or destination change -> must call agent
    if (data.request) {
      if (
        data.request.desiredOrigin !== booking.origin ||
        data.request.desiredDestination !== booking.destination
      ) {
        const eligibility: EligibilityAssessment = {
          result: 'MUST_CALL_AGENT',
          reason: 'Origin or destination change requires agent assistance.',
          feeWaived: false,
          isScheduleChange: false,
        };
        return this.wrapEligibility(eligibility, data);
      }
    }

    // Fare basis starting with B or G -> not eligible
    const farePrefix = booking.fareBasis.charAt(0).toUpperCase();
    if (INELIGIBLE_FARE_PREFIXES.has(farePrefix)) {
      const eligibility: EligibilityAssessment = {
        result: 'NOT_ELIGIBLE',
        reason: `Fare basis ${booking.fareBasis} is not eligible for self-service rebooking.`,
        feeWaived: false,
        isScheduleChange: false,
      };
      return this.wrapEligibility(eligibility, data);
    }

    // SCHEDULE_CHANGE with >60 min difference -> eligible, no fee
    if (reason === 'SCHEDULE_CHANGE') {
      const changeMin = data.scheduleChangeMinutes ?? 0;
      if (changeMin > SCHEDULE_CHANGE_THRESHOLD_MINUTES) {
        const eligibility: EligibilityAssessment = {
          result: 'ELIGIBLE',
          reason: `Schedule change of ${changeMin} minutes qualifies for free rebooking.`,
          feeWaived: true,
          isScheduleChange: true,
        };
        return this.wrapEligibility(eligibility, data);
      }
    }

    // Default: eligible (voluntary)
    const eligibility: EligibilityAssessment = {
      result: 'ELIGIBLE',
      reason: 'Eligible for self-service rebooking.',
      feeWaived: false,
      isScheduleChange: false,
    };
    return this.wrapEligibility(eligibility, data);
  }

  private wrapEligibility(
    eligibility: EligibilityAssessment,
    data: SelfServiceRebookingInput,
  ): AgentOutput<SelfServiceRebookingOutput> {
    return {
      data: { eligibility },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: 'validateRebookEligibility',
        pnrRef: data.booking.pnrRef,
        result: eligibility.result,
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /*  calculateRebookFee                                              */
  /* ---------------------------------------------------------------- */

  private handleCalculateRebookFee(
    data: SelfServiceRebookingInput,
  ): AgentOutput<SelfServiceRebookingOutput> {
    this.validateBooking(data.booking);

    if (data.newFare === undefined || data.newFare === null) {
      throw new AgentInputValidationError(
        this.id,
        'newFare',
        'newFare is required for calculateRebookFee.',
      );
    }
    if (isNaN(Number(data.newFare))) {
      throw new AgentInputValidationError(
        this.id,
        'newFare',
        'newFare must be a valid decimal string.',
      );
    }

    const booking = data.booking;
    const currentFare = new Decimal(booking.currentFare);
    const newFare = new Decimal(data.newFare);
    const fareDifference = newFare.minus(currentFare);

    // Determine change fee
    let changeFee: Decimal;
    const feeWaived =
      booking.hasWaiver === true ||
      data.reason === 'SCHEDULE_CHANGE' ||
      isFlex(booking.fareBasis);

    if (feeWaived) {
      changeFee = ZERO;
    } else if (data.reason === 'VOLUNTARY') {
      changeFee = VOLUNTARY_CHANGE_FEE;
    } else {
      changeFee = VOLUNTARY_CHANGE_FEE;
    }

    // Total due = max(changeFee + fareDifference, 0)
    const totalDue = Decimal.max(changeFee.plus(fareDifference), ZERO);

    const fee: RebookFeeCalculation = {
      changeFee: changeFee.toFixed(2),
      fareDifference: fareDifference.toFixed(2),
      totalDue: totalDue.toFixed(2),
      currency: booking.currency,
      feeWaived,
      summary: feeWaived
        ? `Fee waived. Fare difference: ${booking.currency} ${fareDifference.toFixed(2)}. Total due: ${booking.currency} ${totalDue.toFixed(2)}.`
        : `Change fee: ${booking.currency} ${changeFee.toFixed(2)}. Fare difference: ${booking.currency} ${fareDifference.toFixed(2)}. Total due: ${booking.currency} ${totalDue.toFixed(2)}.`,
    };

    return {
      data: { fee },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: 'calculateRebookFee',
        pnrRef: booking.pnrRef,
        totalDue: fee.totalDue,
        feeWaived,
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /*  buildRebookOptions                                              */
  /* ---------------------------------------------------------------- */

  private handleBuildRebookOptions(
    data: SelfServiceRebookingInput,
  ): AgentOutput<SelfServiceRebookingOutput> {
    this.validateBooking(data.booking);

    const flights = data.availableFlights ?? [];
    const booking = data.booking;
    const currentFare = new Decimal(booking.currentFare);

    const feeWaived =
      booking.hasWaiver === true ||
      data.reason === 'SCHEDULE_CHANGE' ||
      isFlex(booking.fareBasis);

    const baseFee = feeWaived ? ZERO : VOLUNTARY_CHANGE_FEE;

    const options: RebookOption[] = flights
      .filter((f) => f.seatsAvailable > 0)
      .map((f) => {
        const newFare = new Decimal(f.fare);
        const fareDifference = newFare.minus(currentFare);
        const totalDue = Decimal.max(baseFee.plus(fareDifference), ZERO);

        return {
          flightKey: `${f.carrier}${f.flightNumber}-${f.departure}`,
          carrier: f.carrier,
          flightNumber: f.flightNumber,
          departure: f.departure,
          cabin: f.cabin,
          newFare: newFare.toFixed(2),
          changeFee: baseFee.toFixed(2),
          fareDifference: fareDifference.toFixed(2),
          totalDue: totalDue.toFixed(2),
          currency: f.currency,
          seatsAvailable: f.seatsAvailable,
        };
      });

    // Sort by totalDue ascending
    options.sort((a, b) => {
      const da = new Decimal(a.totalDue);
      const db = new Decimal(b.totalDue);
      return da.comparedTo(db);
    });

    const rebookOptions: RebookOptionsResult = {
      options,
      totalOptions: options.length,
    };

    return {
      data: { rebookOptions },
      confidence: 1.0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation: 'buildRebookOptions',
        pnrRef: booking.pnrRef,
        totalOptions: rebookOptions.totalOptions,
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Validation                                                      */
  /* ---------------------------------------------------------------- */

  private validateBooking(booking: OriginalBooking): void {
    if (!booking.pnrRef || booking.pnrRef.trim().length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'pnrRef',
        'pnrRef is required.',
      );
    }
    if (!booking.passengerName || booking.passengerName.trim().length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'passengerName',
        'passengerName is required.',
      );
    }
    if (!booking.fareBasis || booking.fareBasis.trim().length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'fareBasis',
        'fareBasis is required.',
      );
    }
    if (!booking.currentFare || isNaN(Number(booking.currentFare))) {
      throw new AgentInputValidationError(
        this.id,
        'currentFare',
        'currentFare must be a valid decimal string.',
      );
    }
    if (!booking.origin || booking.origin.trim().length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'origin',
        'origin is required.',
      );
    }
    if (!booking.destination || booking.destination.trim().length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'destination',
        'destination is required.',
      );
    }
  }
}

export type {
  SelfServiceRebookingInput,
  SelfServiceRebookingOutput,
  RebookOperation,
  RebookReason,
  EligibilityResult,
  OriginalBooking,
  RebookRequest,
  AvailableRebookFlight,
  EligibilityAssessment,
  RebookFeeCalculation,
  RebookOption,
  RebookOptionsResult,
} from './types.js';
