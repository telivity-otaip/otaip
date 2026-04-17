import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Agent } from '../../types/agent.js';
import type { AgentContract, ReferenceDataProvider } from '../../pipeline-validator/types.js';
import { PipelineOrchestrator } from '../../pipeline-validator/orchestrator.js';
import { InMemoryEventStore } from '../../event-store/in-memory.js';
import {
  AGENT_TOOL_NAMES,
  AgentToolError,
  agentToTool,
  registerAgentTools,
} from '../agent-tool-bridge.js';
import { ToolRegistry } from '../registry.js';

const emptyReference: ReferenceDataProvider = {
  async resolveAirport() { return null; },
  async resolveAirline() { return null; },
  async decodeFareBasis() { return null; },
};

function mkAgent(id: string, transform: (d: unknown) => unknown, confidence = 1.0): Agent {
  return {
    id, name: id, version: '0.0.1',
    async initialize() {},
    async execute(input) { return { data: transform(input.data), confidence }; },
    async health() { return { status: 'healthy' }; },
  };
}

const echoContract: AgentContract = {
  agentId: 'echo',
  inputSchema: z.object({ msg: z.string() }),
  outputSchema: z.object({ out: z.string() }),
  actionType: 'query',
  confidenceThreshold: 0.7,
  outputContract: ['out'],
  async validate() { return { ok: true, warnings: [] }; },
};

function makeOrch(contracts: Map<string, AgentContract>, agents: Map<string, Agent>) {
  return new PipelineOrchestrator({
    reference: emptyReference,
    contracts,
    agents,
  });
}

describe('agentToTool', () => {
  it('returns a ToolDefinition that delegates to the orchestrator', async () => {
    const agent = mkAgent('echo', (d) => ({ out: (d as { msg: string }).msg.toUpperCase() }));
    const orch = makeOrch(
      new Map([['echo', echoContract]]),
      new Map([['echo', agent]]),
    );
    const session = orch.createSession({
      type: 'test', origin: 'JFK', destination: 'LHR',
      outboundDate: '2026-05-01', passengerCount: 1,
    });
    const tool = agentToTool(echoContract, agent, orch, session);

    expect(tool.name).toBe('echo');
    expect(tool.description).toBe('echo');

    const result = await tool.execute({ msg: 'hello' });
    expect(result).toEqual({ out: 'HELLO' });
    expect(session.history).toHaveLength(1);
  });

  it('uses AGENT_TOOL_NAMES for known agent IDs', () => {
    const contract: AgentContract = {
      ...echoContract,
      agentId: '1.1',
    };
    const agent = mkAgent('1.1', () => ({}));
    const orch = makeOrch(
      new Map([['1.1', contract]]),
      new Map([['1.1', agent]]),
    );
    const session = orch.createSession({
      type: 'test', origin: 'JFK', destination: 'LHR',
      outboundDate: '2026-05-01', passengerCount: 1,
    });
    const tool = agentToTool(contract, agent, orch, session);
    expect(tool.name).toBe('availability_search');
  });

  it('allows custom tool name via options', () => {
    const agent = mkAgent('echo', () => ({}));
    const orch = makeOrch(
      new Map([['echo', echoContract]]),
      new Map([['echo', agent]]),
    );
    const session = orch.createSession({
      type: 'test', origin: 'JFK', destination: 'LHR',
      outboundDate: '2026-05-01', passengerCount: 1,
    });
    const tool = agentToTool(echoContract, agent, orch, session, {
      toolName: 'custom_echo',
    });
    expect(tool.name).toBe('custom_echo');
  });

  it('throws AgentToolError when the pipeline rejects', async () => {
    const agent = mkAgent('echo', () => ({}));
    const orch = makeOrch(
      new Map([['echo', echoContract]]),
      new Map([['echo', agent]]),
    );
    const session = orch.createSession({
      type: 'test', origin: 'JFK', destination: 'LHR',
      outboundDate: '2026-05-01', passengerCount: 1,
    });
    const tool = agentToTool(echoContract, agent, orch, session);

    // Send wrong schema — should fail at schema_in gate.
    try {
      await tool.execute({ wrong: 42 } as unknown);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentToolError);
      const e = err as AgentToolError;
      expect(e.reason).toBe('schema_invalid');
      expect(e.agentId).toBe('echo');
    }
  });

  it('logs agent.executed events to the EventStore when provided', async () => {
    const agent = mkAgent('echo', (d) => ({ out: (d as { msg: string }).msg }));
    const store = new InMemoryEventStore();
    const orch = makeOrch(
      new Map([['echo', echoContract]]),
      new Map([['echo', agent]]),
    );
    const session = orch.createSession({
      type: 'test', origin: 'JFK', destination: 'LHR',
      outboundDate: '2026-05-01', passengerCount: 1,
    });
    const tool = agentToTool(echoContract, agent, orch, session, {
      eventStore: store,
    });
    await tool.execute({ msg: 'hi' });

    // Give the fire-and-forget append a tick to resolve.
    await new Promise((r) => setTimeout(r, 10));

    expect(store.size).toBe(1);
    const events = await store.query({ type: 'agent.executed' });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('agent.executed');
  });
});

describe('registerAgentTools', () => {
  it('registers all contracted agents in a ToolRegistry', () => {
    const agent = mkAgent('echo', () => ({}));
    const contracts = new Map([['echo', echoContract]]);
    const agents = new Map<string, Agent>([['echo', agent]]);
    const orch = makeOrch(contracts, agents);
    const session = orch.createSession({
      type: 'test', origin: 'JFK', destination: 'LHR',
      outboundDate: '2026-05-01', passengerCount: 1,
    });
    const registry = new ToolRegistry();
    registerAgentTools(contracts, agents, orch, session, registry);
    expect(registry.listAll()).toHaveLength(1);
    expect(registry.get('echo')).toBeDefined();
  });
});

describe('AGENT_TOOL_NAMES', () => {
  it('includes all 10 contracted agents', () => {
    expect(Object.keys(AGENT_TOOL_NAMES)).toHaveLength(10);
    expect(AGENT_TOOL_NAMES['3.8']).toBe('pnr_retrieval');
  });
});
