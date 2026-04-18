/**
 * CLI command: otaip agents
 *
 * List all OTAIP agents with their contract status. The registry is
 * AUTO-DISCOVERED from the workspace source tree at module load time —
 * no hand-maintained array. See `../agent-discovery.ts`.
 */

import { Command } from 'commander';
import { discoverAgents } from '../agent-discovery.js';

const AGENTS = discoverAgents();

export const agentsCommand = new Command('agents')
  .description('List all OTAIP agents with contract status')
  .option('--json', 'Output as JSON')
  .option('--stage <stage>', 'Filter by stage name')
  .option('--verbose', 'Show source path')
  .action(async (opts: { json?: boolean; stage?: string; verbose?: boolean }) => {
    let filtered = AGENTS;
    if (opts.stage) {
      filtered = AGENTS.filter((a) => a.stage === opts.stage!.toLowerCase());
    }

    if (opts.json) {
      console.log(JSON.stringify({ agents: filtered, total: filtered.length }, null, 2));
      return;
    }

    console.log('');
    console.log('  OTAIP Agent Registry');
    console.log('  ' + '-'.repeat(76));

    if (opts.verbose) {
      console.log(
        '  ' +
          'ID'.padEnd(8) +
          'Name'.padEnd(30) +
          'Stage'.padEnd(16) +
          'Contract'.padEnd(10) +
          'Source',
      );
    } else {
      console.log(
        '  ' +
          'ID'.padEnd(8) +
          'Name'.padEnd(32) +
          'Stage'.padEnd(16) +
          'Contract',
      );
    }
    console.log('  ' + '-'.repeat(76));

    for (const a of filtered) {
      if (opts.verbose) {
        console.log(
          '  ' +
            a.id.padEnd(8) +
            a.name.padEnd(30) +
            a.stage.padEnd(16) +
            a.contract_status.padEnd(10) +
            a.source_path,
        );
      } else {
        console.log(
          '  ' +
            a.id.padEnd(8) +
            a.name.padEnd(32) +
            a.stage.padEnd(16) +
            a.contract_status,
        );
      }
    }
    console.log('  ' + '-'.repeat(76));
    console.log(`  Total: ${filtered.length} agents`);
    console.log('');
  });
