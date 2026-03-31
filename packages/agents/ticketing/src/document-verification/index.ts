/**
 * Document Verification — Agent 4.5
 *
 * APIS validation, passport validity, visa check (stub for Agent 0.7).
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  AgentHealthStatus,
} from '@otaip/core';
import {
  AgentNotInitializedError,
  AgentInputValidationError,
} from '@otaip/core';
import type { DocumentVerificationInput, DocumentVerificationOutput } from './types.js';
import { verifyDocuments } from './verification-engine.js';

const PASSENGER_NAME_RE = /^[A-Z][A-Z' -]+\/[A-Z][A-Z' -]+$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

export class DocumentVerification
  implements Agent<DocumentVerificationInput, DocumentVerificationOutput>
{
  readonly id = '4.5';
  readonly name = 'Document Verification';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<DocumentVerificationInput>,
  ): Promise<AgentOutput<DocumentVerificationOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = await verifyDocuments(input.data);

    const warnings: string[] = [];
    if (result.blocking_failures > 0) {
      warnings.push(`${result.blocking_failures} blocking failure(s) — document issues must be resolved before travel.`);
    }
    if (result.advisory_warnings > 0) {
      warnings.push(`${result.advisory_warnings} advisory warning(s).`);
    }

    return {
      data: result,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        all_passed: result.all_passed,
        blocking_failures: result.blocking_failures,
        advisory_warnings: result.advisory_warnings,
        passenger_count: input.data.passengers.length,
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

  private validateInput(data: DocumentVerificationInput): void {
    if (!data.passengers || data.passengers.length === 0) {
      throw new AgentInputValidationError(this.id, 'passengers', 'At least one passenger required.');
    }
    if (!data.segments || data.segments.length === 0) {
      throw new AgentInputValidationError(this.id, 'segments', 'At least one travel segment required.');
    }

    for (const pax of data.passengers) {
      if (!pax.ticket_name || !PASSENGER_NAME_RE.test(pax.ticket_name)) {
        throw new AgentInputValidationError(this.id, 'ticket_name', `Invalid name format: ${pax.ticket_name ?? 'missing'}. Must be LAST/FIRST.`);
      }
      if (!pax.passport_number) {
        throw new AgentInputValidationError(this.id, 'passport_number', 'Passport number is required.');
      }
      if (!pax.nationality || !COUNTRY_RE.test(pax.nationality)) {
        throw new AgentInputValidationError(this.id, 'nationality', `Invalid nationality: ${pax.nationality ?? 'missing'}. Must be ISO 2-letter.`);
      }
      if (!pax.passport_expiry) {
        throw new AgentInputValidationError(this.id, 'passport_expiry', 'Passport expiry date is required.');
      }
    }

    for (const seg of data.segments) {
      if (!seg.destination_country || !COUNTRY_RE.test(seg.destination_country)) {
        throw new AgentInputValidationError(this.id, 'destination_country', `Invalid country code: ${seg.destination_country ?? 'missing'}`);
      }
      if (!seg.travel_date) {
        throw new AgentInputValidationError(this.id, 'travel_date', 'Travel date is required.');
      }
    }
  }
}

export type {
  DocumentVerificationInput,
  DocumentVerificationOutput,
  PassengerDocument,
  PassengerVerificationResult,
  DocumentCheck,
  TravelSegment,
  VerificationSeverity,
  VisaRequirement,
  CountryRegulatoryResolver,
} from './types.js';
