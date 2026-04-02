import { describe, it, expect } from 'vitest';
import { generateOpenAPISpec } from '../openapi-generator.js';
import { generateGptInstructions } from '../gpt-instructions.js';
import type {
  ConnectAdapter,
  SearchFlightsInput,
  FlightOffer,
  PassengerCount,
  PricedItinerary,
  CreateBookingInput,
  BookingResult,
  BookingStatusResult,
} from '../../../types.js';

function createMockAdapter(opts?: { withOptional?: boolean }): ConnectAdapter {
  const withOptional = opts?.withOptional ?? true;

  const adapter: ConnectAdapter = {
    supplierId: 'mock',
    supplierName: 'Mock Supplier',

    async searchFlights(_input: SearchFlightsInput): Promise<FlightOffer[]> {
      return [{
        offerId: 'offer-1',
        supplier: 'mock',
        validatingCarrier: 'AA',
        segments: [[{
          origin: 'JFK',
          destination: 'LHR',
          marketingCarrier: 'AA',
          flightNumber: 'AA100',
          departure: '2026-06-15T08:00:00',
          arrival: '2026-06-15T20:00:00',
          cabinClass: 'economy',
          bookingClass: 'Y',
          stops: 0,
        }]],
        fares: [{
          passengerType: 'adult',
          baseFare: { amount: '500.00', currency: 'USD' },
          taxes: { amount: '100.00', currency: 'USD' },
          total: { amount: '600.00', currency: 'USD' },
          count: 1,
        }],
        totalPrice: { amount: '600.00', currency: 'USD' },
        fareType: 'published',
        cabinClass: 'economy',
        refundable: false,
        changeable: true,
      }];
    },

    async priceItinerary(_offerId: string, _passengers: PassengerCount): Promise<PricedItinerary> {
      return {
        offerId: 'offer-1',
        supplier: 'mock',
        totalPrice: { amount: '600.00', currency: 'USD' },
        fares: [{
          passengerType: 'adult',
          baseFare: { amount: '500.00', currency: 'USD' },
          taxes: { amount: '100.00', currency: 'USD' },
          total: { amount: '600.00', currency: 'USD' },
          count: 1,
        }],
        fareRules: { refundable: false, changeable: true },
        priceChanged: false,
        available: true,
      };
    },

    async createBooking(_input: CreateBookingInput): Promise<BookingResult> {
      return {
        bookingId: 'BK-001',
        supplier: 'mock',
        status: 'held',
        pnr: 'ABC123',
        segments: [[{
          origin: 'JFK',
          destination: 'LHR',
          marketingCarrier: 'AA',
          flightNumber: 'AA100',
          departure: '2026-06-15T08:00:00',
          arrival: '2026-06-15T20:00:00',
          cabinClass: 'economy',
          bookingClass: 'Y',
          stops: 0,
        }]],
        passengers: [],
        totalPrice: { amount: '600.00', currency: 'USD' },
      };
    },

    async getBookingStatus(_bookingId: string): Promise<BookingStatusResult> {
      return {
        bookingId: 'BK-001',
        supplier: 'mock',
        status: 'held',
        pnr: 'ABC123',
        segments: [[]],
        passengers: [],
        totalPrice: { amount: '600.00', currency: 'USD' },
      };
    },

    async healthCheck() {
      return { healthy: true, latencyMs: 42 };
    },
  };

  if (withOptional) {
    adapter.requestTicketing = async (_bookingId: string): Promise<BookingStatusResult> => ({
      bookingId: 'BK-001',
      supplier: 'mock',
      status: 'ticketed',
      pnr: 'ABC123',
      ticketNumbers: ['123-4567890'],
      segments: [[]],
      passengers: [],
      totalPrice: { amount: '600.00', currency: 'USD' },
    });

    adapter.cancelBooking = async (_bookingId: string) => ({
      success: true,
      message: 'Booking cancelled',
    });
  }

  return adapter;
}

// ============================================================
// OpenAPI Generator Tests
// ============================================================

describe('generateOpenAPISpec', () => {
  const config = {
    title: 'Acme Travel API',
    description: 'Flight booking API for Acme Travel',
    version: '1.0.0',
    serverUrl: 'https://api.acmetravel.com',
    contactName: 'Acme Support',
    contactEmail: 'support@acmetravel.com',
    logoUrl: 'https://acmetravel.com/logo.png',
    whiteLabel: {
      brandName: 'Acme Travel',
      companyDescription: 'Your trusted travel partner',
      supportEmail: 'help@acmetravel.com',
    },
  };

  it('generates valid OpenAPI 3.1 spec', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), config);

    expect(spec.openapi).toBe('3.1.0');
    expect((spec.info as Record<string, unknown>).title).toBe('Acme Travel API');
    expect((spec.info as Record<string, unknown>).version).toBe('1.0.0');
    expect((spec.servers as Array<Record<string, unknown>>)[0].url).toBe('https://api.acmetravel.com');
  });

  it('includes all seven endpoints', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), config);
    const paths = spec.paths as Record<string, unknown>;

    expect(paths).toHaveProperty('/flights/search');
    expect(paths).toHaveProperty('/flights/price');
    expect(paths).toHaveProperty('/bookings');
    expect(paths).toHaveProperty('/bookings/{id}');
    expect(paths).toHaveProperty('/bookings/{id}/ticket');
    expect(paths).toHaveProperty('/health');
  });

  it('uses correct HTTP methods', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), config);
    const paths = spec.paths as Record<string, Record<string, unknown>>;

    expect(paths['/flights/search']).toHaveProperty('post');
    expect(paths['/flights/price']).toHaveProperty('post');
    expect(paths['/bookings']).toHaveProperty('post');
    expect(paths['/bookings/{id}']).toHaveProperty('get');
    expect(paths['/bookings/{id}']).toHaveProperty('delete');
    expect(paths['/bookings/{id}/ticket']).toHaveProperty('post');
    expect(paths['/health']).toHaveProperty('get');
  });

  it('includes request/response schemas', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), config);
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;

    // POST endpoints have requestBody
    expect(paths['/flights/search'].post).toHaveProperty('requestBody');
    expect(paths['/flights/price'].post).toHaveProperty('requestBody');
    expect(paths['/bookings'].post).toHaveProperty('requestBody');

    // All endpoints have responses
    expect(paths['/flights/search'].post).toHaveProperty('responses');
    expect(paths['/bookings/{id}'].get).toHaveProperty('responses');
    expect(paths['/health'].get).toHaveProperty('responses');
  });

  it('includes component schemas for all types', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), config);
    const schemas = (spec.components as Record<string, Record<string, unknown>>).schemas;

    expect(schemas).toHaveProperty('SearchFlightsInput');
    expect(schemas).toHaveProperty('FlightOffer');
    expect(schemas).toHaveProperty('FlightSegment');
    expect(schemas).toHaveProperty('FareBreakdown');
    expect(schemas).toHaveProperty('MoneyAmount');
    expect(schemas).toHaveProperty('PricedItinerary');
    expect(schemas).toHaveProperty('FareRules');
    expect(schemas).toHaveProperty('CreateBookingInput');
    expect(schemas).toHaveProperty('PassengerDetail');
    expect(schemas).toHaveProperty('ContactInfo');
    expect(schemas).toHaveProperty('BookingResult');
    expect(schemas).toHaveProperty('BookingStatusResult');
    expect(schemas).toHaveProperty('BookingStatus');
    expect(schemas).toHaveProperty('HealthCheckResult');
  });

  it('includes contact info', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), config);
    const info = spec.info as Record<string, Record<string, string>>;

    expect(info.contact.name).toBe('Acme Support');
    expect(info.contact.email).toBe('support@acmetravel.com');
  });

  it('includes logo URL', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), config);
    const info = spec.info as Record<string, Record<string, string>>;

    expect(info['x-logo'].url).toBe('https://acmetravel.com/logo.png');
  });

  it('omits optional endpoints when adapter lacks methods', () => {
    const adapter = createMockAdapter({ withOptional: false });
    const spec = generateOpenAPISpec(adapter, config);
    const paths = spec.paths as Record<string, Record<string, unknown>>;

    expect(paths).not.toHaveProperty('/bookings/{id}/ticket');
    expect(paths['/bookings/{id}']).not.toHaveProperty('delete');

    // Required endpoints still present
    expect(paths).toHaveProperty('/flights/search');
    expect(paths).toHaveProperty('/bookings');
    expect(paths['/bookings/{id}']).toHaveProperty('get');
    expect(paths).toHaveProperty('/health');
  });

  it('contains no Telivity/OTAIP references', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), config);
    const serialized = JSON.stringify(spec);

    expect(serialized).not.toMatch(/telivity/i);
    expect(serialized).not.toMatch(/otaip/i);
  });
});

// ============================================================
// GPT Instructions Tests
// ============================================================

describe('generateGptInstructions', () => {
  const config = {
    assistantName: 'Acme Flight Bot',
    brandName: 'Acme Travel',
    companyDescription: 'Your trusted travel booking partner since 2020.',
    supportEmail: 'help@acmetravel.com',
    customRules: [
      'Always recommend travel insurance.',
      'Prefer direct flights when available.',
    ],
    additionalInstructions: 'Be concise in your responses.',
  };

  it('generates instructions with brand name', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).toContain('Acme Travel');
    expect(output).toContain('Acme Flight Bot');
  });

  it('includes company description', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).toContain('Your trusted travel booking partner since 2020.');
  });

  it('includes all operations', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).toContain('Search Flights');
    expect(output).toContain('Price Itinerary');
    expect(output).toContain('Create Booking');
    expect(output).toContain('Booking Status');
    expect(output).toContain('Request Ticketing');
    expect(output).toContain('Cancel Booking');
    expect(output).toContain('Health Check');
  });

  it('includes booking flow steps', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).toContain('Collect travel details');
    expect(output).toContain('Search for flights');
    expect(output).toContain('Create the booking');
    expect(output).toContain('HOLD');
  });

  it('includes support email', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).toContain('help@acmetravel.com');
  });

  it('includes custom rules', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).toContain('Always recommend travel insurance.');
    expect(output).toContain('Prefer direct flights when available.');
  });

  it('includes additional instructions', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).toContain('Be concise in your responses.');
  });

  it('omits ticketing when adapter lacks the method', () => {
    const adapter = createMockAdapter({ withOptional: false });
    const output = generateGptInstructions(adapter, config);

    expect(output).not.toContain('Request Ticketing');
    // Booking flow should not mention requesting tickets
    expect(output).not.toContain('Request ticketing');
  });

  it('contains no Telivity/OTAIP references', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).not.toMatch(/telivity/i);
    expect(output).not.toMatch(/otaip/i);
  });
});
