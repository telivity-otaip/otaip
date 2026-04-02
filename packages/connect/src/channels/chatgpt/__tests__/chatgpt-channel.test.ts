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

function createMockAdapter(opts?: {
  withTicketing?: boolean;
  withCancellation?: boolean;
}): ConnectAdapter {
  const withTicketing = opts?.withTicketing ?? true;
  const withCancellation = opts?.withCancellation ?? true;

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

  if (withTicketing) {
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
  }

  if (withCancellation) {
    adapter.cancelBooking = async (_bookingId: string) => ({
      success: true,
      message: 'Booking cancelled',
    });
  }

  return adapter;
}

const fullConfig = {
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

// ============================================================
// OpenAPI Generator Tests
// ============================================================

describe('generateOpenAPISpec', () => {
  it('generates valid OpenAPI 3.1 spec', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);

    expect(spec.openapi).toBe('3.1.0');
    expect((spec.info as Record<string, unknown>).title).toBe('Acme Travel API');
    expect((spec.info as Record<string, unknown>).version).toBe('1.0.0');
    expect((spec.servers as Array<Record<string, unknown>>)[0].url).toBe('https://api.acmetravel.com');
  });

  it('includes all seven endpoints', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const paths = spec.paths as Record<string, unknown>;

    expect(paths).toHaveProperty('/flights/search');
    expect(paths).toHaveProperty('/flights/price');
    expect(paths).toHaveProperty('/bookings');
    expect(paths).toHaveProperty('/bookings/{id}');
    expect(paths).toHaveProperty('/bookings/{id}/ticket');
    expect(paths).toHaveProperty('/health');
  });

  it('uses correct HTTP methods', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
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
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;

    expect(paths['/flights/search'].post).toHaveProperty('requestBody');
    expect(paths['/flights/price'].post).toHaveProperty('requestBody');
    expect(paths['/bookings'].post).toHaveProperty('requestBody');

    expect(paths['/flights/search'].post).toHaveProperty('responses');
    expect(paths['/bookings/{id}'].get).toHaveProperty('responses');
    expect(paths['/health'].get).toHaveProperty('responses');
  });

  it('includes component schemas for all types', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
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
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const info = spec.info as Record<string, Record<string, string>>;

    expect(info.contact.name).toBe('Acme Support');
    expect(info.contact.email).toBe('support@acmetravel.com');
  });

  it('includes logo URL', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const info = spec.info as Record<string, Record<string, string>>;

    expect(info['x-logo'].url).toBe('https://acmetravel.com/logo.png');
  });

  it('omits optional endpoints when adapter lacks methods', () => {
    const adapter = createMockAdapter({ withTicketing: false, withCancellation: false });
    const spec = generateOpenAPISpec(adapter, fullConfig);
    const paths = spec.paths as Record<string, Record<string, unknown>>;

    expect(paths).not.toHaveProperty('/bookings/{id}/ticket');
    expect(paths['/bookings/{id}']).not.toHaveProperty('delete');

    expect(paths).toHaveProperty('/flights/search');
    expect(paths).toHaveProperty('/bookings');
    expect(paths['/bookings/{id}']).toHaveProperty('get');
    expect(paths).toHaveProperty('/health');
  });

  it('contains no Telivity/OTAIP references', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const serialized = JSON.stringify(spec);

    expect(serialized).not.toMatch(/telivity/i);
    expect(serialized).not.toMatch(/otaip/i);
  });

  // --- NEW TESTS ---

  it('assigns correct operationIds to all endpoints', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;

    expect(paths['/flights/search'].post.operationId).toBe('searchFlights');
    expect(paths['/flights/price'].post.operationId).toBe('priceItinerary');
    expect(paths['/bookings'].post.operationId).toBe('createBooking');
    expect(paths['/bookings/{id}'].get.operationId).toBe('getBookingStatus');
    expect(paths['/bookings/{id}']['delete'].operationId).toBe('cancelBooking');
    expect(paths['/bookings/{id}/ticket'].post.operationId).toBe('requestTicketing');
    expect(paths['/health'].get.operationId).toBe('healthCheck');
  });

  it('uses $ref for request body schemas', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;

    const searchBody = paths['/flights/search'].post.requestBody as Record<string, unknown>;
    const content = searchBody.content as Record<string, Record<string, Record<string, string>>>;
    expect(content['application/json'].schema.$ref).toBe('#/components/schemas/SearchFlightsInput');

    const priceBody = paths['/flights/price'].post.requestBody as Record<string, unknown>;
    const priceContent = priceBody.content as Record<string, Record<string, Record<string, string>>>;
    expect(priceContent['application/json'].schema.$ref).toBe('#/components/schemas/PriceItineraryInput');

    const bookBody = paths['/bookings'].post.requestBody as Record<string, unknown>;
    const bookContent = bookBody.content as Record<string, Record<string, Record<string, string>>>;
    expect(bookContent['application/json'].schema.$ref).toBe('#/components/schemas/CreateBookingInput');
  });

  it('uses $ref for response schemas', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;

    // search returns array of FlightOffer
    const searchResp = paths['/flights/search'].post.responses as Record<string, Record<string, unknown>>;
    const searchContent = searchResp['200'].content as Record<string, Record<string, Record<string, unknown>>>;
    expect(searchContent['application/json'].schema.items).toEqual({ $ref: '#/components/schemas/FlightOffer' });

    // health returns HealthCheckResult
    const healthResp = paths['/health'].get.responses as Record<string, Record<string, unknown>>;
    const healthContent = healthResp['200'].content as Record<string, Record<string, Record<string, string>>>;
    expect(healthContent['application/json'].schema.$ref).toBe('#/components/schemas/HealthCheckResult');
  });

  it('includes path parameters on /bookings/{id} endpoints', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;

    // GET /bookings/{id}
    const getParams = paths['/bookings/{id}'].get.parameters as Array<Record<string, unknown>>;
    expect(getParams).toHaveLength(1);
    expect(getParams[0].name).toBe('id');
    expect(getParams[0].in).toBe('path');
    expect(getParams[0].required).toBe(true);

    // DELETE /bookings/{id}
    const deleteParams = paths['/bookings/{id}']['delete'].parameters as Array<Record<string, unknown>>;
    expect(deleteParams).toHaveLength(1);
    expect(deleteParams[0].name).toBe('id');

    // POST /bookings/{id}/ticket
    const ticketParams = paths['/bookings/{id}/ticket'].post.parameters as Array<Record<string, unknown>>;
    expect(ticketParams).toHaveLength(1);
    expect(ticketParams[0].name).toBe('id');
  });

  it('SearchFlightsInput schema has correct required fields', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const schemas = (spec.components as Record<string, Record<string, Record<string, unknown>>>).schemas;
    const search = schemas.SearchFlightsInput;

    expect(search.required).toEqual(['origin', 'destination', 'departureDate', 'passengers']);
  });

  it('PassengerDetail schema has correct enum values', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const schemas = (spec.components as Record<string, Record<string, Record<string, unknown>>>).schemas;
    const pax = schemas.PassengerDetail;
    const props = pax.properties as Record<string, Record<string, unknown>>;

    expect(props.type.enum).toEqual(['adult', 'child', 'infant']);
    expect(props.gender.enum).toEqual(['M', 'F']);
  });

  it('BookingStatus schema lists all status values', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const schemas = (spec.components as Record<string, Record<string, Record<string, unknown>>>).schemas;
    const status = schemas.BookingStatus;

    expect(status.type).toBe('string');
    expect(status.enum).toEqual(['held', 'payment_pending', 'confirmed', 'ticketed', 'cancelled', 'failed']);
  });

  it('CabinClass enum appears in FlightOffer and SearchFlightsInput schemas', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const schemas = (spec.components as Record<string, Record<string, Record<string, unknown>>>).schemas;

    const searchProps = schemas.SearchFlightsInput.properties as Record<string, Record<string, unknown>>;
    expect(searchProps.cabinClass.enum).toEqual(['economy', 'premium_economy', 'business', 'first']);

    const offerProps = schemas.FlightOffer.properties as Record<string, Record<string, unknown>>;
    expect(offerProps.cabinClass.enum).toEqual(['economy', 'premium_economy', 'business', 'first']);
  });

  it('MoneyAmount schema requires amount and currency', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const schemas = (spec.components as Record<string, Record<string, Record<string, unknown>>>).schemas;

    expect(schemas.MoneyAmount.required).toEqual(['amount', 'currency']);
    const props = schemas.MoneyAmount.properties as Record<string, Record<string, unknown>>;
    expect(props.amount.type).toBe('string');
    expect(props.currency.type).toBe('string');
  });

  it('uses brand name in default description when no description provided', () => {
    const minConfig = {
      title: 'Sky Wings API',
      version: '2.0.0',
      serverUrl: 'https://api.skywings.com',
      whiteLabel: { brandName: 'Sky Wings' },
    };
    const spec = generateOpenAPISpec(createMockAdapter(), minConfig);
    const info = spec.info as Record<string, string>;

    expect(info.description).toContain('Sky Wings');
  });

  it('uses title as fallback when no whiteLabel provided', () => {
    const minConfig = {
      title: 'My Travel API',
      version: '1.0.0',
      serverUrl: 'https://api.example.com',
    };
    const spec = generateOpenAPISpec(createMockAdapter(), minConfig);
    const info = spec.info as Record<string, string>;

    expect(info.description).toContain('My Travel API');
  });

  it('omits contact when neither contactName nor contactEmail provided', () => {
    const minConfig = {
      title: 'No Contact API',
      version: '1.0.0',
      serverUrl: 'https://api.example.com',
    };
    const spec = generateOpenAPISpec(createMockAdapter(), minConfig);
    const info = spec.info as Record<string, unknown>;

    expect(info).not.toHaveProperty('contact');
  });

  it('omits x-logo when no logoUrl provided', () => {
    const minConfig = {
      title: 'No Logo API',
      version: '1.0.0',
      serverUrl: 'https://api.example.com',
    };
    const spec = generateOpenAPISpec(createMockAdapter(), minConfig);
    const info = spec.info as Record<string, unknown>;

    expect(info).not.toHaveProperty('x-logo');
  });

  it('includes ticketing endpoint but not cancellation when only ticketing present', () => {
    const adapter = createMockAdapter({ withTicketing: true, withCancellation: false });
    const spec = generateOpenAPISpec(adapter, fullConfig);
    const paths = spec.paths as Record<string, Record<string, unknown>>;

    expect(paths).toHaveProperty('/bookings/{id}/ticket');
    expect(paths['/bookings/{id}']).not.toHaveProperty('delete');
  });

  it('includes cancellation but not ticketing when only cancellation present', () => {
    const adapter = createMockAdapter({ withTicketing: false, withCancellation: true });
    const spec = generateOpenAPISpec(adapter, fullConfig);
    const paths = spec.paths as Record<string, Record<string, unknown>>;

    expect(paths).not.toHaveProperty('/bookings/{id}/ticket');
    expect(paths['/bookings/{id}']).toHaveProperty('delete');
  });

  it('FlightSegment schema has correct required fields', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const schemas = (spec.components as Record<string, Record<string, Record<string, unknown>>>).schemas;

    expect(schemas.FlightSegment.required).toEqual(
      expect.arrayContaining(['origin', 'destination', 'marketingCarrier', 'flightNumber', 'departure', 'arrival', 'stops']),
    );
  });

  it('CreateBookingInput schema references PassengerDetail and ContactInfo', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const schemas = (spec.components as Record<string, Record<string, Record<string, unknown>>>).schemas;
    const props = schemas.CreateBookingInput.properties as Record<string, Record<string, unknown>>;

    // passengers is array of $ref
    expect(props.passengers.type).toBe('array');
    expect(props.passengers.items).toEqual({ $ref: '#/components/schemas/PassengerDetail' });

    // contact is $ref
    expect(props.contact).toEqual({ $ref: '#/components/schemas/ContactInfo' });
  });

  it('BookingResult schema references BookingStatus via $ref', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const schemas = (spec.components as Record<string, Record<string, Record<string, unknown>>>).schemas;
    const props = schemas.BookingResult.properties as Record<string, Record<string, unknown>>;

    expect(props.status).toEqual({ $ref: '#/components/schemas/BookingStatus' });
  });

  it('all schemas are objects with properties', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const schemas = (spec.components as Record<string, Record<string, Record<string, unknown>>>).schemas;

    for (const [name, schema] of Object.entries(schemas)) {
      if (name === 'BookingStatus') {
        expect(schema.type).toBe('string');
      } else {
        expect(schema.type).toBe('object');
        expect(schema.properties).toBeDefined();
      }
    }
  });

  it('spec is JSON-serializable', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);

    expect(() => JSON.stringify(spec)).not.toThrow();
    const roundTrip = JSON.parse(JSON.stringify(spec)) as Record<string, unknown>;
    expect(roundTrip.openapi).toBe('3.1.0');
  });

  it('contains no "Connect" brand references in generated output', () => {
    const spec = generateOpenAPISpec(createMockAdapter(), fullConfig);
    const serialized = JSON.stringify(spec);

    // "Connect" as a standalone brand should not appear
    // (connecting/connection in descriptions would be fine but we check the specific brand pattern)
    expect(serialized).not.toMatch(/OTAIP Connect/i);
    expect(serialized).not.toMatch(/Telivity Connect/i);
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
    const adapter = createMockAdapter({ withTicketing: false, withCancellation: true });
    const output = generateGptInstructions(adapter, config);

    expect(output).not.toContain('Request Ticketing');
    expect(output).not.toContain('Request ticketing');
  });

  it('contains no Telivity/OTAIP references', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).not.toMatch(/telivity/i);
    expect(output).not.toMatch(/otaip/i);
  });

  // --- NEW TESTS ---

  it('works with minimal config (no optional fields)', () => {
    const minConfig = {
      assistantName: 'Bot',
      brandName: 'TestBrand',
    };
    const adapter = createMockAdapter({ withTicketing: false, withCancellation: false });
    const output = generateGptInstructions(adapter, minConfig);

    expect(output).toContain('Bot');
    expect(output).toContain('TestBrand');
    expect(output).not.toContain('Support');
    expect(output).not.toContain('Additional Rules');
    expect(output).not.toContain('Additional Instructions');
  });

  it('omits support section when no supportEmail provided', () => {
    const noSupportConfig = {
      assistantName: 'Bot',
      brandName: 'TestBrand',
    };
    const output = generateGptInstructions(createMockAdapter(), noSupportConfig);

    expect(output).not.toContain('## Support');
  });

  it('omits company description when not provided', () => {
    const noDescConfig = {
      assistantName: 'Bot',
      brandName: 'TestBrand',
    };
    const output = generateGptInstructions(createMockAdapter(), noDescConfig);

    // The second line after identity should be blank (no description)
    const lines = output.split('\n');
    expect(lines[0]).toContain('Bot');
    expect(lines[0]).toContain('TestBrand');
    expect(lines[1]).toBe('');
  });

  it('omits cancellation when adapter lacks the method', () => {
    const adapter = createMockAdapter({ withTicketing: true, withCancellation: false });
    const output = generateGptInstructions(adapter, config);

    expect(output).not.toContain('Cancel Booking');
    expect(output).toContain('Request Ticketing');
  });

  it('handles cancellation-only adapter (no ticketing)', () => {
    const adapter = createMockAdapter({ withTicketing: false, withCancellation: true });
    const output = generateGptInstructions(adapter, config);

    expect(output).toContain('Cancel Booking');
    expect(output).not.toContain('Request Ticketing');
  });

  it('handles adapter with no optional methods', () => {
    const adapter = createMockAdapter({ withTicketing: false, withCancellation: false });
    const output = generateGptInstructions(adapter, config);

    expect(output).not.toContain('Request Ticketing');
    expect(output).not.toContain('Cancel Booking');
    // Health check should be numbered 5
    expect(output).toContain('5. **Health Check**');
  });

  it('numbers operations correctly with both optional methods', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).toContain('5. **Request Ticketing**');
    expect(output).toContain('6. **Cancel Booking**');
    expect(output).toContain('7. **Health Check**');
  });

  it('numbers operations correctly with only ticketing', () => {
    const adapter = createMockAdapter({ withTicketing: true, withCancellation: false });
    const output = generateGptInstructions(adapter, config);

    expect(output).toContain('5. **Request Ticketing**');
    expect(output).toContain('6. **Health Check**');
  });

  it('numbers operations correctly with only cancellation', () => {
    const adapter = createMockAdapter({ withTicketing: false, withCancellation: true });
    const output = generateGptInstructions(adapter, config);

    expect(output).toContain('5. **Cancel Booking**');
    expect(output).toContain('6. **Health Check**');
  });

  it('includes markdown section headers', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).toContain('## Capabilities');
    expect(output).toContain('## Booking Flow');
    expect(output).toContain('## Formatting Rules');
    expect(output).toContain('## Payment Model');
  });

  it('references correct endpoint paths in capabilities', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).toContain('POST /flights/search');
    expect(output).toContain('POST /flights/price');
    expect(output).toContain('POST /bookings)');
    expect(output).toContain('GET /bookings/{id}');
    expect(output).toContain('POST /bookings/{id}/ticket');
    expect(output).toContain('DELETE /bookings/{id}');
    expect(output).toContain('GET /health');
  });

  it('explains HOLD payment model', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).toContain('HOLD');
    expect(output).toContain('payment is not charged');
    expect(output).toContain('payment deadline');
  });

  it('mentions presenting flight options with key details', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).toContain('departure/arrival times');
    expect(output).toContain('duration');
    expect(output).toContain('stops');
    expect(output).toContain('total price');
  });

  it('includes ticketing step in booking flow when available', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).toContain('7. **Request ticketing**');
    expect(output).toContain('ticket numbers');
  });

  it('excludes ticketing step from booking flow when not available', () => {
    const adapter = createMockAdapter({ withTicketing: false, withCancellation: true });
    const output = generateGptInstructions(adapter, config);

    // Should not have step 7 about ticketing
    expect(output).not.toContain('Request ticketing');
  });

  it('output is a non-empty string', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(100);
  });

  it('contains no OTAIP Connect brand references', () => {
    const output = generateGptInstructions(createMockAdapter(), config);

    expect(output).not.toMatch(/OTAIP Connect/i);
    expect(output).not.toMatch(/Telivity Connect/i);
  });

  it('uses different brand names correctly', () => {
    const altConfig = {
      assistantName: 'FlyBot',
      brandName: 'Globetrotter Inc',
      companyDescription: 'World-class travel services.',
    };
    const output = generateGptInstructions(createMockAdapter(), altConfig);

    expect(output).toContain('FlyBot');
    expect(output).toContain('Globetrotter Inc');
    expect(output).toContain('World-class travel services.');
    expect(output).not.toContain('Acme');
  });
});
