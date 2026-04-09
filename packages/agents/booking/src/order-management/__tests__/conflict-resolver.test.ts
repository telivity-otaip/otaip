/**
 * Conflict Resolver — Tests
 *
 * Test 4: Late confirmation during refund — THE conflict scenario.
 *
 * Three resolution paths based on BSP reporting status:
 *   Path A: BSP reported → keep refund, void ticket (refund is final)
 *   Path B: BSP not reported + void window open → void refund, keep ticket
 *   Path C: BSP not reported + void window closed → manual intervention
 *
 * Also tests void failure fallback.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictResolver } from '../conflict-resolver.js';
import {
  MockBSPReconciliation,
  MockRefundService,
  MockMonitoring,
  MockADMPrevention,
} from './mocks.js';

let bsp: MockBSPReconciliation;
let refundService: MockRefundService;
let monitoring: MockMonitoring;
let admPrevention: MockADMPrevention;
let resolver: ConflictResolver;

const ORDER_ID = 'ORD-004';
const REFUND_ID = 'REF-004';
const PAYMENT_ID = 'PAY-004';

beforeEach(() => {
  bsp = new MockBSPReconciliation();
  refundService = new MockRefundService();
  monitoring = new MockMonitoring();
  admPrevention = new MockADMPrevention();
  resolver = new ConflictResolver(bsp, refundService, monitoring, admPrevention);
});

// ---------------------------------------------------------------------------
// Path A: BSP reported → keep refund, void ticket
// ---------------------------------------------------------------------------

describe('Test 4 Path A: BSP reported — refund is final, void ticket', () => {
  it('returns KEEP_REFUND_VOID_TICKET when refund is reported to BSP', async () => {
    bsp.setRefundReported(REFUND_ID, true);

    const result = await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(result.action).toBe('KEEP_REFUND_VOID_TICKET');
    expect(result.requires_manual_intervention).toBe(false);
    expect(result.reason).toContain('BSP');
  });

  it('flags ADM risk when refund is BSP-reported', async () => {
    bsp.setRefundReported(REFUND_ID, true);

    await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(admPrevention.calls).toHaveLength(1);
    expect(admPrevention.calls[0].method).toBe('flagADMRisk');
    expect(admPrevention.calls[0].orderId).toBe(ORDER_ID);
  });

  it('alerts monitoring at CRITICAL severity', async () => {
    bsp.setRefundReported(REFUND_ID, true);

    await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(monitoring.alerts).toHaveLength(1);
    expect(monitoring.alerts[0].severity).toBe('CRITICAL');
    expect(monitoring.alerts[0].orderId).toBe(ORDER_ID);
  });

  it('does NOT call void or abort on refund service', async () => {
    bsp.setRefundReported(REFUND_ID, true);

    await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(refundService.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Path B: BSP not reported + void window open → void refund, keep ticket
// ---------------------------------------------------------------------------

describe('Test 4 Path B: Void window open — void refund, keep ticket', () => {
  it('returns VOID_REFUND_KEEP_TICKET when void window is open', async () => {
    bsp.setRefundReported(REFUND_ID, false);
    bsp.setVoidWindowOpen(REFUND_ID, true);
    refundService.voidResult = true;

    const result = await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(result.action).toBe('VOID_REFUND_KEEP_TICKET');
    expect(result.requires_manual_intervention).toBe(false);
    expect(result.reason).toContain('void');
  });

  it('calls voidRefund on refund service', async () => {
    bsp.setRefundReported(REFUND_ID, false);
    bsp.setVoidWindowOpen(REFUND_ID, true);

    await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(refundService.calls).toHaveLength(1);
    expect(refundService.calls[0].method).toBe('voidRefund');
    expect(refundService.calls[0].paymentRecordId).toBe(PAYMENT_ID);
  });

  it('clears ADM risk after successful void', async () => {
    bsp.setRefundReported(REFUND_ID, false);
    bsp.setVoidWindowOpen(REFUND_ID, true);

    await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(admPrevention.calls).toHaveLength(1);
    expect(admPrevention.calls[0].method).toBe('clearADMRisk');
  });

  it('alerts monitoring at WARNING severity', async () => {
    bsp.setRefundReported(REFUND_ID, false);
    bsp.setVoidWindowOpen(REFUND_ID, true);

    await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(monitoring.alerts).toHaveLength(1);
    expect(monitoring.alerts[0].severity).toBe('WARNING');
  });
});

// ---------------------------------------------------------------------------
// Path B failure: void attempt fails → falls through to manual intervention
// ---------------------------------------------------------------------------

describe('Test 4 Path B (void failure): void window open but void fails', () => {
  it('falls through to MANUAL_INTERVENTION when void fails', async () => {
    bsp.setRefundReported(REFUND_ID, false);
    bsp.setVoidWindowOpen(REFUND_ID, true);
    refundService.voidResult = false;

    const result = await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(result.action).toBe('MANUAL_INTERVENTION');
    expect(result.requires_manual_intervention).toBe(true);
  });

  it('flags ADM risk on void failure', async () => {
    bsp.setRefundReported(REFUND_ID, false);
    bsp.setVoidWindowOpen(REFUND_ID, true);
    refundService.voidResult = false;

    await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    const flagCalls = admPrevention.calls.filter((c) => c.method === 'flagADMRisk');
    expect(flagCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Path C: BSP not reported + void window closed → manual intervention
// ---------------------------------------------------------------------------

describe('Test 4 Path C: Void window closed — manual intervention', () => {
  it('returns MANUAL_INTERVENTION when void window is closed', async () => {
    bsp.setRefundReported(REFUND_ID, false);
    bsp.setVoidWindowOpen(REFUND_ID, false);

    const result = await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(result.action).toBe('MANUAL_INTERVENTION');
    expect(result.requires_manual_intervention).toBe(true);
  });

  it('flags ADM risk when manual intervention required', async () => {
    bsp.setRefundReported(REFUND_ID, false);
    bsp.setVoidWindowOpen(REFUND_ID, false);

    await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(admPrevention.calls).toHaveLength(1);
    expect(admPrevention.calls[0].method).toBe('flagADMRisk');
  });

  it('alerts monitoring at CRITICAL severity', async () => {
    bsp.setRefundReported(REFUND_ID, false);
    bsp.setVoidWindowOpen(REFUND_ID, false);

    await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(monitoring.alerts).toHaveLength(1);
    expect(monitoring.alerts[0].severity).toBe('CRITICAL');
  });

  it('does NOT call void or abort on refund service', async () => {
    bsp.setRefundReported(REFUND_ID, false);
    bsp.setVoidWindowOpen(REFUND_ID, false);

    await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(refundService.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Resolution priority: BSP status is checked BEFORE void window
// ---------------------------------------------------------------------------

describe('Conflict resolution priority order', () => {
  it('BSP reported takes priority over open void window', async () => {
    bsp.setRefundReported(REFUND_ID, true);
    bsp.setVoidWindowOpen(REFUND_ID, true); // open but irrelevant — BSP wins

    const result = await resolver.resolveConflict(ORDER_ID, REFUND_ID, PAYMENT_ID);

    expect(result.action).toBe('KEEP_REFUND_VOID_TICKET');
    // void was NOT called because BSP check short-circuits
    expect(refundService.calls).toHaveLength(0);
  });
});
