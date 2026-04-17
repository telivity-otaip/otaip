/**
 * CLI command: otaip book
 *
 * Book an offer by creating a PNR.
 */

import { Command } from 'commander';

export const bookCommand = new Command('book')
  .description('Book an offer — create a PNR')
  .requiredOption('--offer-id <id>', 'Offer ID to book')
  .requiredOption('--passengers <names>', 'Passenger(s) as "Last/First/Type" (comma-separated)')
  .option('--adapter <id>', 'Distribution adapter to use', 'amadeus')
  .option('--json', 'Output as JSON')
  .option('--verbose', 'Show confidence and gate details')
  .action(async (opts: {
    offerId: string;
    passengers: string;
    adapter: string;
    json?: boolean;
    verbose?: boolean;
  }) => {
    const paxList = opts.passengers.split(',').map((p) => {
      const parts = p.trim().split('/');
      return {
        last_name: parts[0] ?? '',
        first_name: parts[1] ?? '',
        type: parts[2] ?? 'ADT',
      };
    });

    if (opts.json) {
      console.log(JSON.stringify({
        status: 'adapter_not_configured',
        message: `Adapter "${opts.adapter}" is not configured. Install and configure the adapter to enable booking.`,
        offer_id: opts.offerId,
        passengers: paxList,
      }, null, 2));
      return;
    }

    console.log('');
    console.log(`  Book offer: ${opts.offerId}`);
    console.log(`  Adapter:    ${opts.adapter}`);
    console.log(`  Passengers: ${paxList.length}`);
    for (const pax of paxList) {
      console.log(`    - ${pax.last_name}/${pax.first_name} (${pax.type})`);
    }
    console.log('');
    console.log(`  Status: adapter "${opts.adapter}" not configured`);
    console.log('  Install and configure the adapter to enable booking.');
    console.log('');

    if (opts.verbose) {
      console.log('  Pipeline: book -> pnr-create -> ticketing');
      console.log('  Agents:   3.1 (GDS/NDC Router) -> 3.2 (PNR Creation) -> 3.3 (Payment)');
      console.log('');
    }
  });
