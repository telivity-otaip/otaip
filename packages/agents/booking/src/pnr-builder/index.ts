/**
 * PNR Builder — Agent 3.2
 *
 * Constructs GDS-ready PNR commands from normalized booking data.
 * Supports Amadeus, Sabre, and Travelport syntax.
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
import type { PnrBuilderInput, PnrBuilderOutput, GdsSystem, SsrCode } from './types.js';
import { buildPnrCommands } from './command-builder.js';

const VALID_GDS = new Set<GdsSystem>(['AMADEUS', 'SABRE', 'TRAVELPORT']);
const IATA_CODE_RE = /^[A-Z]{2,3}$/i;
const AIRPORT_RE = /^[A-Z]{3}$/i;
const NAME_RE = /^[A-Za-z\s'-]+$/;
const VALID_PAX_TYPES = new Set(['ADT', 'CHD', 'INF']);
const VALID_SEG_STATUS = new Set(['SS', 'NN', 'GK']);
const VALID_SSR_CODES = new Set<SsrCode>(['WCHR', 'VGML', 'DOCS', 'FOID', 'CTCE', 'CTCM', 'INFT']);

export class PnrBuilder
  implements Agent<PnrBuilderInput, PnrBuilderOutput>
{
  readonly id = '3.2';
  readonly name = 'PNR Builder';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<PnrBuilderInput>,
  ): Promise<AgentOutput<PnrBuilderOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = buildPnrCommands(input.data);

    const warnings: string[] = [];
    if (result.is_group) {
      warnings.push(`Group PNR with ${result.passenger_count} passengers.`);
    }
    if (result.infant_count > 0) {
      warnings.push(`${result.infant_count} infant(s) in booking — verify lap infant rules.`);
    }

    // Check for missing APIS data on international segments
    const hasInternational = input.data.segments.some((s) => s.origin !== s.destination);
    if (hasInternational) {
      const missingApis = input.data.passengers.filter(
        (p) => p.passenger_type !== 'INF' && !p.passport_number,
      );
      if (missingApis.length > 0) {
        warnings.push(`${missingApis.length} passenger(s) missing APIS/passport data.`);
      }
    }

    return {
      data: result,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        gds: input.data.gds,
        passenger_count: result.passenger_count,
        segment_count: result.segment_count,
        command_count: result.commands.length,
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

  private validateInput(data: PnrBuilderInput): void {
    if (!VALID_GDS.has(data.gds)) {
      throw new AgentInputValidationError(this.id, 'gds', 'Must be AMADEUS, SABRE, or TRAVELPORT.');
    }

    if (!data.passengers || data.passengers.length === 0) {
      throw new AgentInputValidationError(this.id, 'passengers', 'At least one passenger required.');
    }

    for (let i = 0; i < data.passengers.length; i++) {
      const pax = data.passengers[i]!;
      if (!pax.last_name || !NAME_RE.test(pax.last_name)) {
        throw new AgentInputValidationError(this.id, `passengers[${i}].last_name`, 'Invalid name format.');
      }
      if (!pax.first_name || !NAME_RE.test(pax.first_name)) {
        throw new AgentInputValidationError(this.id, `passengers[${i}].first_name`, 'Invalid name format.');
      }
      if (!VALID_PAX_TYPES.has(pax.passenger_type)) {
        throw new AgentInputValidationError(this.id, `passengers[${i}].passenger_type`, 'Must be ADT, CHD, or INF.');
      }
      if (pax.passenger_type === 'INF' && pax.infant_accompanying_adult === undefined) {
        throw new AgentInputValidationError(this.id, `passengers[${i}].infant_accompanying_adult`, 'Required for infant passengers.');
      }
    }

    if (!data.segments || data.segments.length === 0) {
      throw new AgentInputValidationError(this.id, 'segments', 'At least one segment required.');
    }

    for (let i = 0; i < data.segments.length; i++) {
      const seg = data.segments[i]!;
      if (!seg.carrier || !IATA_CODE_RE.test(seg.carrier)) {
        throw new AgentInputValidationError(this.id, `segments[${i}].carrier`, 'Must be a 2-3 letter IATA code.');
      }
      if (!seg.origin || !AIRPORT_RE.test(seg.origin)) {
        throw new AgentInputValidationError(this.id, `segments[${i}].origin`, 'Must be a 3-letter IATA code.');
      }
      if (!seg.destination || !AIRPORT_RE.test(seg.destination)) {
        throw new AgentInputValidationError(this.id, `segments[${i}].destination`, 'Must be a 3-letter IATA code.');
      }
      if (!VALID_SEG_STATUS.has(seg.status)) {
        throw new AgentInputValidationError(this.id, `segments[${i}].status`, 'Must be SS, NN, or GK.');
      }
    }

    if (!data.contacts || data.contacts.length === 0) {
      throw new AgentInputValidationError(this.id, 'contacts', 'At least one contact required.');
    }

    if (!data.ticketing) {
      throw new AgentInputValidationError(this.id, 'ticketing', 'Ticketing arrangement required.');
    }

    if (!data.received_from || data.received_from.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'received_from', 'Received-from field required.');
    }

    if (data.is_group && (!data.group_name || data.group_name.trim().length === 0)) {
      throw new AgentInputValidationError(this.id, 'group_name', 'Group name required for group PNR.');
    }

    if (data.ssrs) {
      for (let i = 0; i < data.ssrs.length; i++) {
        if (!VALID_SSR_CODES.has(data.ssrs[i]!.code)) {
          throw new AgentInputValidationError(this.id, `ssrs[${i}].code`, `Must be one of: ${[...VALID_SSR_CODES].join(', ')}.`);
        }
      }
    }
  }
}

export type {
  PnrBuilderInput,
  PnrBuilderOutput,
  PnrCommand,
  PnrPassenger,
  PnrSegment,
  PnrContact,
  PnrTicketing,
  SsrElement,
  OsiElement,
  GdsSystem as PnrGdsSystem,
  SsrCode,
} from './types.js';
