/**
 * Fare Basis Code Decoder — Agent 0.3
 *
 * Decodes ATPCO-standard fare basis codes into human-readable components
 * including cabin class, fare restrictions, advance purchase requirements,
 * and penalty information.
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
  FareBasisDecoderInput,
  FareBasisDecoderOutput,
} from './types.js';
import { decodeFareBasis } from './decoder.js';

export class FareBasisDecoder
  implements Agent<FareBasisDecoderInput, FareBasisDecoderOutput>
{
  readonly id = '0.3';
  readonly name = 'Fare Basis Code Decoder';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    // No data to load — all decoding logic is inline pattern matching.
    this.initialized = true;
  }

  async execute(
    input: AgentInput<FareBasisDecoderInput>,
  ): Promise<AgentOutput<FareBasisDecoderOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = decodeFareBasis(input.data.fare_basis);

    return {
      data: result,
      confidence: result.match_confidence,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }

    return { status: 'healthy' };
  }

  private validateInput(data: FareBasisDecoderInput): void {
    if (!data.fare_basis || typeof data.fare_basis !== 'string') {
      throw new AgentInputValidationError(
        this.id,
        'fare_basis',
        'Required string field. Provide an ATPCO fare basis code.',
      );
    }

    const trimmed = data.fare_basis.trim();
    if (trimmed.length < 1 || trimmed.length > 15) {
      throw new AgentInputValidationError(
        this.id,
        'fare_basis',
        'Must be 1-15 characters (ATPCO standard).',
      );
    }
  }

  /**
   * Tear down resources (used in testing).
   */
  destroy(): void {
    this.initialized = false;
  }
}

export type { FareBasisDecoderInput, FareBasisDecoderOutput } from './types.js';
export type {
  DecodedFareBasis,
  CabinClass,
  FareType,
  Season,
  DayOfWeek,
  AdvancePurchase,
  StayRequirement,
  FarePenalties,
} from './types.js';
