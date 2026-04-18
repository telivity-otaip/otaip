#!/usr/bin/env tsx
/**
 * Single source of truth for the agent count + per-stage breakdown.
 *
 * Walks the workspace exactly the same way the CLI does
 * (packages/cli/src/agent-discovery.ts), so README claims, docs counts,
 * and the release-notes pipeline cannot drift apart.
 *
 * Usage:
 *   pnpm tsx scripts/count-agents.ts            # plain text
 *   pnpm tsx scripts/count-agents.ts --json     # machine-readable
 *
 * The previous release.yml `find` command undercounted by skipping
 * packages/agents-platform and packages/agents-tmc; this script does not.
 */

import { discoverAgents } from '../packages/cli/src/agent-discovery.js';

interface Counts {
  total: number;
  stages: number;
  by_stage: Record<string, number>;
}

function tally(): Counts {
  const agents = discoverAgents();
  const by_stage: Record<string, number> = {};
  for (const a of agents) {
    by_stage[a.stage] = (by_stage[a.stage] ?? 0) + 1;
  }
  return {
    total: agents.length,
    stages: Object.keys(by_stage).length,
    by_stage,
  };
}

function printJson(counts: Counts): void {
  console.log(JSON.stringify(counts, null, 2));
}

function printText(counts: Counts): void {
  console.log(`Total agents: ${counts.total}`);
  console.log(`Stages:       ${counts.stages}`);
  console.log('');
  for (const [stage, n] of Object.entries(counts.by_stage).sort()) {
    console.log(`  ${stage.padEnd(20)} ${n}`);
  }
}

const counts = tally();
if (process.argv.includes('--json')) {
  printJson(counts);
} else {
  printText(counts);
}
