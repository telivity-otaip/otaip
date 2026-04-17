/**
 * CLI command: otaip agents
 *
 * List all OTAIP agents with their contract status.
 */

import { Command } from 'commander';

/** Agent registry — all 71 agents across all stages. */
interface AgentEntry {
  id: string;
  name: string;
  stage: string;
  actionType: string;
  contractStatus: 'active' | 'planned' | 'stub';
}

const AGENTS: AgentEntry[] = [
  // Stage 0 — Reference
  { id: '0.1', name: 'Airport Code Resolver', stage: 'reference', actionType: 'query', contractStatus: 'active' },
  { id: '0.2', name: 'Airline Code Mapper', stage: 'reference', actionType: 'query', contractStatus: 'active' },
  { id: '0.3', name: 'Fare Basis Decoder', stage: 'reference', actionType: 'query', contractStatus: 'active' },
  { id: '0.4', name: 'Equipment Type Resolver', stage: 'reference', actionType: 'query', contractStatus: 'active' },
  { id: '0.5', name: 'Currency Converter', stage: 'reference', actionType: 'query', contractStatus: 'active' },

  // Stage 1 — Search
  { id: '1.1', name: 'Availability Search', stage: 'search', actionType: 'query', contractStatus: 'active' },
  { id: '1.2', name: 'Connection Builder', stage: 'search', actionType: 'query', contractStatus: 'active' },
  { id: '1.3', name: 'Schedule Search', stage: 'search', actionType: 'query', contractStatus: 'active' },
  { id: '1.4', name: 'Low Fare Search', stage: 'search', actionType: 'query', contractStatus: 'active' },
  { id: '1.5', name: 'Seat Map', stage: 'search', actionType: 'query', contractStatus: 'active' },
  { id: '1.6', name: 'Ancillary Catalog', stage: 'search', actionType: 'query', contractStatus: 'active' },

  // Stage 2 — Pricing
  { id: '2.1', name: 'Fare Rule', stage: 'pricing', actionType: 'query', contractStatus: 'active' },
  { id: '2.2', name: 'Fare Construction', stage: 'pricing', actionType: 'query', contractStatus: 'active' },
  { id: '2.3', name: 'Tax Calculation', stage: 'pricing', actionType: 'query', contractStatus: 'active' },
  { id: '2.4', name: 'Offer Builder', stage: 'pricing', actionType: 'query', contractStatus: 'active' },
  { id: '2.5', name: 'Offer Evaluator', stage: 'pricing', actionType: 'query', contractStatus: 'active' },
  { id: '2.6', name: 'Commission Calculator', stage: 'pricing', actionType: 'query', contractStatus: 'active' },
  { id: '2.7', name: 'Markup Engine', stage: 'pricing', actionType: 'query', contractStatus: 'active' },

  // Stage 3 — Booking
  { id: '3.1', name: 'GDS/NDC Router', stage: 'booking', actionType: 'query', contractStatus: 'active' },
  { id: '3.2', name: 'PNR Creation', stage: 'booking', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '3.3', name: 'Payment Processing', stage: 'booking', actionType: 'mutation_irreversible', contractStatus: 'active' },
  { id: '3.4', name: 'SSR Handler', stage: 'booking', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '3.5', name: 'Queue Manager', stage: 'booking', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '3.6', name: 'Order Manager', stage: 'booking', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '3.7', name: 'Booking Validator', stage: 'booking', actionType: 'query', contractStatus: 'active' },
  { id: '3.8', name: 'PNR Retrieval', stage: 'booking', actionType: 'query', contractStatus: 'active' },
  { id: '3.9', name: 'NDC Booking Fallback', stage: 'booking', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '3.10', name: 'Booking Fallback Chain', stage: 'booking', actionType: 'mutation_reversible', contractStatus: 'active' },

  // Stage 4 — Ticketing
  { id: '4.1', name: 'Ticket Issuance', stage: 'ticketing', actionType: 'mutation_irreversible', contractStatus: 'active' },
  { id: '4.2', name: 'EMD Issuance', stage: 'ticketing', actionType: 'mutation_irreversible', contractStatus: 'active' },
  { id: '4.3', name: 'Void Processing', stage: 'ticketing', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '4.4', name: 'Conjunction Ticketing', stage: 'ticketing', actionType: 'mutation_irreversible', contractStatus: 'active' },

  // Stage 5 — Exchange
  { id: '5.1', name: 'Change Management', stage: 'exchange', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '5.2', name: 'Exchange/Reissue', stage: 'exchange', actionType: 'mutation_irreversible', contractStatus: 'active' },
  { id: '5.3', name: 'Involuntary Rebook', stage: 'exchange', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '5.4', name: 'Schedule Change Handler', stage: 'exchange', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '5.5', name: 'Same-Day Change', stage: 'exchange', actionType: 'mutation_reversible', contractStatus: 'active' },

  // Stage 6 — Settlement
  { id: '6.1', name: 'Refund Processing', stage: 'settlement', actionType: 'mutation_irreversible', contractStatus: 'active' },
  { id: '6.2', name: 'ADM Prevention', stage: 'settlement', actionType: 'query', contractStatus: 'active' },
  { id: '6.3', name: 'Loyalty Accrual', stage: 'settlement', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '6.4', name: 'Credit Shell Manager', stage: 'settlement', actionType: 'mutation_reversible', contractStatus: 'active' },

  // Stage 7 — Reconciliation
  { id: '7.1', name: 'BSP Reconciliation', stage: 'reconciliation', actionType: 'query', contractStatus: 'active' },
  { id: '7.2', name: 'ARC Reconciliation', stage: 'reconciliation', actionType: 'query', contractStatus: 'active' },
  { id: '7.3', name: 'Commission Reconciliation', stage: 'reconciliation', actionType: 'query', contractStatus: 'active' },
  { id: '7.4', name: 'Revenue Reporting', stage: 'reconciliation', actionType: 'query', contractStatus: 'active' },

  // Stage 8 — TMC
  { id: '8.1', name: 'Travel Policy', stage: 'tmc', actionType: 'query', contractStatus: 'active' },
  { id: '8.2', name: 'Approval Workflow', stage: 'tmc', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '8.3', name: 'Duty of Care', stage: 'tmc', actionType: 'query', contractStatus: 'active' },
  { id: '8.4', name: 'Profile Manager', stage: 'tmc', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '8.5', name: 'Expense Reporting', stage: 'tmc', actionType: 'query', contractStatus: 'active' },

  // Stage 9 — Platform
  { id: '9.1', name: 'Orchestrator', stage: 'platform', actionType: 'query', contractStatus: 'active' },
  { id: '9.2', name: 'Knowledge', stage: 'platform', actionType: 'query', contractStatus: 'active' },
  { id: '9.3', name: 'Monitoring', stage: 'platform', actionType: 'query', contractStatus: 'active' },
  { id: '9.4', name: 'Audit & Compliance', stage: 'platform', actionType: 'query', contractStatus: 'active' },
  { id: '9.5', name: 'Performance Audit', stage: 'platform', actionType: 'query', contractStatus: 'active' },
  { id: '9.6', name: 'Routing Audit', stage: 'platform', actionType: 'query', contractStatus: 'active' },
  { id: '9.7', name: 'Recommendation', stage: 'platform', actionType: 'query', contractStatus: 'active' },
  { id: '9.8', name: 'Alert', stage: 'platform', actionType: 'query', contractStatus: 'active' },
  { id: '9.9', name: 'Plugin Manager', stage: 'platform', actionType: 'mutation_reversible', contractStatus: 'active' },

  // Stage 20 — Lodging
  { id: '20.1', name: 'Hotel Availability Search', stage: 'lodging', actionType: 'query', contractStatus: 'active' },
  { id: '20.2', name: 'Hotel Rate Shopping', stage: 'lodging', actionType: 'query', contractStatus: 'active' },
  { id: '20.3', name: 'Hotel Booking', stage: 'lodging', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '20.4', name: 'Hotel Confirmation', stage: 'lodging', actionType: 'query', contractStatus: 'active' },
  { id: '20.5', name: 'Hotel Payment', stage: 'lodging', actionType: 'mutation_irreversible', contractStatus: 'active' },
  { id: '20.6', name: 'Hotel Modification & Cancellation', stage: 'lodging', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '20.7', name: 'Hotel Loyalty', stage: 'lodging', actionType: 'mutation_reversible', contractStatus: 'active' },
  { id: '20.8', name: 'Hotel Content', stage: 'lodging', actionType: 'query', contractStatus: 'active' },
  { id: '20.9', name: 'Hotel Policy Engine', stage: 'lodging', actionType: 'query', contractStatus: 'active' },
  { id: '20.10', name: 'Hotel Revenue Manager', stage: 'lodging', actionType: 'query', contractStatus: 'active' },
];

export const agentsCommand = new Command('agents')
  .description('List all OTAIP agents with contract status')
  .option('--json', 'Output as JSON')
  .option('--stage <stage>', 'Filter by stage name')
  .option('--verbose', 'Show action type and additional details')
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
          'Action'.padEnd(14) +
          'Contract',
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
            a.actionType.padEnd(14) +
            a.contractStatus,
        );
      } else {
        console.log(
          '  ' +
            a.id.padEnd(8) +
            a.name.padEnd(32) +
            a.stage.padEnd(16) +
            a.contractStatus,
        );
      }
    }
    console.log('  ' + '-'.repeat(76));
    console.log(`  Total: ${filtered.length} agents`);
    console.log('');
  });
