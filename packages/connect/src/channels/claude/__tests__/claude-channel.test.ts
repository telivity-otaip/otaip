import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { generateMcpTools } from '../tool-generator.js';
import { generateMcpServer } from '../mcp-server.js';
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

    searchFlights: vi.fn(
      async (_input: SearchFlightsInput): Promise<FlightOffer[]> => [
        {
          offerId: 'offer-1',
          supplier: 'mock',
          validatingCarrier: 'AA',
          segments: [
            [
              {
                origin: 'JFK',
                destination: 'LHR',
                marketingCarrier: 'AA',
                flightNumber: 'AA100',
                departure: '2026-06-15T08:00:00',
                arrival: '2026-06-15T20:00:00',
                cabinClass: 'economy',
                bookingClass: 'Y',
                stops: 0,
              },
            ],
          ],
          fares: [
            {
              passengerType: 'adult',
              baseFare: { amount: '500.00', currency: 'USD' },
              taxes: { amount: '100.00', currency: 'USD' },
              total: { amount: '600.00', currency: 'USD' },
              count: 1,
            },
          ],
          totalPrice: { amount: '600.00', currency: 'USD' },
          fareType: 'published',
          cabinClass: 'economy',
          refundable: false,
          changeable: true,
        },
      ],
    ),

    priceItinerary: vi.fn(
      async (_offerId: string, _passengers: PassengerCount): Promise<PricedItinerary> => ({
        offerId: 'offer-1',
        supplier: 'mock',
        totalPrice: { amount: '600.00', currency: 'USD' },
        fares: [
          {
            passengerType: 'adult',
            baseFare: { amount: '500.00', currency: 'USD' },
            taxes: { amount: '100.00', currency: 'USD' },
            total: { amount: '600.00', currency: 'USD' },
            count: 1,
          },
        ],
        fareRules: { refundable: false, changeable: true },
        priceChanged: false,
        available: true,
      }),
    ),

    createBooking: vi.fn(
      async (_input: CreateBookingInput): Promise<BookingResult> => ({
        bookingId: 'BK-001',
        supplier: 'mock',
        status: 'held',
        pnr: 'ABC123',
        segments: [[]],
        passengers: [],
        totalPrice: { amount: '600.00', currency: 'USD' },
      }),
    ),

    getBookingStatus: vi.fn(
      async (_bookingId: string): Promise<BookingStatusResult> => ({
        bookingId: 'BK-001',
        supplier: 'mock',
        status: 'held',
        pnr: 'ABC123',
        segments: [[]],
        passengers: [],
        totalPrice: { amount: '600.00', currency: 'USD' },
      }),
    ),

    healthCheck: vi.fn(async () => ({ healthy: true, latencyMs: 42 })),
  };

  if (withTicketing) {
    adapter.requestTicketing = vi.fn(
      async (_bookingId: string): Promise<BookingStatusResult> => ({
        bookingId: 'BK-001',
        supplier: 'mock',
        status: 'ticketed',
        pnr: 'ABC123',
        ticketNumbers: ['123-4567890'],
        segments: [[]],
        passengers: [],
        totalPrice: { amount: '600.00', currency: 'USD' },
      }),
    );
  }

  if (withCancellation) {
    adapter.cancelBooking = vi.fn(async (_bookingId: string) => ({
      success: true,
      message: 'Booking cancelled',
    }));
  }

  return adapter;
}

// ============================================================
// Tool Generator Tests
// ============================================================

describe('generateMcpTools', () => {
  it('generates all seven tools when adapter has optional methods', () => {
    const tools = generateMcpTools(createMockAdapter());

    expect(tools).toHaveLength(7);
    const names = tools.map((t) => t.name);
    expect(names).toContain('search_flights');
    expect(names).toContain('price_itinerary');
    expect(names).toContain('create_booking');
    expect(names).toContain('get_booking');
    expect(names).toContain('request_ticketing');
    expect(names).toContain('cancel_booking');
    expect(names).toContain('health_check');
  });

  it('each tool has name, description, and inputSchema', () => {
    const tools = generateMcpTools(createMockAdapter());

    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('search_flights has correct input schema', () => {
    const tools = generateMcpTools(createMockAdapter());
    const search = tools.find((t) => t.name === 'search_flights')!;
    const props = search.inputSchema.properties as Record<string, unknown>;

    expect(props).toHaveProperty('origin');
    expect(props).toHaveProperty('destination');
    expect(props).toHaveProperty('departureDate');
    expect(props).toHaveProperty('passengers');
    expect(search.inputSchema.required).toContain('origin');
    expect(search.inputSchema.required).toContain('destination');
    expect(search.inputSchema.required).toContain('departureDate');
    expect(search.inputSchema.required).toContain('passengers');
  });

  it('create_booking has nested passenger schema', () => {
    const tools = generateMcpTools(createMockAdapter());
    const booking = tools.find((t) => t.name === 'create_booking')!;
    const props = booking.inputSchema.properties as Record<string, Record<string, unknown>>;

    expect(props.passengers.type).toBe('array');
    expect(props.passengers.items).toBeDefined();
  });

  it('omits optional tools when adapter lacks methods', () => {
    const tools = generateMcpTools(
      createMockAdapter({ withTicketing: false, withCancellation: false }),
    );

    expect(tools).toHaveLength(5);
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('request_ticketing');
    expect(names).not.toContain('cancel_booking');
  });

  it('uses white-label brand in descriptions', () => {
    const tools = generateMcpTools(createMockAdapter(), {
      brandName: 'Acme Travel',
    });

    for (const tool of tools) {
      expect(tool.description).toContain('Acme Travel');
    }
  });

  it('contains no Telivity/OTAIP references', () => {
    const tools = generateMcpTools(createMockAdapter(), {
      brandName: 'Acme Travel',
    });
    const serialized = JSON.stringify(tools);

    expect(serialized).not.toMatch(/telivity/i);
    expect(serialized).not.toMatch(/otaip/i);
  });

  // --- NEW TESTS ---

  it('price_itinerary schema requires offerId and passengers', () => {
    const tools = generateMcpTools(createMockAdapter());
    const price = tools.find((t) => t.name === 'price_itinerary')!;

    expect(price.inputSchema.required).toContain('offerId');
    expect(price.inputSchema.required).toContain('passengers');
    const props = price.inputSchema.properties as Record<string, Record<string, unknown>>;
    expect(props.offerId.type).toBe('string');
  });

  it('get_booking schema requires bookingId', () => {
    const tools = generateMcpTools(createMockAdapter());
    const get = tools.find((t) => t.name === 'get_booking')!;

    expect(get.inputSchema.required).toContain('bookingId');
    const props = get.inputSchema.properties as Record<string, Record<string, unknown>>;
    expect(props.bookingId.type).toBe('string');
  });

  it('request_ticketing schema requires bookingId', () => {
    const tools = generateMcpTools(createMockAdapter());
    const ticket = tools.find((t) => t.name === 'request_ticketing')!;

    expect(ticket.inputSchema.required).toContain('bookingId');
  });

  it('cancel_booking schema requires bookingId', () => {
    const tools = generateMcpTools(createMockAdapter());
    const cancel = tools.find((t) => t.name === 'cancel_booking')!;

    expect(cancel.inputSchema.required).toContain('bookingId');
  });

  it('health_check schema has empty properties', () => {
    const tools = generateMcpTools(createMockAdapter());
    const health = tools.find((t) => t.name === 'health_check')!;
    const props = health.inputSchema.properties as Record<string, unknown>;

    expect(Object.keys(props)).toHaveLength(0);
  });

  it('generates generic descriptions without whiteLabel', () => {
    const tools = generateMcpTools(createMockAdapter());

    for (const tool of tools) {
      expect(tool.description).not.toContain(':');
    }
  });

  it('includes only ticketing when only ticketing present', () => {
    const tools = generateMcpTools(
      createMockAdapter({ withTicketing: true, withCancellation: false }),
    );

    expect(tools).toHaveLength(6);
    const names = tools.map((t) => t.name);
    expect(names).toContain('request_ticketing');
    expect(names).not.toContain('cancel_booking');
  });

  it('includes only cancellation when only cancellation present', () => {
    const tools = generateMcpTools(
      createMockAdapter({ withTicketing: false, withCancellation: true }),
    );

    expect(tools).toHaveLength(6);
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('request_ticketing');
    expect(names).toContain('cancel_booking');
  });

  it('search_flights schema includes optional fields', () => {
    const tools = generateMcpTools(createMockAdapter());
    const search = tools.find((t) => t.name === 'search_flights')!;
    const props = search.inputSchema.properties as Record<string, unknown>;

    expect(props).toHaveProperty('returnDate');
    expect(props).toHaveProperty('cabinClass');
    expect(props).toHaveProperty('directOnly');
    expect(props).toHaveProperty('preferredAirlines');
    expect(props).toHaveProperty('currency');
  });

  it('search_flights cabinClass has correct enum', () => {
    const tools = generateMcpTools(createMockAdapter());
    const search = tools.find((t) => t.name === 'search_flights')!;
    const props = search.inputSchema.properties as Record<string, Record<string, unknown>>;

    expect(props.cabinClass.enum).toEqual(['economy', 'premium_economy', 'business', 'first']);
  });

  it('create_booking passenger items schema has required fields', () => {
    const tools = generateMcpTools(createMockAdapter());
    const booking = tools.find((t) => t.name === 'create_booking')!;
    const props = booking.inputSchema.properties as Record<string, Record<string, unknown>>;
    const paxSchema = props.passengers.items as Record<string, unknown>;

    expect(paxSchema.required).toContain('type');
    expect(paxSchema.required).toContain('gender');
    expect(paxSchema.required).toContain('firstName');
    expect(paxSchema.required).toContain('lastName');
    expect(paxSchema.required).toContain('dateOfBirth');
  });

  it('create_booking contact schema has required fields', () => {
    const tools = generateMcpTools(createMockAdapter());
    const booking = tools.find((t) => t.name === 'create_booking')!;
    const props = booking.inputSchema.properties as Record<string, Record<string, unknown>>;

    expect(props.contact.required).toContain('email');
    expect(props.contact.required).toContain('phone');
  });

  it('create_booking schema requires offerId, passengers, and contact', () => {
    const tools = generateMcpTools(createMockAdapter());
    const booking = tools.find((t) => t.name === 'create_booking')!;

    expect(booking.inputSchema.required).toEqual(['offerId', 'passengers', 'contact']);
  });

  it('tool names use snake_case', () => {
    const tools = generateMcpTools(createMockAdapter());

    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z_]+$/);
    }
  });

  it('maintains consistent tool ordering', () => {
    const tools = generateMcpTools(createMockAdapter());
    const names = tools.map((t) => t.name);

    expect(names).toEqual([
      'search_flights',
      'price_itinerary',
      'create_booking',
      'get_booking',
      'request_ticketing',
      'cancel_booking',
      'health_check',
    ]);
  });

  it('passengers nested schema has adults as required', () => {
    const tools = generateMcpTools(createMockAdapter());
    const search = tools.find((t) => t.name === 'search_flights')!;
    const props = search.inputSchema.properties as Record<string, Record<string, unknown>>;

    expect(props.passengers.required).toContain('adults');
  });
});

// ============================================================
// MCP Server Tests
// ============================================================

describe('generateMcpServer', () => {
  const serverConfig = {
    serverName: 'acme-flights',
    serverDescription: 'Acme Travel flight booking server',
    version: '1.0.0',
    whiteLabel: {
      brandName: 'Acme Travel',
    },
  };

  async function createClientServerPair(adapter: ConnectAdapter) {
    const server = generateMcpServer(adapter, serverConfig);
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    return { server, client };
  }

  it('returns a Server instance', async () => {
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    const server = generateMcpServer(createMockAdapter(), serverConfig);

    expect(server).toBeInstanceOf(Server);
  });

  it('tools/list returns all tools', async () => {
    const { client, server } = await createClientServerPair(createMockAdapter());

    try {
      const result = await client.listTools();

      expect(result.tools).toHaveLength(7);
      const names = result.tools.map((t) => t.name);
      expect(names).toContain('search_flights');
      expect(names).toContain('health_check');
      expect(names).toContain('create_booking');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('handles health_check tool call', async () => {
    const adapter = createMockAdapter();
    const { client, server } = await createClientServerPair(adapter);

    try {
      const result = await client.callTool({ name: 'health_check', arguments: {} });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.healthy).toBe(true);
      expect(parsed.latencyMs).toBe(42);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('handles search_flights tool call', async () => {
    const adapter = createMockAdapter();
    const { client, server } = await createClientServerPair(adapter);

    try {
      const result = await client.callTool({
        name: 'search_flights',
        arguments: {
          origin: 'JFK',
          destination: 'LHR',
          departureDate: '2026-06-15',
          passengers: { adults: 1 },
        },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].offerId).toBe('offer-1');
      expect(adapter.searchFlights).toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('handles create_booking tool call', async () => {
    const adapter = createMockAdapter();
    const { client, server } = await createClientServerPair(adapter);

    try {
      const result = await client.callTool({
        name: 'create_booking',
        arguments: {
          offerId: 'offer-1',
          passengers: [
            {
              type: 'adult',
              gender: 'M',
              firstName: 'John',
              lastName: 'Doe',
              dateOfBirth: '1990-01-01',
            },
          ],
          contact: { email: 'john@test.com', phone: '1234567890' },
        },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.bookingId).toBe('BK-001');
      expect(parsed.status).toBe('held');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('returns error for unknown tool', async () => {
    const { client, server } = await createClientServerPair(createMockAdapter());

    try {
      const result = await client.callTool({ name: 'nonexistent', arguments: {} });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain('Unknown tool');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('returns error when calling unsupported optional tool', async () => {
    const adapter = createMockAdapter({ withTicketing: false, withCancellation: false });
    const { client, server } = await createClientServerPair(adapter);

    try {
      const result = await client.callTool({
        name: 'request_ticketing',
        arguments: { bookingId: 'BK-001' },
      });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain('not supported');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('contains no Telivity/OTAIP references in tool definitions', async () => {
    const { client, server } = await createClientServerPair(createMockAdapter());

    try {
      const result = await client.listTools();
      const serialized = JSON.stringify(result.tools);

      expect(serialized).not.toMatch(/telivity/i);
      expect(serialized).not.toMatch(/otaip/i);
    } finally {
      await client.close();
      await server.close();
    }
  });

  // --- NEW TESTS ---

  it('handles price_itinerary tool call with correct arguments', async () => {
    const adapter = createMockAdapter();
    const { client, server } = await createClientServerPair(adapter);

    try {
      const result = await client.callTool({
        name: 'price_itinerary',
        arguments: {
          offerId: 'offer-1',
          passengers: { adults: 2, children: 1 },
        },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.offerId).toBe('offer-1');
      expect(parsed.available).toBe(true);
      expect(adapter.priceItinerary).toHaveBeenCalledWith('offer-1', { adults: 2, children: 1 });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('handles get_booking tool call', async () => {
    const adapter = createMockAdapter();
    const { client, server } = await createClientServerPair(adapter);

    try {
      const result = await client.callTool({
        name: 'get_booking',
        arguments: { bookingId: 'BK-001' },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.bookingId).toBe('BK-001');
      expect(parsed.status).toBe('held');
      expect(adapter.getBookingStatus).toHaveBeenCalledWith('BK-001');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('handles request_ticketing tool call', async () => {
    const adapter = createMockAdapter();
    const { client, server } = await createClientServerPair(adapter);

    try {
      const result = await client.callTool({
        name: 'request_ticketing',
        arguments: { bookingId: 'BK-001' },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.status).toBe('ticketed');
      expect(parsed.ticketNumbers).toEqual(['123-4567890']);
      expect(adapter.requestTicketing).toHaveBeenCalledWith('BK-001');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('handles cancel_booking tool call', async () => {
    const adapter = createMockAdapter();
    const { client, server } = await createClientServerPair(adapter);

    try {
      const result = await client.callTool({
        name: 'cancel_booking',
        arguments: { bookingId: 'BK-001' },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toBe('Booking cancelled');
      expect(adapter.cancelBooking).toHaveBeenCalledWith('BK-001');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('returns error when cancel_booking not supported', async () => {
    const adapter = createMockAdapter({ withTicketing: true, withCancellation: false });
    const { client, server } = await createClientServerPair(adapter);

    try {
      const result = await client.callTool({
        name: 'cancel_booking',
        arguments: { bookingId: 'BK-001' },
      });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain('not supported');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('propagates adapter errors gracefully', async () => {
    const adapter = createMockAdapter();
    (adapter.searchFlights as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('GDS connection timeout'),
    );
    const { client, server } = await createClientServerPair(adapter);

    try {
      const result = await client.callTool({
        name: 'search_flights',
        arguments: {
          origin: 'JFK',
          destination: 'LHR',
          departureDate: '2026-06-15',
          passengers: { adults: 1 },
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain('GDS connection timeout');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('propagates non-Error throws gracefully', async () => {
    const adapter = createMockAdapter();
    (adapter.healthCheck as ReturnType<typeof vi.fn>).mockRejectedValueOnce('string error');
    const { client, server } = await createClientServerPair(adapter);

    try {
      const result = await client.callTool({ name: 'health_check', arguments: {} });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toBe('string error');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('forwards search arguments to adapter correctly', async () => {
    const adapter = createMockAdapter();
    const { client, server } = await createClientServerPair(adapter);

    try {
      await client.callTool({
        name: 'search_flights',
        arguments: {
          origin: 'LAX',
          destination: 'NRT',
          departureDate: '2026-09-01',
          returnDate: '2026-09-15',
          passengers: { adults: 2, children: 1, childAges: [5] },
          cabinClass: 'business',
          directOnly: true,
          currency: 'EUR',
        },
      });

      expect(adapter.searchFlights).toHaveBeenCalledWith({
        origin: 'LAX',
        destination: 'NRT',
        departureDate: '2026-09-01',
        returnDate: '2026-09-15',
        passengers: { adults: 2, children: 1, childAges: [5] },
        cabinClass: 'business',
        directOnly: true,
        currency: 'EUR',
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('forwards create_booking arguments to adapter correctly', async () => {
    const adapter = createMockAdapter();
    const { client, server } = await createClientServerPair(adapter);

    const bookingArgs = {
      offerId: 'offer-99',
      passengers: [
        {
          type: 'adult',
          gender: 'F',
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: '1985-03-15',
        },
        {
          type: 'child',
          gender: 'M',
          firstName: 'Tom',
          lastName: 'Smith',
          dateOfBirth: '2018-07-20',
        },
      ],
      contact: { email: 'jane@example.com', phone: '+1234567890' },
    };

    try {
      await client.callTool({ name: 'create_booking', arguments: bookingArgs });

      expect(adapter.createBooking).toHaveBeenCalledWith(bookingArgs);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('tools/list returns fewer tools when adapter lacks optional methods', async () => {
    const adapter = createMockAdapter({ withTicketing: false, withCancellation: false });
    const { client, server } = await createClientServerPair(adapter);

    try {
      const result = await client.listTools();

      expect(result.tools).toHaveLength(5);
      const names = result.tools.map((t) => t.name);
      expect(names).not.toContain('request_ticketing');
      expect(names).not.toContain('cancel_booking');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('tool results are valid JSON in text content', async () => {
    const adapter = createMockAdapter();
    const { client, server } = await createClientServerPair(adapter);

    try {
      const tools = ['health_check', 'search_flights', 'get_booking'];
      const argSets: Record<string, Record<string, unknown>> = {
        health_check: {},
        search_flights: {
          origin: 'JFK',
          destination: 'LHR',
          departureDate: '2026-06-15',
          passengers: { adults: 1 },
        },
        get_booking: { bookingId: 'BK-001' },
      };

      for (const toolName of tools) {
        const result = await client.callTool({ name: toolName, arguments: argSets[toolName] });
        const content = result.content as Array<{ type: string; text: string }>;

        expect(content).toHaveLength(1);
        expect(content[0].type).toBe('text');
        expect(() => JSON.parse(content[0].text)).not.toThrow();
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('works with a different server config (different brand)', async () => {
    const altConfig = {
      serverName: 'skybird-api',
      version: '2.5.0',
      whiteLabel: { brandName: 'SkyBird' },
    };

    const adapter = createMockAdapter();
    const server = generateMcpServer(adapter, altConfig);
    const client = new Client({ name: 'test', version: '1.0.0' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);

    try {
      const result = await client.listTools();

      // Verify brand appears in descriptions
      for (const tool of result.tools) {
        expect(tool.description).toContain('SkyBird');
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
