#!/usr/bin/env node

/**
 * @otaip/cli — OTAIP Command-Line Interface
 *
 * Provides commands for searching, pricing, booking, listing agents
 * and adapters, and validating pipeline inputs.
 */

import { Command } from 'commander';
import { searchCommand } from './commands/search.js';
import { priceCommand } from './commands/price.js';
import { bookCommand } from './commands/book.js';
import { adaptersCommand } from './commands/adapters.js';
import { agentsCommand } from './commands/agents.js';
import { validateCommand } from './commands/validate.js';

const program = new Command();

program
  .name('otaip')
  .description('OTAIP — Open Travel AI Platform CLI')
  .version('0.3.2.1');

program.addCommand(searchCommand);
program.addCommand(priceCommand);
program.addCommand(bookCommand);
program.addCommand(adaptersCommand);
program.addCommand(agentsCommand);
program.addCommand(validateCommand);

program.parse();
