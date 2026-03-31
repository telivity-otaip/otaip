import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type { HotelCarSearchInput, HotelCarSearchOutput } from './types.js';

export class HotelCarSearchAgent implements Agent<HotelCarSearchInput, HotelCarSearchOutput> {
  readonly id = '1.7';
  readonly name = 'Hotel & Car Search';
  readonly version = '0.1.0';
  private initialized = false;

  async initialize(): Promise<void> { this.initialized = true; }

  async execute(input: AgentInput<HotelCarSearchInput>): Promise<AgentOutput<HotelCarSearchOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);
    const d = input.data;
    if (!d.operation) throw new AgentInputValidationError(this.id, 'operation', 'Must be searchHotels or searchCars.');

    if (d.operation === 'searchHotels') {
      if (!d.hotel) throw new AgentInputValidationError(this.id, 'hotel', 'Hotel search input required.');
      return { data: { hotelResults: { hotels: [], currency: d.hotel.currency ?? 'USD', noAdaptersConfigured: true } }, confidence: 1.0, metadata: { agent_id: this.id } };
    }
    if (d.operation === 'searchCars') {
      if (!d.car) throw new AgentInputValidationError(this.id, 'car', 'Car search input required.');
      return { data: { carResults: { cars: [], currency: 'USD', noAdaptersConfigured: true } }, confidence: 1.0, metadata: { agent_id: this.id } };
    }
    throw new AgentInputValidationError(this.id, 'operation', 'Must be searchHotels or searchCars.');
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }
  destroy(): void { this.initialized = false; }
}

export type { HotelCarSearchInput, HotelCarSearchOutput, HotelSearchInput, HotelSearchOutput, HotelOffer, HotelAdapter, CarSearchInput, CarSearchOutput, CarOffer, CarAdapter, CarCategory, HotelCarOperation } from './types.js';
