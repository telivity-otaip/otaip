/**
 * CLI command: otaip price
 *
 * Price a specific offer from a search result.
 */

import { Command } from 'commander';

export const priceCommand = new Command('price')
  .description('Price a specific offer')
  .requiredOption('--offer-id <id>', 'Offer ID from a search result')
  .option('--adapter <id>', 'Distribution adapter to use', 'amadeus')
  .option('--json', 'Output as JSON')
  .option('--verbose', 'Show confidence and gate details')
  .action(async (opts: {
    offerId: string;
    adapter: string;
    json?: boolean;
    verbose?: boolean;
  }) => {
    if (opts.json) {
      console.log(JSON.stringify({
        status: 'adapter_not_configured',
        message: `Adapter "${opts.adapter}" is not configured. Install and configure the adapter to enable pricing.`,
        offer_id: opts.offerId,
      }, null, 2));
      return;
    }

    console.log('');
    console.log(`  Price offer: ${opts.offerId}`);
    console.log(`  Adapter:     ${opts.adapter}`);
    console.log('');
    console.log(`  Status: adapter "${opts.adapter}" not configured`);
    console.log('  Install and configure the adapter to enable pricing.');
    console.log('');

    if (opts.verbose) {
      console.log('  Pipeline: price -> validate -> confirm');
      console.log('  Agents:   2.1 (Fare Rule) -> 2.2 (Fare Construction) -> 2.3 (Tax Calc)');
      console.log('');
    }
  });
