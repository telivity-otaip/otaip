/**
 * OTAIP Full Pipeline Demo — Search → Price → Book → Ticket
 *
 * This demo uses the Sprint A/B pipeline architecture:
 *  - Agent contracts define Zod schemas (single source of truth)
 *  - Catalog generator produces Anthropic tool definitions from contracts
 *  - agentToTool() bridges each agent to the pipeline validator
 *  - Every tool call runs through 6 gates (schema, semantic, intent lock,
 *    cross-agent, confidence, action classification)
 *  - EventStore logs every agent execution with duration + gate results
 *
 * No hand-written JSON schemas. No manual tool dispatch. The pipeline
 * enforces the contract — the LLM can't hallucinate offer IDs, change
 * the destination mid-flow, or ticket without an approval token.
 *
 * Requires .env at repo root:
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * Run: pnpm --filter @otaip/demo book:full
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import type { Agent, AgentContract } from '../packages/core/src/index.ts';
import {
  PipelineOrchestrator,
  InMemoryEventStore,
  agentToTool,
  generateMcpTools,
  zodToJsonSchema,
  AGENT_TOOL_NAMES,
} from '../packages/core/src/index.ts';
import type { ReferenceDataProvider } from '../packages/core/src/pipeline-validator/types.ts';

// Agent contracts
import {
  availabilitySearchContract,
} from '../packages/agents/search/src/availability-search/contract.ts';
import {
  fareRuleAgentContract,
} from '../packages/agents/pricing/src/fare-rule-agent/contract.ts';
import {
  gdsNdcRouterContract,
} from '../packages/agents/booking/src/gds-ndc-router/contract.ts';
import {
  pnrBuilderContract,
} from '../packages/agents/booking/src/pnr-builder/contract.ts';
import {
  pnrRetrievalContract,
} from '../packages/agents/booking/src/pnr-retrieval/contract.ts';

// Agent classes
import { AvailabilitySearch } from '../packages/agents/search/src/availability-search/index.ts';
import { FareRuleAgent } from '../packages/agents/pricing/src/fare-rule-agent/index.ts';
import { GdsNdcRouter } from '../packages/agents/booking/src/gds-ndc-router/index.ts';
import { PnrBuilder } from '../packages/agents/booking/src/pnr-builder/index.ts';
import { PnrRetrieval } from '../packages/agents/booking/src/pnr-retrieval/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

// ─────────────────────────────────────────────────────────────────────────────
// Reference data provider — minimal stub for the demo.
// In production, wire ReferenceAgentDataProvider from @otaip/agents-reference.
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_AIRPORTS: Record<string, { name: string }> = {
  JFK: { name: 'John F Kennedy' }, LHR: { name: 'London Heathrow' },
  AMS: { name: 'Amsterdam Schiphol' }, CDG: { name: 'Paris CDG' },
  FRA: { name: 'Frankfurt' }, LAX: { name: 'Los Angeles' },
  SFO: { name: 'San Francisco' }, DXB: { name: 'Dubai' },
  SIN: { name: 'Singapore Changi' }, HND: { name: 'Tokyo Haneda' },
  ORD: { name: 'Chicago O\'Hare' }, ATL: { name: 'Atlanta' },
  DFW: { name: 'Dallas/Fort Worth' }, SEA: { name: 'Seattle-Tacoma' },
};

const KNOWN_AIRLINES: Record<string, { name: string }> = {
  BA: { name: 'British Airways' }, LH: { name: 'Lufthansa' },
  AA: { name: 'American Airlines' }, UA: { name: 'United Airlines' },
  DL: { name: 'Delta' }, AF: { name: 'Air France' },
  KL: { name: 'KLM' }, EK: { name: 'Emirates' },
};

const demoReference: ReferenceDataProvider = {
  async resolveAirport(code) {
    const rec = KNOWN_AIRPORTS[code];
    return rec
      ? { iataCode: code, name: rec.name, matchConfidence: 1.0 }
      : null;
  },
  async resolveAirline(code) {
    const rec = KNOWN_AIRLINES[code];
    return rec
      ? { iataCode: code, name: rec.name, matchConfidence: 1.0 }
      : null;
  },
  async decodeFareBasis(code) {
    return { fareBasis: code, matchConfidence: 1.0 };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Setup: orchestrator + agents + tool bridge
// ─────────────────────────────────────────────────────────────────────────────

// The contracts and agents we're exposing to the LLM.
const DEMO_CONTRACTS = new Map<string, AgentContract>([
  ['1.1', availabilitySearchContract],
  ['2.1', fareRuleAgentContract],
  ['3.1', gdsNdcRouterContract],
  ['3.2', pnrBuilderContract],
  ['3.8', pnrRetrievalContract],
]);

async function createDemoAgents(): Promise<Map<string, Agent>> {
  const search = new AvailabilitySearch();
  const fareRule = new FareRuleAgent();
  const router = new GdsNdcRouter();
  const pnrBuilder = new PnrBuilder();
  const pnrRetrieval = new PnrRetrieval();

  await Promise.all([
    search.initialize(),
    fareRule.initialize(),
    router.initialize(),
    pnrBuilder.initialize(),
    pnrRetrieval.initialize(),
  ]);

  return new Map<string, Agent>([
    ['1.1', search as Agent],
    ['2.1', fareRule as Agent],
    ['3.1', router as Agent],
    ['3.2', pnrBuilder as Agent],
    ['3.8', pnrRetrieval as Agent],
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Convert agent contracts → Anthropic tool definitions
// ─────────────────────────────────────────────────────────────────────────────

function contractsToAnthropicTools(contracts: AgentContract[]): Anthropic.Tool[] {
  return contracts.map((c) => {
    const name = AGENT_TOOL_NAMES[c.agentId] ?? c.agentId;
    return {
      name,
      description: `OTAIP agent ${c.agentId}: ${name} (${c.actionType})`,
      input_schema: zodToJsonSchema(c.inputSchema) as Anthropic.Tool.InputSchema,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error('Set ANTHROPIC_API_KEY in .env or environment. See demo/README.md.');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
  const eventStore = new InMemoryEventStore();
  const agents = await createDemoAgents();

  const orchestrator = new PipelineOrchestrator({
    reference: demoReference,
    contracts: DEMO_CONTRACTS,
    agents,
  });

  // 2 weeks out for availability
  const twoWeeksOut = new Date();
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);
  const departureDate = twoWeeksOut.toISOString().split('T')[0]!;

  const session = orchestrator.createSession({
    type: 'one_way_economy_booking',
    origin: 'LHR',
    destination: 'AMS',
    outboundDate: departureDate,
    passengerCount: 1,
    cabinClass: 'economy',
  });

  // Bridge each contracted agent into a tool the LLM can call.
  const toolMap = new Map<string, ReturnType<typeof agentToTool>>();
  for (const [agentId, contract] of DEMO_CONTRACTS) {
    const agent = agents.get(agentId);
    if (!agent) continue;
    const tool = agentToTool(contract, agent, orchestrator, session, { eventStore });
    toolMap.set(tool.name, tool);
  }

  // Generate Anthropic tool definitions from contracts.
  const anthropicTools = contractsToAnthropicTools([...DEMO_CONTRACTS.values()]);

  // Dispatch helper — calls the bridged tool (which runs through the pipeline).
  async function executeTool(name: string, input: unknown): Promise<string> {
    console.log(`\n[TOOL CALL] ${name}`);
    console.log(JSON.stringify(input, null, 2));

    const tool = toolMap.get(name);
    if (!tool) {
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    }

    try {
      const result = await tool.execute(input);
      const summary = JSON.stringify(result);
      console.log(`[RESULT] ${summary.length > 200 ? summary.slice(0, 200) + '...' : summary}`);
      return summary;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[PIPELINE REJECTION] ${msg}`);
      return JSON.stringify({ error: msg });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LLM conversation loop
  // ─────────────────────────────────────────────────────────────────────────

  const userMessage =
    `Book a flight for me. I need to get from London Heathrow (LHR) to Amsterdam Schiphol (AMS) on ${departureDate}. ` +
    `Economy is fine. Search for available flights, pick the best option, then route it and build the PNR. ` +
    `Passenger: Mr. John Test, DOB 1985-06-15, economy, AMADEUS GDS. ` +
    `Contact: +442080160509, john.test@example.com.`;

  const systemPrompt =
    `You are an OTAIP pipeline-powered booking agent. You have access to ` +
    `contracted agents that run through a 6-gate pipeline validator. ` +
    `Use the tools in order: availability_search → gds_ndc_router → pnr_builder. ` +
    `Each tool enforces schema validation, semantic checks, intent lock, ` +
    `cross-agent consistency, confidence gating, and action classification. ` +
    `If a tool rejects your call, read the error and fix the input.`;

  console.log('='.repeat(60));
  console.log('OTAIP Full Pipeline Demo');
  console.log('Contract-driven tools · 6-gate pipeline validator · EventStore logging');
  console.log('='.repeat(60));
  console.log(`\nTraveler request: ${userMessage}\n`);
  console.log(`Tools available: ${anthropicTools.map((t) => t.name).join(', ')}\n`);

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  let iteration = 0;
  const MAX_ITERATIONS = 15;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n--- Agent step ${iteration} ---`);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools: anthropicTools,
      messages,
    });

    console.log(`stop_reason: ${response.stop_reason}`);

    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        console.log(`\n[AGENT]\n${block.text}`);
      }
    }

    if (response.stop_reason === 'end_turn') {
      break;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input);
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

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(60));
  console.log('Pipeline Summary');
  console.log('='.repeat(60));
  console.log(`Session: ${session.sessionId}`);
  console.log(`Intent: ${session.intent.origin} → ${session.intent.destination} on ${session.intent.outboundDate}`);
  console.log(`Invocations: ${session.history.length}`);
  for (const inv of session.history) {
    const gates = inv.gateResults.map((g) => `${g.gate}:${g.passed ? 'pass' : 'FAIL'}`).join(' ');
    console.log(`  ${inv.agentId} [${inv.status}] ${gates}`);
  }

  const events = await eventStore.query({ type: 'agent.executed' });
  console.log(`\nEventStore: ${events.length} agent.executed events logged`);
  if (events.length > 0) {
    const agg = await eventStore.aggregate('durationMs', {
      from: '2000-01-01T00:00:00Z',
      to: '2099-01-01T00:00:00Z',
    });
    console.log(`  Total duration: ${agg.sum?.toFixed(0) ?? 0}ms | Avg: ${agg.avg?.toFixed(0) ?? 0}ms | p95: ${agg.p95?.toFixed(0) ?? 0}ms`);
  }

  if (iteration >= MAX_ITERATIONS) {
    console.error('\nHit max iterations.');
    process.exit(1);
  }

  console.log('\nDemo complete.');
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
