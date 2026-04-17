import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AgentContract } from '../../pipeline-validator/types.js';
import {
  generateMcpTools,
  generateOpenAiFunctions,
  generateCatalog,
} from '../catalog-generator.js';

const sampleContract: AgentContract = {
  agentId: '1.1',
  inputSchema: z.object({
    origin: z.string().length(3),
    destination: z.string().length(3),
    departure_date: z.string(),
    passengers: z.array(z.object({
      type: z.enum(['ADT', 'CHD', 'INF']),
      count: z.number().int().positive(),
    })).min(1),
  }),
  outputSchema: z.object({
    offers: z.array(z.object({ offer_id: z.string() })),
    total_raw_offers: z.number(),
  }),
  actionType: 'query',
  confidenceThreshold: 0.7,
  outputContract: ['offers'],
  async validate() { return { ok: true, warnings: [] }; },
};

describe('generateMcpTools', () => {
  it('produces tool definitions with the correct name and JSON Schema input', () => {
    const tools = generateMcpTools([sampleContract]);
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('availability_search');
    expect(tools[0]!.inputSchema['type']).toBe('object');
    const props = tools[0]!.inputSchema['properties'] as Record<string, unknown>;
    expect(props).toHaveProperty('origin');
    expect(props).toHaveProperty('passengers');
  });

  it('accepts custom name overrides', () => {
    const tools = generateMcpTools([sampleContract], { '1.1': 'search_flights' });
    expect(tools[0]!.name).toBe('search_flights');
  });
});

describe('generateOpenAiFunctions', () => {
  it('produces functions with strict: true and draft-7 schema', () => {
    const fns = generateOpenAiFunctions([sampleContract]);
    expect(fns).toHaveLength(1);
    expect(fns[0]!.strict).toBe(true);
    expect(fns[0]!.parameters['type']).toBe('object');
  });
});

describe('generateCatalog', () => {
  it('produces a catalog keyed by agent ID with input + output schemas', () => {
    const catalog = generateCatalog([sampleContract]);
    expect(catalog).toHaveProperty('1.1');
    expect(catalog['1.1']!.input['type']).toBe('object');
    expect(catalog['1.1']!.output['type']).toBe('object');
    const outProps = catalog['1.1']!.output['properties'] as Record<string, unknown>;
    expect(outProps).toHaveProperty('offers');
  });

  it('handles multiple contracts', () => {
    const second: AgentContract = {
      ...sampleContract,
      agentId: '2.1',
      inputSchema: z.object({ fare_basis: z.string() }),
      outputSchema: z.object({ rules: z.array(z.unknown()) }),
    };
    const catalog = generateCatalog([sampleContract, second]);
    expect(Object.keys(catalog)).toHaveLength(2);
    expect(catalog).toHaveProperty('2.1');
  });
});
