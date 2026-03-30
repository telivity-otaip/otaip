/**
 * GDS/NDC Router — Agent 3.1
 *
 * Routes booking requests to the correct distribution channel
 * based on carrier config, codeshare rules, and NDC capability.
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
import type { GdsNdcRouterInput, GdsNdcRouterOutput, DistributionChannel, GdsSystem } from './types.js';
import { routeSegments } from './router-engine.js';

const IATA_CODE_RE = /^[A-Z0-9]{2}$/;
const AIRPORT_RE = /^[A-Z]{3}$/i;
const VALID_CHANNELS = new Set<DistributionChannel>(['GDS', 'NDC', 'DIRECT']);
const VALID_GDS = new Set<GdsSystem>(['AMADEUS', 'SABRE', 'TRAVELPORT']);

export class GdsNdcRouter
  implements Agent<GdsNdcRouterInput, GdsNdcRouterOutput>
{
  readonly id = '3.1';
  readonly name = 'GDS/NDC Router';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<GdsNdcRouterInput>,
  ): Promise<AgentOutput<GdsNdcRouterOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = routeSegments(input.data);

    const warnings: string[] = [];
    const directRoutes = result.routings.filter((r) => r.primary_channel === 'DIRECT');
    if (directRoutes.length > 0) {
      warnings.push(`${directRoutes.length} segment(s) routed to DIRECT channel — not bookable via GDS/NDC.`);
    }
    if (!result.unified_channel && result.routings.length > 1) {
      warnings.push('Mixed channel routing — segments require different distribution channels.');
    }
    const codeshares = result.routings.filter((r) => r.codeshare_applied);
    if (codeshares.length > 0) {
      warnings.push(`Codeshare routing applied for ${codeshares.length} segment(s).`);
    }

    return {
      data: result,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        segments: input.data.segments.length,
        unified_channel: result.unified_channel,
        recommended_channel: result.recommended_channel,
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

  private validateInput(data: GdsNdcRouterInput): void {
    if (!data.segments || !Array.isArray(data.segments) || data.segments.length === 0) {
      throw new AgentInputValidationError(this.id, 'segments', 'At least one segment required.');
    }

    for (let i = 0; i < data.segments.length; i++) {
      const seg = data.segments[i]!;
      if (!seg.marketing_carrier || !IATA_CODE_RE.test(seg.marketing_carrier)) {
        throw new AgentInputValidationError(this.id, `segments[${i}].marketing_carrier`, 'Must be a 2-letter IATA code.');
      }
      if (seg.operating_carrier && !IATA_CODE_RE.test(seg.operating_carrier)) {
        throw new AgentInputValidationError(this.id, `segments[${i}].operating_carrier`, 'Must be a 2-letter IATA code.');
      }
      if (!seg.origin || !AIRPORT_RE.test(seg.origin)) {
        throw new AgentInputValidationError(this.id, `segments[${i}].origin`, 'Must be a 3-letter IATA code.');
      }
      if (!seg.destination || !AIRPORT_RE.test(seg.destination)) {
        throw new AgentInputValidationError(this.id, `segments[${i}].destination`, 'Must be a 3-letter IATA code.');
      }
    }

    if (data.preferred_channel && !VALID_CHANNELS.has(data.preferred_channel)) {
      throw new AgentInputValidationError(this.id, 'preferred_channel', 'Must be GDS, NDC, or DIRECT.');
    }

    if (data.preferred_gds && !VALID_GDS.has(data.preferred_gds)) {
      throw new AgentInputValidationError(this.id, 'preferred_gds', 'Must be AMADEUS, SABRE, or TRAVELPORT.');
    }
  }
}

export type {
  GdsNdcRouterInput,
  GdsNdcRouterOutput,
  RoutingSegment,
  ChannelRouting,
  CarrierChannelConfig,
  DistributionChannel,
  NdcVersion,
  GdsSystem,
  GdsPnrFormat,
  GdsPnrSegment,
  NdcOrderFormat,
  NdcOfferItem,
} from './types.js';
