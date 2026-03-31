import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type { AncillaryShoppingInput, AncillaryShoppingOutput, AncillaryOffer } from './types.js';

export interface AncillaryAdapter { name: string; searchAncillaries(input: AncillaryShoppingInput): Promise<AncillaryOffer[]>; }

export class AncillaryShoppingAgent implements Agent<AncillaryShoppingInput, AncillaryShoppingOutput> {
  readonly id = '1.5';
  readonly name = 'Ancillary Shopping';
  readonly version = '0.1.0';
  private initialized = false;
  private adapter?: AncillaryAdapter;

  setAdapter(adapter: AncillaryAdapter): void { this.adapter = adapter; }

  async initialize(): Promise<void> { this.initialized = true; }

  async execute(input: AgentInput<AncillaryShoppingInput>): Promise<AgentOutput<AncillaryShoppingOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);
    const d = input.data;
    if (!d.segments?.length) throw new AgentInputValidationError(this.id, 'segments', 'At least one segment required.');
    if (!d.passengers?.length) throw new AgentInputValidationError(this.id, 'passengers', 'At least one passenger required.');

    if (this.adapter) {
      const ancillaries = await this.adapter.searchAncillaries(d);
      return { data: { ancillaries, notSupportedByAdapter: false, currency: ancillaries[0]?.price.currency ?? 'USD' }, confidence: 1.0, metadata: { agent_id: this.id } };
    }

    // No adapter — return empty with flag
    return { data: { ancillaries: [], notSupportedByAdapter: true, currency: 'USD' }, confidence: 0, metadata: { agent_id: this.id } };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }
  destroy(): void { this.initialized = false; }
}

export type { AncillaryShoppingInput, AncillaryShoppingOutput, AncillaryOffer, AncillaryCategory, RficCode, AncillarySegment, AncillaryPassenger, AncillaryPrice, PassengerType } from './types.js';
