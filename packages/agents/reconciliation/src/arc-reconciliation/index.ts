/**
 * ARC Reconciliation — Agent 7.2
 *
 * Processes ARC IAR weekly billing, validates commission rates
 * against airline contracts, flags pricing/commission errors,
 * manages ADM/ACM disputes within the 15-day window.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type { ARCReconciliationInput, ARCReconciliationOutput } from './types.js';
import { matchRecords } from './reconciliation-matcher.js';

const DOCUMENT_NUMBER_RE = /^\d{13}$/;
const CARRIER_RE = /^[A-Z0-9]{2}$/;

export class ARCReconciliation implements Agent<ARCReconciliationInput, ARCReconciliationOutput> {
  readonly id = '7.2';
  readonly name = 'ARC Reconciliation';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<ARCReconciliationInput>,
  ): Promise<AgentOutput<ARCReconciliationOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = matchRecords(input.data);

    const warnings: string[] = [];
    if (result.summary.critical_count > 0) {
      warnings.push(`${result.summary.critical_count} critical discrepancies found.`);
    }
    if (result.summary.adm_dispute_expiring_count > 0) {
      warnings.push(
        `${result.summary.adm_dispute_expiring_count} ADM dispute window(s) expiring within 5 days.`,
      );
    }
    if (result.summary.patterns.length > 0) {
      warnings.push(`${result.summary.patterns.length} recurring pattern(s) detected.`);
    }

    return {
      data: result,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        settlement_week: input.data.settlement_week,
        total_agency: result.summary.total_agency_records,
        total_iar: result.summary.total_iar_records,
        matched: result.summary.matched_count,
        discrepancies: result.summary.discrepancy_count,
        net_remittance: result.summary.net_remittance,
        adm_count: result.summary.adm_count,
        acm_count: result.summary.acm_count,
        passed: result.passed,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
  }

  private validateInput(data: ARCReconciliationInput): void {
    if (!data.agency_records || !Array.isArray(data.agency_records)) {
      throw new AgentInputValidationError(
        this.id,
        'agency_records',
        'Must be an array of agency records.',
      );
    }
    if (!data.iar_records || !Array.isArray(data.iar_records)) {
      throw new AgentInputValidationError(
        this.id,
        'iar_records',
        'Must be an array of IAR records.',
      );
    }
    if (!data.settlement_week || data.settlement_week.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'settlement_week', 'Settlement week required.');
    }

    for (const ar of data.agency_records) {
      if (!ar.ticket_number || !DOCUMENT_NUMBER_RE.test(ar.ticket_number)) {
        throw new AgentInputValidationError(
          this.id,
          'agency_records.ticket_number',
          `Invalid ticket number: ${ar.ticket_number ?? 'missing'}`,
        );
      }
      if (!ar.airline_code || !CARRIER_RE.test(ar.airline_code)) {
        throw new AgentInputValidationError(
          this.id,
          'agency_records.airline_code',
          `Invalid airline code: ${ar.airline_code ?? 'missing'}`,
        );
      }
    }

    for (const iar of data.iar_records) {
      if (!iar.document_number || !DOCUMENT_NUMBER_RE.test(iar.document_number)) {
        throw new AgentInputValidationError(
          this.id,
          'iar_records.document_number',
          `Invalid document number: ${iar.document_number ?? 'missing'}`,
        );
      }
    }
  }
}

export { IARParser } from './iar-parser.js';

export type {
  ARCReconciliationInput,
  ARCReconciliationOutput,
  ARCReconciliationSummary,
  IARRecord,
  IARFormat,
  ARCAgencyRecord,
  ARCDiscrepancy,
  ARCDiscrepancyType,
  ARCDiscrepancySeverity,
  ARCPatternDetection,
  AirlineContract,
} from './types.js';
