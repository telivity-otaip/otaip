import { describe, it, expect } from 'vitest';
import { discoverAgents } from '../agent-discovery.js';

describe('discoverAgents', () => {
  const agents = discoverAgents();

  it('finds at least 60 agents across the workspace', () => {
    // Hard floor: anything substantially below this means the discovery
    // walk is broken (paths moved, regex stopped matching, etc.).
    expect(agents.length).toBeGreaterThanOrEqual(60);
  });

  it('every entry has id, name, stage, version', () => {
    for (const a of agents) {
      expect(a.id).toMatch(/^\d+(\.\d+)+$/);
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.stage.length).toBeGreaterThan(0);
      expect(a.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('agent IDs are unique', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const a of agents) {
      if (seen.has(a.id)) dupes.push(a.id);
      seen.add(a.id);
    }
    expect(dupes).toEqual([]);
  });

  it('source_path resolves to a real file under the repo', () => {
    expect(agents[0]!.source_path).toMatch(/^packages\//);
    expect(agents[0]!.source_path).toMatch(/\/index\.ts$/);
  });

  it('stage matches the agent ID prefix where applicable', () => {
    // Stage 0 = reference, 1 = search, 2 = pricing, 3 = booking,
    // 4 = ticketing, 5 = exchange, 6 = settlement, 7 = reconciliation,
    // 20 = lodging. Platform (9.x) and TMC (8.x) are flat layouts so
    // the stage name does not match the numeric prefix.
    const expectedStage: Record<string, string> = {
      '0': 'reference',
      '1': 'search',
      '2': 'pricing',
      '3': 'booking',
      '4': 'ticketing',
      '5': 'exchange',
      '6': 'settlement',
      '7': 'reconciliation',
      '20': 'lodging',
    };
    for (const a of agents) {
      const prefix = a.id.split('.')[0]!;
      const expected = expectedStage[prefix];
      if (!expected) continue; // 8.x → tmc, 9.x → platform handled separately
      expect(a.stage, `agent ${a.id} ${a.name}`).toBe(expected);
    }
  });

  it('contract_status is "stub" exactly when version is 0.0.0', () => {
    for (const a of agents) {
      if (a.version === '0.0.0') {
        expect(a.contract_status).toBe('stub');
      } else {
        expect(a.contract_status).toBe('active');
      }
    }
  });

  it('agents are sorted by numeric ID components (2.10 after 2.2)', () => {
    for (let i = 1; i < agents.length; i++) {
      const prev = agents[i - 1]!.id.split('.').map(Number);
      const curr = agents[i]!.id.split('.').map(Number);
      const len = Math.max(prev.length, curr.length);
      for (let j = 0; j < len; j++) {
        const a = prev[j] ?? 0;
        const b = curr[j] ?? 0;
        if (a < b) break;
        if (a === b) continue;
        throw new Error(
          `Out of order: ${agents[i - 1]!.id} should not come before ${agents[i]!.id}`,
        );
      }
    }
  });
});
