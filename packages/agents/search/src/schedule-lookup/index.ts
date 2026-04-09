/**
 * Schedule Lookup — Agent 1.2
 *
 * Looks up flight schedules with SSIM operating day parsing,
 * codeshare detection, and connection discovery.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type { ScheduleLookupInput, ScheduleLookupOutput, ConnectionOption } from './types.js';
import { querySchedules, findConnections } from './schedule-data.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const IATA_CODE_RE = /^[A-Z]{2,3}$/i;
const FLIGHT_NUM_RE = /^[A-Z0-9]{1,5}$/i;

export class ScheduleLookup implements Agent<ScheduleLookupInput, ScheduleLookupOutput> {
  readonly id = '1.2';
  readonly name = 'Schedule Lookup';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<ScheduleLookupInput>,
  ): Promise<AgentOutput<ScheduleLookupOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const data = input.data;
    const includeCodeshares = data.include_codeshares !== false;

    // Query direct flights
    const flights = querySchedules({
      origin: data.origin.toUpperCase().trim(),
      destination: data.destination.toUpperCase().trim(),
      carrier: data.carrier?.toUpperCase().trim(),
      flightNumber: data.flight_number?.trim(),
      date: data.date,
      includeCodeshares,
    });

    // Query connections if requested
    let connections: ConnectionOption[] | null = null;
    if (data.include_connections) {
      const rawConnections = findConnections(
        data.origin.toUpperCase().trim(),
        data.destination.toUpperCase().trim(),
        data.date,
        includeCodeshares,
      );

      connections = rawConnections.map((c) => ({
        first_leg: c.firstLeg,
        second_leg: c.secondLeg,
        connection_minutes: c.connectionMinutes,
        connection_airport: c.connectionAirport,
        total_duration_minutes:
          c.firstLeg.duration_minutes + c.connectionMinutes + c.secondLeg.duration_minutes,
      }));
    }

    const operatesOnDate = flights.length > 0;

    return {
      data: {
        flights,
        connections,
        operates_on_date: operatesOnDate,
      },
      confidence: flights.length > 0 ? 1.0 : 0,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        direct_flight_count: flights.length,
        connection_count: connections?.length ?? 0,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
  }

  private validateInput(data: ScheduleLookupInput): void {
    if (!data.origin || typeof data.origin !== 'string' || data.origin.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'origin', 'Required non-empty string.');
    }

    if (!IATA_CODE_RE.test(data.origin.trim())) {
      throw new AgentInputValidationError(this.id, 'origin', 'Must be a 2-3 letter IATA code.');
    }

    if (
      !data.destination ||
      typeof data.destination !== 'string' ||
      data.destination.trim().length === 0
    ) {
      throw new AgentInputValidationError(this.id, 'destination', 'Required non-empty string.');
    }

    if (!IATA_CODE_RE.test(data.destination.trim())) {
      throw new AgentInputValidationError(
        this.id,
        'destination',
        'Must be a 2-3 letter IATA code.',
      );
    }

    if (!data.date || !ISO_DATE_RE.test(data.date)) {
      throw new AgentInputValidationError(this.id, 'date', 'Required ISO 8601 date (YYYY-MM-DD).');
    }

    if (data.carrier !== undefined && !IATA_CODE_RE.test(data.carrier.trim())) {
      throw new AgentInputValidationError(this.id, 'carrier', 'Must be a 2-3 letter IATA code.');
    }

    if (data.flight_number !== undefined) {
      if (!data.carrier) {
        throw new AgentInputValidationError(
          this.id,
          'flight_number',
          'Carrier is required when specifying flight_number.',
        );
      }
      if (!FLIGHT_NUM_RE.test(data.flight_number.trim())) {
        throw new AgentInputValidationError(
          this.id,
          'flight_number',
          'Must be 1-5 alphanumeric characters.',
        );
      }
    }
  }
}

export type {
  ScheduleLookupInput,
  ScheduleLookupOutput,
  ScheduledFlight,
  OperatingSchedule,
  ConnectionOption,
  DayOfWeek,
} from './types.js';
export { parseSsimDays, operatesOnDate, getDayOfWeek } from './schedule-data.js';
