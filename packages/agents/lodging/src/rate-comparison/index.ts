/**
 * Agent 4.4 — Hotel Rate Comparison Agent
 *
 * Compares rates for the same canonical property across all sources,
 * identifies best available rate per rate type, detects rate parity violations,
 * and presents pricing transparently with ALL mandatory fees included.
 *
 * Downstream: Feeds Agent 4.5 (Hotel Booking) with best rate selection
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
import type { RateCompInput, RateCompOutput } from './types.js';
import { comparePropertyRates } from './rate-comparator.js';

/** Default stay length for cost calculation when dates aren't available */
const DEFAULT_NIGHTS = 1;
const DEFAULT_GUESTS = 2;

export class RateComparisonAgent
  implements Agent<RateCompInput, RateCompOutput>
{
  readonly id = '4.4';
  readonly name = 'Hotel Rate Comparison';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<RateCompInput>,
  ): Promise<AgentOutput<RateCompOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const nights = input.data.nights ?? DEFAULT_NIGHTS;
    const comparisons = input.data.properties.map((property) => {
      return comparePropertyRates(property, nights, DEFAULT_GUESTS);
    });

    let parityViolations = 0;
    const warnings: string[] = [];

    for (const comp of comparisons) {
      if (comp.parity && !comp.parity.isAtParity) {
        parityViolations++;
        warnings.push(
          `Rate parity violation for ${comp.propertyName}: ${comp.parity.spreadPercent}% spread between ${comp.parity.lowestSource} and ${comp.parity.highestSource}`,
        );
      }
    }

    return {
      data: {
        comparisons,
        totalProperties: comparisons.length,
        parityViolations,
      },
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        parity_violations: parityViolations,
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

  private validateInput(data: RateCompInput): void {
    if (!data.properties || !Array.isArray(data.properties)) {
      throw new AgentInputValidationError(this.id, 'properties', 'Properties array is required');
    }
  }
}

export type {
  RateCompInput, RateCompOutput, ComparedRate,
  TotalCostBreakdown, ParityResult, PropertyRateComparison,
} from './types.js';
