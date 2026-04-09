/**
 * Airline Code & Alliance Mapper — Agent 0.2
 *
 * Resolves IATA/ICAO airline designator codes to canonical airline records
 * with alliance membership mapping and codeshare partner networks.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type { AirlineCodeMapperInput, AirlineCodeMapperOutput } from './types.js';
import {
  AIRLINES,
  CODESHARE_MAPPINGS,
  initAirlineFuseIndex,
  resetAirlineFuseIndex,
} from './data.js';
import { buildIndexes, resolve } from './resolver.js';
import type { AirlineIndexes } from './resolver.js';

const VALID_CODE_TYPES = new Set(['iata', 'icao', 'name', 'auto']);

export class AirlineCodeMapper implements Agent<AirlineCodeMapperInput, AirlineCodeMapperOutput> {
  readonly id = '0.2';
  readonly name = 'Airline Code & Alliance Mapper';
  readonly version = '0.1.0';

  private indexes: AirlineIndexes | null = null;
  private initializedAt: Date | null = null;

  async initialize(): Promise<void> {
    this.indexes = buildIndexes(AIRLINES, CODESHARE_MAPPINGS);
    initAirlineFuseIndex(AIRLINES);
    this.initializedAt = new Date();
  }

  async execute(
    input: AgentInput<AirlineCodeMapperInput>,
  ): Promise<AgentOutput<AirlineCodeMapperOutput>> {
    if (!this.indexes) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = resolve(input.data, this.indexes);

    return {
      data: result,
      confidence: result.match_confidence,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        airline_count: AIRLINES.length,
        initialized_at: this.initializedAt?.toISOString() ?? null,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.indexes) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }

    if (AIRLINES.length === 0) {
      return { status: 'unhealthy', details: 'Airline dataset is empty.' };
    }

    return { status: 'healthy' };
  }

  private validateInput(data: AirlineCodeMapperInput): void {
    if (!data.code || typeof data.code !== 'string') {
      throw new AgentInputValidationError(
        this.id,
        'code',
        'Required string field. Provide an IATA, ICAO code, or airline name.',
      );
    }

    const trimmed = data.code.trim();
    if (trimmed.length < 1 || trimmed.length > 100) {
      throw new AgentInputValidationError(this.id, 'code', 'Must be 1-100 characters.');
    }

    if (data.code_type !== undefined && !VALID_CODE_TYPES.has(data.code_type)) {
      throw new AgentInputValidationError(
        this.id,
        'code_type',
        `Must be one of: ${[...VALID_CODE_TYPES].join(', ')}`,
      );
    }
  }

  /**
   * Tear down resources (used in testing).
   */
  destroy(): void {
    this.indexes = null;
    this.initializedAt = null;
    resetAirlineFuseIndex();
  }
}

export type { AirlineCodeMapperInput, AirlineCodeMapperOutput } from './types.js';
export type {
  ResolvedAirline,
  CodesharePartner,
  AirlineCodeType,
  AirlineStatus,
  AllianceName,
  AllianceStatus,
  CodeshareRelationship,
} from './types.js';
