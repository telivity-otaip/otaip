/**
 * Creates an MCP server that exposes ConnectAdapter methods as tools.
 * The server is transport-agnostic — the consumer connects it to stdio, SSE, etc.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type {
  ConnectAdapter,
  CreateBookingInput,
  PassengerCount,
  SearchFlightsInput,
  WhiteLabelConfig,
} from '../../types.js';
import { generateMcpTools } from './tool-generator.js';

export interface McpServerConfig {
  serverName: string;
  serverDescription?: string;
  version: string;
  whiteLabel?: WhiteLabelConfig;
}

function arg<T>(args: Record<string, unknown> | undefined, key: string): T {
  return (args ?? {})[key] as T;
}

function argsAs<T>(args: Record<string, unknown> | undefined): T {
  return (args ?? {}) as unknown as T;
}

export function generateMcpServer(adapter: ConnectAdapter, config: McpServerConfig): Server {
  const server = new Server(
    { name: config.serverName, version: config.version },
    { capabilities: { tools: {} } },
  );

  const tools = generateMcpTools(adapter, config.whiteLabel);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'search_flights':
          result = await adapter.searchFlights(argsAs<SearchFlightsInput>(args));
          break;

        case 'price_itinerary':
          result = await adapter.priceItinerary(
            arg<string>(args, 'offerId'),
            arg<PassengerCount>(args, 'passengers'),
          );
          break;

        case 'create_booking':
          result = await adapter.createBooking(argsAs<CreateBookingInput>(args));
          break;

        case 'get_booking':
          result = await adapter.getBookingStatus(arg<string>(args, 'bookingId'));
          break;

        case 'request_ticketing':
          if (!adapter.requestTicketing) {
            return {
              content: [
                { type: 'text' as const, text: 'Ticketing is not supported by this supplier.' },
              ],
              isError: true,
            };
          }
          result = await adapter.requestTicketing(arg<string>(args, 'bookingId'));
          break;

        case 'cancel_booking':
          if (!adapter.cancelBooking) {
            return {
              content: [
                { type: 'text' as const, text: 'Cancellation is not supported by this supplier.' },
              ],
              isError: true,
            };
          }
          result = await adapter.cancelBooking(arg<string>(args, 'bookingId'));
          break;

        case 'health_check':
          result = await adapter.healthCheck();
          break;

        default:
          return {
            content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: message }],
        isError: true,
      };
    }
  });

  return server;
}
