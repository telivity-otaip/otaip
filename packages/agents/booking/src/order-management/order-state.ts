/**
 * Order State — Payment-to-Confirmation State Model
 *
 * Agent 3.6: Tracks the gap between "payment captured" and "ticket issued"
 * using three independent status fields.
 *
 * Air domain ONLY.
 */

import { AgentError } from '@otaip/core';

// ---------------------------------------------------------------------------
// Status type unions
// ---------------------------------------------------------------------------

export type PaymentStatus =
  | 'PENDING'
  | 'CAPTURED'
  | 'REFUND_INITIATED'
  | 'REFUNDED'
  | 'REFUND_REVERSED';

export type ConfirmationStatus =
  | 'PENDING'
  | 'AWAITING'
  | 'CONFIRMED'
  | 'TIMEOUT'
  | 'RETRY'
  | 'FAILED';

export type ReconciliationStatus =
  | 'CLEAN'
  | 'CONFLICT'
  | 'RESOLVED';

// ---------------------------------------------------------------------------
// Composite state
// ---------------------------------------------------------------------------

export interface OrderState {
  payment_status: PaymentStatus;
  confirmation_status: ConfirmationStatus;
  reconciliation_status: ReconciliationStatus;
}

// ---------------------------------------------------------------------------
// Confirmation request (tracks retries + idempotency)
// ---------------------------------------------------------------------------

export interface ConfirmationRequest {
  idempotency_key: string;
  order_id: string;
  payment_capture_ref: string;
  attempt_number: number;
  max_attempts: number;
  channel: 'GDS' | 'NDC';
}

// ---------------------------------------------------------------------------
// Events emitted on state transitions
// ---------------------------------------------------------------------------

export type OrderStateEventType =
  | 'ORDER_CONFIRMATION_DELAYED'
  | 'ORDER_CONFIRMATION_FAILED'
  | 'ORDER_REFUND_INITIATED'
  | 'ORDER_CONFLICT_DETECTED';

export interface OrderStateEvent {
  event_type: OrderStateEventType;
  order_id: string;
  passenger_ref: string;
  timestamp: string;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Audit trail entry — immutable record of every state transition
// ---------------------------------------------------------------------------

export interface OrderStateAuditEntry {
  timestamp: string;
  field: 'payment_status' | 'confirmation_status' | 'reconciliation_status';
  from_value: string;
  to_value: string;
  trigger: string;
  idempotency_key: string | null;
  order_id: string;
}

// ---------------------------------------------------------------------------
// Valid transition maps
// ---------------------------------------------------------------------------

export const VALID_PAYMENT_TRANSITIONS: Record<PaymentStatus, ReadonlySet<PaymentStatus>> = {
  PENDING: new Set(['CAPTURED']),
  CAPTURED: new Set(['REFUND_INITIATED']),
  REFUND_INITIATED: new Set(['REFUNDED']),
  REFUNDED: new Set(['REFUND_REVERSED']),
  REFUND_REVERSED: new Set([]),
};

export const VALID_CONFIRMATION_TRANSITIONS: Record<ConfirmationStatus, ReadonlySet<ConfirmationStatus>> = {
  PENDING: new Set(['AWAITING']),
  AWAITING: new Set(['CONFIRMED', 'TIMEOUT']),
  TIMEOUT: new Set(['RETRY', 'FAILED']),
  RETRY: new Set(['CONFIRMED', 'TIMEOUT']),
  CONFIRMED: new Set([]),
  FAILED: new Set([]),
};

export const VALID_RECONCILIATION_TRANSITIONS: Record<ReconciliationStatus, ReadonlySet<ReconciliationStatus>> = {
  CLEAN: new Set(['CONFLICT']),
  CONFLICT: new Set(['RESOLVED']),
  RESOLVED: new Set([]),
};

// ---------------------------------------------------------------------------
// Error for invalid transitions
// ---------------------------------------------------------------------------

export class InvalidStateTransitionError extends AgentError {
  constructor(
    agentId: string,
    public readonly field: string,
    public readonly fromValue: string,
    public readonly toValue: string,
  ) {
    super(
      `Invalid state transition for ${field}: ${fromValue} → ${toValue}`,
      agentId,
      'INVALID_STATE_TRANSITION',
    );
    this.name = 'InvalidStateTransitionError';
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createInitialOrderState(): OrderState {
  return {
    payment_status: 'PENDING',
    confirmation_status: 'PENDING',
    reconciliation_status: 'CLEAN',
  };
}

// ---------------------------------------------------------------------------
// Transition validation
// ---------------------------------------------------------------------------

export function validatePaymentTransition(from: PaymentStatus, to: PaymentStatus, agentId: string): void {
  if (!VALID_PAYMENT_TRANSITIONS[from].has(to)) {
    throw new InvalidStateTransitionError(agentId, 'payment_status', from, to);
  }
}

export function validateConfirmationTransition(from: ConfirmationStatus, to: ConfirmationStatus, agentId: string): void {
  if (!VALID_CONFIRMATION_TRANSITIONS[from].has(to)) {
    throw new InvalidStateTransitionError(agentId, 'confirmation_status', from, to);
  }
}

export function validateReconciliationTransition(from: ReconciliationStatus, to: ReconciliationStatus, agentId: string): void {
  if (!VALID_RECONCILIATION_TRANSITIONS[from].has(to)) {
    throw new InvalidStateTransitionError(agentId, 'reconciliation_status', from, to);
  }
}
