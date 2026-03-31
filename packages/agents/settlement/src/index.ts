/**
 * @otaip/agents-settlement — Stage 6 refund & ADM prevention agents.
 *
 * Re-exports all Stage 6 agent classes.
 */

export { RefundProcessing } from './refund-processing/index.js';
export type {
  RefundProcessingInput,
  RefundProcessingOutput,
  RefundRecord,
  RefundAuditTrail,
  RefundType,
  SettlementSystem,
  CommissionType,
  CommissionData,
  TaxItem,
  CouponRefundItem,
  BspRefundFields,
  ArcRefundFields,
  RefundPenaltyRule,
} from './refund-processing/index.js';

export { ADMPrevention } from './adm-prevention/index.js';
export type {
  ADMPreventionInput,
  ADMPreventionOutput,
  ADMPreventionResult,
  ADMCheck,
  ADMCheckId,
  ADMSeverity,
  BookingRecord,
  BookingSegment,
  DuplicateCheckPnr,
} from './adm-prevention/index.js';
