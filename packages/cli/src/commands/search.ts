/**
 * CLI command: otaip search
 *
 * Search for flight availability across distribution adapters.
 */

import { Command } from 'commander';

export const searchCommand = new Command('search')
  .description('Search for flight availability')
  .requiredOption('--from <iata>', 'Origin airport IATA code')
  .requiredOption('--to <iata>', 'Destination airport IATA code')
  .requiredOption('--date <iso>', 'Departure date (YYYY-MM-DD)')
  .option('--adapter <id>', 'Distribution adapter to use', 'amadeus')
  .option('--passengers <count>', 'Number of passengers', '1')
  .option('--json', 'Output as JSON')
  .option('--verbose', 'Show confidence and gate details')
  .action(async (opts: {
    from: string;
    to: string;
    date: string;
    adapter: string;
    passengers: string;
    json?: boolean;
    verbose?: boolean;
  }) => {
    const searchRequest = {
      origin: opts.from.toUpperCase(),
      destination: opts.to.toUpperCase(),
      departure_date: opts.date,
      adapter: opts.adapter,
      passengers: parseInt(opts.passengers, 10),
    };

    if (opts.json) {
      console.log(JSON.stringify({
        status: 'adapter_not_configured',
        message: `Adapter "${opts.adapter}" is not configured. Install and configure the adapter to enable search.`,
        request: searchRequest,
      }, null, 2));
      return;
    }

    console.log('');
    console.log(`  Search: ${searchRequest.origin} -> ${searchRequest.destination}`);
    console.log(`  Date:   ${searchRequest.departure_date}`);
    console.log(`  PAX:    ${searchRequest.passengers}`);
    console.log(`  Adapter: ${searchRequest.adapter}`);
    console.log('');
    console.log(`  Status: adapter "${opts.adapter}" not configured`);
    console.log('  Install and configure the adapter to enable search.');
    console.log('');

    if (opts.verbose) {
      console.log('  Pipeline: search -> price -> book');
      console.log('  Agents:   1.1 (Availability Search) -> 1.2 (Connection Builder)');
      console.log('');
    }
  });
