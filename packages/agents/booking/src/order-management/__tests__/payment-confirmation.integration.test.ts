/**
 * Payment-Confirmation Integration Tests
 *
 * Test 9: Audit trail completeness
 * Full flow integration: state machine + conflict resolver + mocks wired together.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PaymentConfirmationStateMachine } from '../state-machine.js';
import { ConflictResolver } from '../conflict-resolver.js';
import { InvalidStateTransitionError } from '../order-state.js';
import {
  MockAuditService,
  MockMonitoring,
  MockBSPReconciliation,
  MockRefundService,
  MockADMPrevention,
  makeConfirmationRequest,
} from './mocks.js';

let sm: PaymentConfirmationStateMachine;
let audit: MockAuditService;
let monitoring: MockMonitoring;
let bsp: MockBSPReconciliation;
let refundService: MockRefundService;
let admPrevention: MockADMPrevention;
let resolver: ConflictResolver;

beforeEach(() => {
  audit = new MockAuditService();
  monitoring = new MockMonitoring();
  bsp = new MockBSPReconciliation();
  refundService = new MockRefundService();
  admPrevention = new MockADMPrevention();

  sm = new PaymentConfirmationStateMachine({ audit, monitoring });
  resolver = new ConflictResolver(bsp, refundService, monitoring, admPrevention);
});

// ---------------------------------------------------------------------------
// Test 9: Audit trail completeness
// ---------------------------------------------------------------------------

describe('Test 9: Audit trail completeness', () => {
  it('every state transition is recorded in the audit trail', () => {
    sm.initializeOrder('ORD-009', 'PAX-009');
    sm.capturePayment('ORD-009', 'CAP-009');
    sm.initiateConfirmation(
      'ORD-009',
      makeConfirmationRequest({
        idempotency_key: 'k1',
        attempt_number: 1,
        max_attempts: 3,
      }),
    );
    sm.handleConfirmationTimeout('ORD-009');
    sm.retryConfirmation(
      'ORD-009',
      makeConfirmationRequest({
        idempotency_key: 'k2',
        attempt_number: 2,
        max_attempts: 3,
      }),
    );
    sm.handleConfirmationSuccess('ORD-009', 'TKT-009');

    const trail = sm.getAuditTrail('ORD-009');

    // Expected transitions:
    // 1. payment_status: PENDING → CAPTURED
    // 2. confirmation_status: PENDING → AWAITING
    // 3. confirmation_status: AWAITING → TIMEOUT
    // 4. confirmation_status: TIMEOUT → RETRY
    // 5. confirmation_status: RETRY → CONFIRMED
    expect(trail).toHaveLength(5);

    expect(trail[0].field).toBe('payment_status');
    expect(trail[0].from_value).toBe('PENDING');
    expect(trail[0].to_value).toBe('CAPTURED');

    expect(trail[1].field).toBe('confirmation_status');
    expect(trail[1].from_value).toBe('PENDING');
    expect(trail[1].to_value).toBe('AWAITING');

    expect(trail[2].field).toBe('confirmation_status');
    expect(trail[2].from_value).toBe('AWAITING');
    expect(trail[2].to_value).toBe('TIMEOUT');

    expect(trail[3].field).toBe('confirmation_status');
    expect(trail[3].from_value).toBe('TIMEOUT');
    expect(trail[3].to_value).toBe('RETRY');

    expect(trail[4].field).toBe('confirmation_status');
    expect(trail[4].from_value).toBe('RETRY');
    expect(trail[4].to_value).toBe('CONFIRMED');
  });

  it('audit entries are immutable — returned array is a copy', () => {
    sm.initializeOrder('ORD-009b', 'PAX-009b');
    sm.capturePayment('ORD-009b', 'CAP-009b');

    const trail1 = sm.getAuditTrail('ORD-009b');
    const trail2 = sm.getAuditTrail('ORD-009b');

    expect(trail1).not.toBe(trail2);
    expect(trail1).toEqual(trail2);
  });

  it('audit entries include timestamps', () => {
    sm.initializeOrder('ORD-009c', 'PAX-009c');
    sm.capturePayment('ORD-009c', 'CAP-009c');

    const trail = sm.getAuditTrail('ORD-009c');
    expect(trail[0].timestamp).toBeDefined();
    expect(typeof trail[0].timestamp).toBe('string');
    // Timestamp should be parseable as ISO date
    expect(new Date(trail[0].timestamp).toISOString()).toBe(trail[0].timestamp);
  });

  it('audit entries include the trigger', () => {
    sm.initializeOrder('ORD-009d', 'PAX-009d');
    sm.capturePayment('ORD-009d', 'CAP-009d');

    const trail = sm.getAuditTrail('ORD-009d');
    expect(trail[0].trigger).toBe('capturePayment');
  });

  it('audit entries include idempotency key when applicable', () => {
    sm.initializeOrder('ORD-009e', 'PAX-009e');
    sm.capturePayment('ORD-009e', 'CAP-009e');
    sm.initiateConfirmation(
      'ORD-009e',
      makeConfirmationRequest({
        idempotency_key: 'idem-test-key',
      }),
    );

    const trail = sm.getAuditTrail('ORD-009e');
    // capturePayment has no idempotency key
    expect(trail[0].idempotency_key).toBeNull();
    // initiateConfirmation has idempotency key
    expect(trail[1].idempotency_key).toBe('idem-test-key');
  });

  it('state can be reconstructed from audit trail', () => {
    sm.initializeOrder('ORD-009f', 'PAX-009f');
    sm.capturePayment('ORD-009f', 'CAP-009f');
    sm.initiateConfirmation(
      'ORD-009f',
      makeConfirmationRequest({
        idempotency_key: 'kf1',
        attempt_number: 1,
        max_attempts: 1,
      }),
    );
    sm.handleConfirmationTimeout('ORD-009f');
    sm.failConfirmation('ORD-009f');
    sm.initiateRefund('ORD-009f', 'REF-009f');

    const trail = sm.getAuditTrail('ORD-009f');
    const finalState = sm.getState('ORD-009f');

    // Reconstruct state from trail by applying transitions in order
    const reconstructed = {
      payment_status: 'PENDING' as string,
      confirmation_status: 'PENDING' as string,
      reconciliation_status: 'CLEAN' as string,
    };

    for (const entry of trail) {
      reconstructed[entry.field] = entry.to_value;
    }

    expect(reconstructed.payment_status).toBe(finalState.payment_status);
    expect(reconstructed.confirmation_status).toBe(finalState.confirmation_status);
    expect(reconstructed.reconciliation_status).toBe(finalState.reconciliation_status);
  });
});

// ---------------------------------------------------------------------------
// Full flow integration: late confirmation during refund → conflict resolution
// ---------------------------------------------------------------------------

describe('Integration: late confirmation during refund', () => {
  it('detects conflict and resolves via BSP-based logic (Path B: void refund)', async () => {
    // Setup: order goes through failed confirmation → refund
    sm.initializeOrder('ORD-INT-1', 'PAX-INT-1');
    sm.capturePayment('ORD-INT-1', 'CAP-INT-1');
    sm.initiateConfirmation(
      'ORD-INT-1',
      makeConfirmationRequest({
        idempotency_key: 'ki1',
        attempt_number: 1,
        max_attempts: 1,
      }),
    );
    sm.handleConfirmationTimeout('ORD-INT-1');
    sm.failConfirmation('ORD-INT-1');
    sm.initiateRefund('ORD-INT-1', 'REF-INT-1');

    // Late confirmation arrives — triggers conflict
    const conflictState = sm.handleLateConfirmation('ORD-INT-1', 'TKT-LATE-1');
    expect(conflictState.reconciliation_status).toBe('CONFLICT');
    expect(conflictState.confirmation_status).toBe('CONFIRMED');
    expect(conflictState.payment_status).toBe('REFUND_INITIATED');

    // Resolve conflict using BSP-based logic
    bsp.setRefundReported('REF-INT-1', false);
    bsp.setVoidWindowOpen('REF-INT-1', true);

    const resolution = await resolver.resolveConflict('ORD-INT-1', 'REF-INT-1', 'CAP-INT-1');
    expect(resolution.action).toBe('VOID_REFUND_KEEP_TICKET');

    // Apply resolution to state machine
    sm.resolveConflict('ORD-INT-1', resolution);

    const finalState = sm.getState('ORD-INT-1');
    expect(finalState.reconciliation_status).toBe('RESOLVED');
  });

  it('detects conflict and resolves via BSP-based logic (Path A: keep refund)', async () => {
    sm.initializeOrder('ORD-INT-2', 'PAX-INT-2');
    sm.capturePayment('ORD-INT-2', 'CAP-INT-2');
    sm.initiateConfirmation(
      'ORD-INT-2',
      makeConfirmationRequest({
        idempotency_key: 'ki2',
        attempt_number: 1,
        max_attempts: 1,
      }),
    );
    sm.handleConfirmationTimeout('ORD-INT-2');
    sm.failConfirmation('ORD-INT-2');
    sm.initiateRefund('ORD-INT-2', 'REF-INT-2');
    sm.completeRefund('ORD-INT-2');

    // Late confirmation after refund completed
    const conflictState = sm.handleLateConfirmation('ORD-INT-2', 'TKT-LATE-2');
    expect(conflictState.reconciliation_status).toBe('CONFLICT');
    expect(conflictState.payment_status).toBe('REFUNDED');

    // Resolve: BSP reported → keep refund
    bsp.setRefundReported('REF-INT-2', true);

    const resolution = await resolver.resolveConflict('ORD-INT-2', 'REF-INT-2', 'CAP-INT-2');
    expect(resolution.action).toBe('KEEP_REFUND_VOID_TICKET');

    sm.resolveConflict('ORD-INT-2', resolution);

    const finalState = sm.getState('ORD-INT-2');
    expect(finalState.reconciliation_status).toBe('RESOLVED');
    expect(finalState.payment_status).toBe('REFUNDED');
  });

  it('late confirmation on non-refund order throws', () => {
    sm.initializeOrder('ORD-INT-3', 'PAX-INT-3');
    sm.capturePayment('ORD-INT-3', 'CAP-INT-3');
    sm.initiateConfirmation('ORD-INT-3', makeConfirmationRequest({ idempotency_key: 'ki3' }));
    sm.handleConfirmationSuccess('ORD-INT-3', 'TKT-INT-3');

    // No refund in progress — late confirmation makes no sense
    expect(() => sm.handleLateConfirmation('ORD-INT-3', 'TKT-LATE-3')).toThrow(
      InvalidStateTransitionError,
    );
  });
});

// ---------------------------------------------------------------------------
// Full flow: happy path end-to-end with all events
// ---------------------------------------------------------------------------

describe('Integration: full happy path with audit events', () => {
  it('emits no conflict or failure events on happy path', () => {
    sm.initializeOrder('ORD-HAPPY', 'PAX-HAPPY');
    sm.capturePayment('ORD-HAPPY', 'CAP-HAPPY');
    sm.initiateConfirmation(
      'ORD-HAPPY',
      makeConfirmationRequest({
        idempotency_key: 'kh1',
      }),
    );
    sm.handleConfirmationSuccess('ORD-HAPPY', 'TKT-HAPPY');

    // No failure or conflict events should have been emitted
    const failEvents = audit.events.filter(
      (e) =>
        e.event_type === 'ORDER_CONFIRMATION_FAILED' || e.event_type === 'ORDER_CONFLICT_DETECTED',
    );
    expect(failEvents).toHaveLength(0);
  });
});
