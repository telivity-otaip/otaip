/**
 * Order State — Unit Tests
 *
 * Tests for the OrderState model: types, transition maps, validation,
 * initial state factory, and InvalidStateTransitionError.
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialOrderState,
  validatePaymentTransition,
  validateConfirmationTransition,
  validateReconciliationTransition,
  InvalidStateTransitionError,
  VALID_PAYMENT_TRANSITIONS,
  VALID_CONFIRMATION_TRANSITIONS,
  VALID_RECONCILIATION_TRANSITIONS,
} from '../order-state.js';
import type { PaymentStatus, ConfirmationStatus, ReconciliationStatus } from '../order-state.js';

const AGENT_ID = '3.6';

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

describe('createInitialOrderState', () => {
  it('returns the correct initial state', () => {
    const state = createInitialOrderState();
    expect(state.payment_status).toBe('PENDING');
    expect(state.confirmation_status).toBe('PENDING');
    expect(state.reconciliation_status).toBe('CLEAN');
  });

  it('returns a new object each time', () => {
    const a = createInitialOrderState();
    const b = createInitialOrderState();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Payment status transitions
// ---------------------------------------------------------------------------

describe('Payment status transitions', () => {
  const validPaths: Array<[PaymentStatus, PaymentStatus]> = [
    ['PENDING', 'CAPTURED'],
    ['CAPTURED', 'REFUND_INITIATED'],
    ['REFUND_INITIATED', 'REFUNDED'],
    ['REFUNDED', 'REFUND_REVERSED'],
  ];

  it.each(validPaths)('%s → %s is valid', (from, to) => {
    expect(() => validatePaymentTransition(from, to, AGENT_ID)).not.toThrow();
  });

  const invalidPaths: Array<[PaymentStatus, PaymentStatus]> = [
    ['PENDING', 'REFUND_INITIATED'],
    ['PENDING', 'REFUNDED'],
    ['CAPTURED', 'PENDING'],
    ['CAPTURED', 'REFUNDED'],
    ['REFUND_INITIATED', 'CAPTURED'],
    ['REFUNDED', 'PENDING'],
    ['REFUND_REVERSED', 'PENDING'],
    ['REFUND_REVERSED', 'CAPTURED'],
  ];

  it.each(invalidPaths)('%s → %s throws InvalidStateTransitionError', (from, to) => {
    expect(() => validatePaymentTransition(from, to, AGENT_ID)).toThrow(InvalidStateTransitionError);
  });

  it('self-transitions are invalid', () => {
    const statuses: PaymentStatus[] = ['PENDING', 'CAPTURED', 'REFUND_INITIATED', 'REFUNDED', 'REFUND_REVERSED'];
    for (const s of statuses) {
      expect(() => validatePaymentTransition(s, s, AGENT_ID)).toThrow(InvalidStateTransitionError);
    }
  });
});

// ---------------------------------------------------------------------------
// Confirmation status transitions
// ---------------------------------------------------------------------------

describe('Confirmation status transitions', () => {
  const validPaths: Array<[ConfirmationStatus, ConfirmationStatus]> = [
    ['PENDING', 'AWAITING'],
    ['AWAITING', 'CONFIRMED'],
    ['AWAITING', 'TIMEOUT'],
    ['TIMEOUT', 'RETRY'],
    ['TIMEOUT', 'FAILED'],
    ['RETRY', 'CONFIRMED'],
    ['RETRY', 'TIMEOUT'],
  ];

  it.each(validPaths)('%s → %s is valid', (from, to) => {
    expect(() => validateConfirmationTransition(from, to, AGENT_ID)).not.toThrow();
  });

  const invalidPaths: Array<[ConfirmationStatus, ConfirmationStatus]> = [
    ['PENDING', 'CONFIRMED'],
    ['PENDING', 'TIMEOUT'],
    ['PENDING', 'FAILED'],
    ['AWAITING', 'RETRY'],
    ['AWAITING', 'FAILED'],
    ['TIMEOUT', 'AWAITING'],
    ['CONFIRMED', 'PENDING'],
    ['CONFIRMED', 'FAILED'],
    ['FAILED', 'PENDING'],
    ['FAILED', 'RETRY'],
  ];

  it.each(invalidPaths)('%s → %s throws InvalidStateTransitionError', (from, to) => {
    expect(() => validateConfirmationTransition(from, to, AGENT_ID)).toThrow(InvalidStateTransitionError);
  });

  it('CONFIRMED and FAILED are terminal states', () => {
    const allStatuses: ConfirmationStatus[] = ['PENDING', 'AWAITING', 'CONFIRMED', 'TIMEOUT', 'RETRY', 'FAILED'];
    for (const to of allStatuses) {
      expect(() => validateConfirmationTransition('CONFIRMED', to, AGENT_ID)).toThrow(InvalidStateTransitionError);
      expect(() => validateConfirmationTransition('FAILED', to, AGENT_ID)).toThrow(InvalidStateTransitionError);
    }
  });
});

// ---------------------------------------------------------------------------
// Reconciliation status transitions
// ---------------------------------------------------------------------------

describe('Reconciliation status transitions', () => {
  it('CLEAN → CONFLICT is valid', () => {
    expect(() => validateReconciliationTransition('CLEAN', 'CONFLICT', AGENT_ID)).not.toThrow();
  });

  it('CONFLICT → RESOLVED is valid', () => {
    expect(() => validateReconciliationTransition('CONFLICT', 'RESOLVED', AGENT_ID)).not.toThrow();
  });

  it('RESOLVED is terminal', () => {
    const all: ReconciliationStatus[] = ['CLEAN', 'CONFLICT', 'RESOLVED'];
    for (const to of all) {
      expect(() => validateReconciliationTransition('RESOLVED', to, AGENT_ID)).toThrow(InvalidStateTransitionError);
    }
  });

  it('CLEAN → RESOLVED is invalid (must go through CONFLICT)', () => {
    expect(() => validateReconciliationTransition('CLEAN', 'RESOLVED', AGENT_ID)).toThrow(InvalidStateTransitionError);
  });
});

// ---------------------------------------------------------------------------
// InvalidStateTransitionError
// ---------------------------------------------------------------------------

describe('InvalidStateTransitionError', () => {
  it('includes field, fromValue, and toValue', () => {
    const err = new InvalidStateTransitionError(AGENT_ID, 'payment_status', 'PENDING', 'REFUNDED');
    expect(err.field).toBe('payment_status');
    expect(err.fromValue).toBe('PENDING');
    expect(err.toValue).toBe('REFUNDED');
    expect(err.agentId).toBe(AGENT_ID);
    expect(err.code).toBe('INVALID_STATE_TRANSITION');
    expect(err.name).toBe('InvalidStateTransitionError');
    expect(err.message).toContain('PENDING');
    expect(err.message).toContain('REFUNDED');
  });

  it('is an instance of Error', () => {
    const err = new InvalidStateTransitionError(AGENT_ID, 'payment_status', 'PENDING', 'REFUNDED');
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// Transition map completeness
// ---------------------------------------------------------------------------

describe('Transition map completeness', () => {
  it('every PaymentStatus has a transition entry', () => {
    const allStatuses: PaymentStatus[] = ['PENDING', 'CAPTURED', 'REFUND_INITIATED', 'REFUNDED', 'REFUND_REVERSED'];
    for (const s of allStatuses) {
      expect(VALID_PAYMENT_TRANSITIONS[s]).toBeDefined();
    }
  });

  it('every ConfirmationStatus has a transition entry', () => {
    const allStatuses: ConfirmationStatus[] = ['PENDING', 'AWAITING', 'CONFIRMED', 'TIMEOUT', 'RETRY', 'FAILED'];
    for (const s of allStatuses) {
      expect(VALID_CONFIRMATION_TRANSITIONS[s]).toBeDefined();
    }
  });

  it('every ReconciliationStatus has a transition entry', () => {
    const allStatuses: ReconciliationStatus[] = ['CLEAN', 'CONFLICT', 'RESOLVED'];
    for (const s of allStatuses) {
      expect(VALID_RECONCILIATION_TRANSITIONS[s]).toBeDefined();
    }
  });
});
