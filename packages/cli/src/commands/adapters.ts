/**
 * CLI command: otaip adapters
 *
 * List available distribution adapters and their status.
 */

import { Command } from 'commander';

/** Known adapters from the OTAIP connect package. */
const KNOWN_ADAPTERS = [
  { id: 'amadeus', name: 'Amadeus GDS', type: 'GDS', status: 'not configured' },
  { id: 'sabre', name: 'Sabre GDS', type: 'GDS', status: 'not configured' },
  { id: 'travelport', name: 'Travelport GDS', type: 'GDS', status: 'not configured' },
  { id: 'navitaire', name: 'Navitaire LCC', type: 'Direct', status: 'not configured' },
  { id: 'trippro', name: 'TripPro NDC', type: 'NDC', status: 'not configured' },
  { id: 'haip', name: 'HAIP Aggregator', type: 'Aggregator', status: 'not configured' },
  { id: 'duffel', name: 'Duffel NDC', type: 'NDC', status: 'not configured' },
];

export const adaptersCommand = new Command('adapters')
  .description('List available distribution adapters')
  .option('--json', 'Output as JSON')
  .action(async (opts: { json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ adapters: KNOWN_ADAPTERS }, null, 2));
      return;
    }

    console.log('');
    console.log('  Available Adapters');
    console.log('  ' + '-'.repeat(60));
    console.log(
      '  ' +
        'ID'.padEnd(14) +
        'Name'.padEnd(20) +
        'Type'.padEnd(14) +
        'Status',
    );
    console.log('  ' + '-'.repeat(60));
    for (const a of KNOWN_ADAPTERS) {
      console.log(
        '  ' +
          a.id.padEnd(14) +
          a.name.padEnd(20) +
          a.type.padEnd(14) +
          a.status,
      );
    }
    console.log('  ' + '-'.repeat(60));
    console.log(`  Total: ${KNOWN_ADAPTERS.length} adapters`);
    console.log('');
  });
