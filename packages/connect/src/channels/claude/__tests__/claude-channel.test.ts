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

function createMockAdapter(opts?: { withOptional?: boolean }): ConnectAdapter {
  const withOptional = opts?.withOptional ?? true;

  const adapter: ConnectAdapter = {
    supplierId: 'mock',
    supplierName: 'Mock Supplier',

    searchFlights: vi.fn(async (_input: SearchFlightsInput): Promise<FlightOffer[]> => [{
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
    }]),

    priceItinerary: vi.fn(async (_offerId: string, _passengers: PassengerCount): Promise<PricedItinerary> => ({
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
    })),

    createBooking: vi.fn(async (_input: CreateBookingInput): Promise<BookingResult> => ({
      bookingId: 'BK-001',
      supplier: 'mock',
      status: 'held',
      pnr: 'ABC123',
      segments: [[]],
      passengers: [],
      totalPrice: { amount: '600.00', currency: 'USD' },
    })),

    getBookingStatus: vi.fn(async (_bookingId: string): Promise<BookingStatusResult> => ({
      bookingId: 'BK-001',
      supplier: 'mock',
      status: 'held',
      pnr: 'ABC123',
      segments: [[]],
      passengers: [],
      totalPrice: { amount: '600.00', currency: 'USD' },
    })),

    healthCheck: vi.fn(async () => ({ healthy: true, latencyMs: 42 })),
  };

  if (withOptional) {
    adapter.requestTicketing = vi.fn(async (_bookingId: string): Promise<BookingStatusResult> => ({
      bookingId: 'BK-001',
      supplier: 'mock',
      status: 'ticketed',
      pnr: 'ABC123',
      ticketNumbers: ['123-4567890'],
      segments: [[]],
      passengers: [],
      totalPrice: { amount: '600.00', currency: 'USD' },
    }));

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
    const props = (search.inputSchema.properties as Record<string, unknown>);

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
    const tools = generateMcpTools(createMockAdapter({ withOptional: false }));

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
          passengers: [{
            type: 'adult',
            gender: 'M',
            firstName: 'John',
            lastName: 'Doe',
            dateOfBirth: '1990-01-01',
          }],
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
    const adapter = createMockAdapter({ withOptional: false });
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
});
