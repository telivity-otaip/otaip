/**
 * Conflict Resolver — BSP-Based Resolution for Late Confirmations
 *
 * Agent 3.6: When a ticket confirmation arrives while a refund is in progress,
 * the resolution path is determined by BSP reporting status.
 *
 * Priority order (domain rule, NOT a judgment call):
 *   1. BSP reporting status (is the refund already reported?)
 *   2. Void window (can the refund be voided before settlement?)
 *   3. Manual intervention (neither option available)
 *
 * Air domain ONLY.
 */

import type { ConflictResolution, ConflictResolutionAction, MonitoringPort } from './state-machine.js';

// ---------------------------------------------------------------------------
// Port interfaces — injected, not hard-wired to specific agents
// ---------------------------------------------------------------------------

/**
 * BSP Reconciliation service (Agent 7.1 contract).
 */
export interface BSPReconciliationPort {
  isRefundReportedToBSP(refundId: string): boolean;
  isVoidWindowOpen(refundId: string): boolean;
}

/**
 * Refund service (Agent 6.1 contract).
 */
export interface RefundServicePort {
  voidRefund(paymentRecordId: string): Promise<boolean>;
  abortRefund(paymentRecordId: string): Promise<boolean>;
}

/**
 * ADM Prevention service (Agent 6.2 contract).
 */
export interface ADMPreventionPort {
  flagADMRisk(orderId: string): void;
  clearADMRisk(orderId: string): void;
}

// ---------------------------------------------------------------------------
// Conflict Resolver
// ---------------------------------------------------------------------------

export class ConflictResolver {
  constructor(
    private readonly bspReconciliation: BSPReconciliationPort,
    private readonly refundService: RefundServicePort,
    private readonly monitoring: MonitoringPort,
    private readonly admPrevention: ADMPreventionPort,
  ) {}

  /**
   * Resolves a conflict where a ticket confirmation arrived while a refund
   * is in progress or completed.
   *
   * Domain rule: BSP reporting status determines the path.
   *   - If refund is reported to BSP → irreversible. Keep refund, void ticket.
   *   - If refund is NOT reported AND void window is open → void refund, keep ticket.
   *   - If refund is NOT reported AND void window is closed → manual intervention.
   */
  async resolveConflict(
    orderId: string,
    refundId: string,
    paymentRecordId: string,
  ): Promise<ConflictResolution> {
    // Step 1: Check BSP reporting status (highest priority)
    const isReportedToBSP = this.bspReconciliation.isRefundReportedToBSP(refundId);

    if (isReportedToBSP) {
      // Refund is final — once reported to BSP, it is irreversible.
      // The ticket must be voided. This is a system rule.
      this.admPrevention.flagADMRisk(orderId);

      this.monitoring.alert(
        `Late confirmation for order ${orderId}: refund already reported to BSP. Ticket must be voided.`,
        'CRITICAL',
        orderId,
      );

      return {
        action: 'KEEP_REFUND_VOID_TICKET',
        reason: 'Refund already reported to BSP — irreversible. Ticket must be voided to prevent ADM.',
        requires_manual_intervention: false,
      };
    }

    // Step 2: Check void window (refund not yet reported)
    const isVoidOpen = this.bspReconciliation.isVoidWindowOpen(refundId);

    if (isVoidOpen) {
      // Void erases before settlement — different from refund.
      const voidSuccess = await this.refundService.voidRefund(paymentRecordId);

      if (voidSuccess) {
        this.admPrevention.clearADMRisk(orderId);

        this.monitoring.alert(
          `Late confirmation for order ${orderId}: refund voided successfully. Keeping ticket.`,
          'WARNING',
          orderId,
        );

        return {
          action: 'VOID_REFUND_KEEP_TICKET',
          reason: 'Refund voided within same-day void window. Ticket retained.',
          requires_manual_intervention: false,
        };
      }

      // Void failed — fall through to manual intervention
      this.monitoring.alert(
        `Late confirmation for order ${orderId}: void attempt failed despite window being open.`,
        'CRITICAL',
        orderId,
      );
    }

    // Step 3: Manual intervention required
    this.admPrevention.flagADMRisk(orderId);

    this.monitoring.alert(
      `Late confirmation for order ${orderId}: void window closed, refund not yet reported. Manual intervention required.`,
      'CRITICAL',
      orderId,
    );

    return {
      action: 'MANUAL_INTERVENTION',
      reason: 'Void window closed and refund not yet settled. Requires manual resolution.',
      requires_manual_intervention: true,
    };
  }
}
