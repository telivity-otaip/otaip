/**
 * Pipeline contract for TicketIssuance (Agent 4.1).
 *
 * Action type: `mutation_irreversible` — ticketing commits money movement,
 * starts BSP reporting, and cannot be undone (only voided within a narrow
 * same-day window or refunded later). Confidence floor 0.95.
 *
 * The pipeline's action-classifier gate will require an `approvalToken`
 * on the input before allowing execution.
 *
 * Semantic validation:
 *  - issuing_carrier must resolve against airline reference
 *  - Each segment's carrier/origin/destination must resolve
 *  - Each segment's departure_date must not be in the past
 *  - Credit-card payments must carry card_code + card_last_four
 *  - Form of payment currency must equal fare currency (base or equivalent)
 */

import type {
  AgentContract,
  SemanticIssue,
  SemanticValidationResult,
  ValidationContext,
} from '@otaip/core';
import {
  resolveAirlineStrict,
  resolveAirportStrict,
  validateFutureDate,
} from '@otaip/core';
import {
  ticketIssuanceInputSchema,
  ticketIssuanceOutputSchema,
} from './schema.js';

interface TicketInput {
  issuing_carrier: string;
  segments: Array<{
    carrier: string;
    origin: string;
    destination: string;
    departure_date: string;
  }>;
  base_fare_currency: string;
  equivalent_fare_currency?: string;
  form_of_payment: {
    type: 'CASH' | 'CREDIT_CARD' | 'INVOICE' | 'MISCELLANEOUS';
    card_code?: string;
    card_last_four?: string;
    currency: string;
  };
}

async function validate(
  input: unknown,
  ctx: ValidationContext,
): Promise<SemanticValidationResult> {
  const data = input as TicketInput;
  const issues: SemanticIssue[] = [];

  issues.push(
    ...(await resolveAirlineStrict(data.issuing_carrier, ctx.reference, ['issuing_carrier'])),
  );

  for (let i = 0; i < data.segments.length; i++) {
    const seg = data.segments[i];
    if (!seg) continue;
    issues.push(
      ...(await resolveAirportStrict(seg.origin, ctx.reference, [
        'segments',
        i,
        'origin',
      ])),
      ...(await resolveAirportStrict(seg.destination, ctx.reference, [
        'segments',
        i,
        'destination',
      ])),
      ...(await resolveAirlineStrict(seg.carrier, ctx.reference, [
        'segments',
        i,
        'carrier',
      ])),
      ...validateFutureDate(seg.departure_date, ctx.now, [
        'segments',
        i,
        'departure_date',
      ]),
    );
  }

  if (data.form_of_payment.type === 'CREDIT_CARD') {
    if (!data.form_of_payment.card_code || !data.form_of_payment.card_last_four) {
      issues.push({
        code: 'CARD_DETAILS_REQUIRED',
        path: ['form_of_payment'],
        message: 'CREDIT_CARD form of payment requires card_code and card_last_four',
        severity: 'error',
      });
    }
  }

  // Form-of-payment currency must match one of the fare currencies.
  const fareCurrencies = [data.base_fare_currency];
  if (data.equivalent_fare_currency) fareCurrencies.push(data.equivalent_fare_currency);
  if (!fareCurrencies.includes(data.form_of_payment.currency)) {
    issues.push({
      code: 'FOP_CURRENCY_MISMATCH',
      path: ['form_of_payment', 'currency'],
      message: `form_of_payment.currency '${data.form_of_payment.currency}' does not match fare currency (${fareCurrencies.join(' or ')})`,
      severity: 'error',
    });
  }

  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return { ok: false, issues };
  return { ok: true, warnings: issues };
}

export const ticketIssuanceContract: AgentContract<
  typeof ticketIssuanceInputSchema,
  typeof ticketIssuanceOutputSchema
> = {
  agentId: '4.1',
  inputSchema: ticketIssuanceInputSchema,
  outputSchema: ticketIssuanceOutputSchema,
  actionType: 'mutation_irreversible',
  confidenceThreshold: 0.95,
  outputContract: ['total_coupons', 'is_conjunction'],
  validate,
};
