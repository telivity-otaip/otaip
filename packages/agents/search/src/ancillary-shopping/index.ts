import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type { AncillaryShoppingInput, AncillaryShoppingOutput, AncillaryOffer, AncillaryCategory, RficCode } from './types.js';

const RFIC_MAP: Record<AncillaryCategory, RficCode> = {
  BAGGAGE: 'C', SEAT: 'A', MEAL: 'G', LOUNGE: 'E', WIFI: 'G', PRIORITY: 'E', OTHER: 'I',
};

const MOCK_ANCILLARIES: Array<{ category: AncillaryCategory; description: string; amount: string; perSegment: boolean }> = [
  { category: 'BAGGAGE', description: 'Extra checked bag 23kg', amount: '45.00', perSegment: true },
  { category: 'BAGGAGE', description: 'Overweight bag 32kg', amount: '75.00', perSegment: true },
  { category: 'SEAT', description: 'Preferred seat selection', amount: '25.00', perSegment: true },
  { category: 'SEAT', description: 'Extra legroom seat', amount: '60.00', perSegment: true },
  { category: 'MEAL', description: 'Premium meal pre-order', amount: '18.00', perSegment: true },
  { category: 'LOUNGE', description: 'Lounge access pass', amount: '55.00', perSegment: false },
  { category: 'WIFI', description: 'In-flight WiFi', amount: '12.00', perSegment: true },
  { category: 'PRIORITY', description: 'Priority boarding', amount: '15.00', perSegment: false },
];

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

    // No adapter — generate mock offers
    const cats = d.requestedCategories ? new Set(d.requestedCategories) : null;
    let nextId = 1;
    const ancillaries: AncillaryOffer[] = [];
    for (const mock of MOCK_ANCILLARIES) {
      if (cats && !cats.has(mock.category)) continue;
      const segRefs = d.segments.map((s) => `${s.carrier}${s.flightNumber}`);
      const paxRefs = d.passengers.map((p) => p.passengerRef);
      ancillaries.push({
        ancillaryId: `ANC${String(nextId++).padStart(4, '0')}`,
        category: mock.category,
        rfic: RFIC_MAP[mock.category],
        description: mock.description,
        segmentRefs: mock.perSegment ? segRefs : [segRefs[0]!],
        passengerRefs: paxRefs,
        price: { amount: mock.amount, currency: 'USD', perPassenger: true, perSegment: mock.perSegment },
        conditions: '',
        available: true,
      });
    }

    return { data: { ancillaries, notSupportedByAdapter: false, currency: 'USD' }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }
  destroy(): void { this.initialized = false; }
}

export type { AncillaryShoppingInput, AncillaryShoppingOutput, AncillaryOffer, AncillaryCategory, RficCode, AncillarySegment, AncillaryPassenger, AncillaryPrice, PassengerType } from './types.js';
