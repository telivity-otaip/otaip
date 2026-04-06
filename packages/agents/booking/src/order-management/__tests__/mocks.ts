/**
 * Shared test mocks for payment-to-confirmation state machine tests.
 *
 * All mocks are configurable and track calls for assertion.
 */

import type { OrderStateEvent } from '../order-state.js';
import type { AuditPort, MonitoringPort } from '../state-machine.js';
import type {
  BSPReconciliationPort,
  RefundServicePort,
  ADMPreventionPort,
} from '../conflict-resolver.js';

// ---------------------------------------------------------------------------
// Audit mock (Agent 9.4)
// ---------------------------------------------------------------------------

export class MockAuditService implements AuditPort {
  readonly events: OrderStateEvent[] = [];

  record(event: OrderStateEvent): void {
    this.events.push(event);
  }

  reset(): void {
    this.events.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Monitoring mock (Agent 9.3)
// ---------------------------------------------------------------------------

export interface AlertRecord {
  message: string;
  severity: string;
  orderId: string;
}

export class MockMonitoring implements MonitoringPort {
  readonly alerts: AlertRecord[] = [];

  alert(message: string, severity: string, orderId: string): void {
    this.alerts.push({ message, severity, orderId });
  }

  reset(): void {
    this.alerts.length = 0;
  }
}

// ---------------------------------------------------------------------------
// BSP Reconciliation mock (Agent 7.1)
// ---------------------------------------------------------------------------

export class MockBSPReconciliation implements BSPReconciliationPort {
  private refundReportedMap: Map<string, boolean> = new Map();
  private voidWindowMap: Map<string, boolean> = new Map();

  setRefundReported(refundId: string, reported: boolean): void {
    this.refundReportedMap.set(refundId, reported);
  }

  setVoidWindowOpen(refundId: string, open: boolean): void {
    this.voidWindowMap.set(refundId, open);
  }

  isRefundReportedToBSP(refundId: string): boolean {
    return this.refundReportedMap.get(refundId) ?? false;
  }

  isVoidWindowOpen(refundId: string): boolean {
    return this.voidWindowMap.get(refundId) ?? false;
  }

  reset(): void {
    this.refundReportedMap.clear();
    this.voidWindowMap.clear();
  }
}

// ---------------------------------------------------------------------------
// Refund Service mock (Agent 6.1)
// ---------------------------------------------------------------------------

export interface RefundCallRecord {
  method: 'voidRefund' | 'abortRefund';
  paymentRecordId: string;
}

export class MockRefundService implements RefundServicePort {
  readonly calls: RefundCallRecord[] = [];
  voidResult = true;
  abortResult = true;

  async voidRefund(paymentRecordId: string): Promise<boolean> {
    this.calls.push({ method: 'voidRefund', paymentRecordId });
    return this.voidResult;
  }

  async abortRefund(paymentRecordId: string): Promise<boolean> {
    this.calls.push({ method: 'abortRefund', paymentRecordId });
    return this.abortResult;
  }

  reset(): void {
    this.calls.length = 0;
    this.voidResult = true;
    this.abortResult = true;
  }
}

// ---------------------------------------------------------------------------
// ADM Prevention mock (Agent 6.2)
// ---------------------------------------------------------------------------

export interface ADMCallRecord {
  method: 'flagADMRisk' | 'clearADMRisk';
  orderId: string;
}

export class MockADMPrevention implements ADMPreventionPort {
  readonly calls: ADMCallRecord[] = [];

  flagADMRisk(orderId: string): void {
    this.calls.push({ method: 'flagADMRisk', orderId });
  }

  clearADMRisk(orderId: string): void {
    this.calls.push({ method: 'clearADMRisk', orderId });
  }

  reset(): void {
    this.calls.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Helper: create a confirmation request
// ---------------------------------------------------------------------------

export function makeConfirmationRequest(overrides: {
  idempotency_key?: string;
  order_id?: string;
  payment_capture_ref?: string;
  attempt_number?: number;
  max_attempts?: number;
  channel?: 'GDS' | 'NDC';
} = {}) {
  return {
    idempotency_key: overrides.idempotency_key ?? `idem-${Date.now()}-${Math.random()}`,
    order_id: overrides.order_id ?? 'ORD-001',
    payment_capture_ref: overrides.payment_capture_ref ?? 'CAP-001',
    attempt_number: overrides.attempt_number ?? 1,
    max_attempts: overrides.max_attempts ?? 3,
    channel: overrides.channel ?? 'GDS' as const,
  };
}
