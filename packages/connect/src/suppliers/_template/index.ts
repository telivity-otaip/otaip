/**
 * Template adapter — copy this to create a new supplier implementation.
 * Replace all `Template` references with your supplier name.
 */

import type {
  ConnectAdapter,
  SearchFlightsInput,
  FlightOffer,
  PassengerCount,
  PricedItinerary,
  CreateBookingInput,
  BookingResult,
  BookingStatusResult,
} from '../../types.js';

export interface TemplateConfig {
  baseUrl: string;
  apiKey: string;
}

export class TemplateAdapter implements ConnectAdapter {
  readonly supplierId = 'template';
  readonly supplierName = 'Template Supplier';

  constructor(private config: TemplateConfig) {}

  async searchFlights(_input: SearchFlightsInput): Promise<FlightOffer[]> {
    throw new Error('Not implemented — replace with supplier API call');
  }

  async priceItinerary(_offerId: string, _passengers: PassengerCount): Promise<PricedItinerary> {
    throw new Error('Not implemented');
  }

  async createBooking(_input: CreateBookingInput): Promise<BookingResult> {
    throw new Error('Not implemented');
  }

  async getBookingStatus(_bookingId: string): Promise<BookingStatusResult> {
    throw new Error('Not implemented');
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    throw new Error('Not implemented');
  }
}
