/**
 * OTAIP LLM Booking Demo
 *
 * Claude acts as an intelligent booking agent - not a search wrapper.
 * It receives traveler context, evaluates all available options,
 * selects the best fit based on that context, books it, and explains
 * its decision. The traveler does not choose. The agent chooses.
 *
 * Flow: Claude (tool_use) -> OTAIP DuffelAdapter -> Duffel sandbox API
 *
 * Requires .env at repo root:
 *   DUFFEL_API_KEY=duffel_test_...
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * Run: pnpm --filter @otaip/demo book
 */

import Anthropic from '@anthropic-ai/sdk';
import { DuffelAdapter } from '../packages/adapters/duffel/src/duffel-adapter.ts';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
const adapter = new DuffelAdapter();

const tools: Anthropic.Tool[] = [
  {
    name: 'search_flights',
    description:
      'Search for available flights. Returns all offers with full itinerary and price details. You will evaluate ALL returned options and select the best one based on the traveler context - do not just pick the cheapest.',
    input_schema: {
      type: 'object' as const,
      properties: {
        origin: { type: 'string', description: 'IATA airport code e.g. LHR' },
        destination: { type: 'string', description: 'IATA airport code e.g. AMS' },
        departure_date: { type: 'string', description: 'YYYY-MM-DD' },
        cabin_class: {
          type: 'string',
          enum: ['economy', 'premium_economy', 'business', 'first'],
          description: 'Cabin class',
        },
        max_connections: {
          type: 'number',
          description: '0 for direct only, 1 for max one stop. Omit to return all.',
        },
      },
      required: ['origin', 'destination', 'departure_date', 'cabin_class'],
    },
  },
  {
    name: 'price_offer',
    description:
      'Confirm current price and availability for the selected offer. Always call this immediately before booking - offers expire. If unavailable, go back and pick the next best option.',
    input_schema: {
      type: 'object' as const,
      properties: {
        offer_id: { type: 'string', description: 'offer_id from search_flights' },
      },
      required: ['offer_id'],
    },
  },
  {
    name: 'book_flight',
    description:
      'Create a confirmed booking for the selected offer. Returns a booking reference. Only call this after pricing confirms availability.',
    input_schema: {
      type: 'object' as const,
      properties: {
        offer_id: { type: 'string' },
        passenger_title: { type: 'string', enum: ['mr', 'ms', 'mrs', 'miss', 'dr'] },
        passenger_given_name: { type: 'string' },
        passenger_family_name: { type: 'string' },
        passenger_born_on: { type: 'string', description: 'YYYY-MM-DD' },
        passenger_gender: { type: 'string', enum: ['m', 'f'] },
        passenger_email: { type: 'string' },
        passenger_phone: { type: 'string', description: 'E.164 e.g. +447700900000' },
      },
      required: [
        'offer_id',
        'passenger_title',
        'passenger_given_name',
        'passenger_family_name',
        'passenger_born_on',
        'passenger_gender',
        'passenger_email',
        'passenger_phone',
      ],
    },
  },
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  console.log(`\n[TOOL CALL] ${name}`);
  console.log(JSON.stringify(input, null, 2));

  try {
    if (name === 'search_flights') {
      const result = await adapter.search({
        segments: [
          {
            origin: input['origin'] as string,
            destination: input['destination'] as string,
            departure_date: input['departure_date'] as string,
          },
        ],
        passengers: [{ type: 'ADT', count: 1 }],
        cabin_class: input['cabin_class'] as 'economy' | 'premium_economy' | 'business' | 'first' | undefined ?? 'economy',
        max_connections: input['max_connections'] as number | undefined,
      });

      // Return all offers so Claude can evaluate them properly
      const offers = result.offers.map((o) => ({
        offer_id: o.offer_id,
        price: { total: o.price.total, currency: o.price.currency },
        segments: o.itinerary.segments.map((s) => ({
          flight: `${s.carrier}${s.flight_number}`,
          from: s.origin,
          to: s.destination,
          departs: s.departure_time,
          arrives: s.arrival_time,
          duration_minutes: s.duration_minutes,
          cabin: s.cabin_class,
          aircraft: s.aircraft ?? null,
        })),
        total_duration_minutes: o.itinerary.total_duration_minutes,
        connections: o.itinerary.connection_count,
        expires_at: o.expires_at ?? null,
        instant_ticketing: o.instant_ticketing,
      }));

      console.log(`[RESULT] ${offers.length} offers returned`);
      return JSON.stringify({ offers, total_found: result.offers.length });
    }

    if (name === 'price_offer') {
      const result = await adapter.price!({
        offer_id: input['offer_id'] as string,
        source: 'duffel',
        passengers: [{ type: 'ADT', count: 1 }],
      });
      console.log(`[RESULT] available=${result.available}, total=${result.price.total} ${result.price.currency}`);
      return JSON.stringify({
        available: result.available,
        price: { total: result.price.total, currency: result.price.currency },
        expires_at: result.expires_at ?? null,
      });
    }

    if (name === 'book_flight') {
      const result = await adapter.book({
        offer_id: input['offer_id'] as string,
        passengers: [
          {
            title: input['passenger_title'] as 'mr' | 'ms' | 'mrs' | 'miss' | 'dr',
            given_name: input['passenger_given_name'] as string,
            family_name: input['passenger_family_name'] as string,
            born_on: input['passenger_born_on'] as string,
            email: input['passenger_email'] as string,
            phone_number: input['passenger_phone'] as string,
            gender: input['passenger_gender'] as 'm' | 'f',
            type: 'adult',
          },
        ],
      });
      console.log(`\n${'='.repeat(60)}`);
      console.log(`BOOKING CONFIRMED: ${result.booking_reference}`);
      console.log(`Order ID: ${result.order_id}`);
      console.log(`Total: ${result.total_amount} ${result.total_currency}`);
      console.log('='.repeat(60));
      return JSON.stringify({
        booking_reference: result.booking_reference,
        order_id: result.order_id,
        total: `${result.total_amount} ${result.total_currency}`,
        status: 'confirmed',
      });
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] ${name}:`, msg);
    return JSON.stringify({ error: msg });
  }
}

async function run() {
  // 2 weeks out so offers are available
  const twoWeeksOut = new Date();
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);
  const departureDate = twoWeeksOut.toISOString().split('T')[0]!;

  // This is the traveler context. The agent makes all decisions.
  // No "pick the cheapest" - the agent evaluates against the full context.
  const userMessage =
    `Book a flight for me. Here's my situation: ` +
    `I need to get from London Heathrow (LHR) to Amsterdam Schiphol (AMS) on ${departureDate}. ` +
    `I have a client meeting at 11am Amsterdam time so I need to land with at least 45 minutes to spare - ` +
    `account for getting out of the airport. ` +
    `I prefer direct flights but will take one stop if the timing works significantly better. ` +
    `Economy is fine, I'm not trying to spend more than necessary but time is more important than saving 30 pounds. ` +
    `Passenger: Mr. John Test, born 1985-06-15, john.test@example.com, +447700900000, male. ` +
    `Make the booking and tell me what you chose and why.`;

  const systemPrompt =
    `You are an intelligent travel booking agent powered by OTAIP. ` +
    `Your job is to search for flights, evaluate ALL available options against the traveler's stated context and constraints, ` +
    `select the best option (not necessarily the cheapest - consider timing, connections, duration, and stated preferences), ` +
    `confirm pricing, complete the booking, and then explain your decision clearly. ` +
    `\n\nYour final response after booking must follow this format:` +
    `\n\nBooking confirmed - Reference: [PNR]` +
    `\n\nFlight: [carrier + flight number] | [origin] -> [destination] | Departs [time] -> Arrives [time]` +
    `\nPassenger: [name] | Economy | Total: [amount]` +
    `\n\nWhy I chose this: [2-3 sentences explaining your reasoning. Which other options were available, ` +
    `why they were worse, what made this the right call given the traveler's context.]`;

  console.log('='.repeat(60));
  console.log('OTAIP LLM Booking Demo - Intelligent Agent');
  console.log('='.repeat(60));
  console.log(`\nTraveler request: ${userMessage}\n`);

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  let iteration = 0;
  const MAX_ITERATIONS = 10;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n--- Agent step ${iteration} ---`);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    console.log(`stop_reason: ${response.stop_reason}`);

    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        console.log(`\n[AGENT]\n${block.text}`);
      }
    }

    if (response.stop_reason === 'end_turn') {
      console.log('\nDemo complete.');
      break;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input as Record<string, unknown>);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });
    }
  }

  if (iteration >= MAX_ITERATIONS) {
    console.error('Hit max iterations.');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
