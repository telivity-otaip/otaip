/**
 * Void Agent — Types
 *
 * Agent 4.3: Ticket/EMD void processing.
 */

import type { CouponStatus } from '../ticket-issuance/types.js';

export type VoidSettlementSystem = 'BSP' | 'ARC';

export interface VoidCouponInput {
  /** Coupon number */
  coupon_number: number;
  /** Current coupon status */
  status: CouponStatus;
}

export interface CarrierVoidWindow {
  /** 2-letter IATA carrier code */
  carrier_code: string;
  /** Void window in hours from issuance (0 = no void allowed) */
  void_window_hours: number;
  /** Notes about carrier void policy */
  notes: string;
}

export interface VoidAgentInput {
  /** Ticket or EMD number (13-digit) */
  document_number: string;
  /** Issuing carrier */
  issuing_carrier: string;
  /** Document coupon statuses */
  coupons: VoidCouponInput[];
  /** Ticket issue date/time (ISO) */
  issue_datetime: string;
  /** Current date/time for void window check (ISO — defaults to now) */
  current_datetime?: string;
  /** Settlement system */
  settlement_system?: VoidSettlementSystem;
  /** BSP cut-off time (HH:MM in local time, e.g. "23:59") */
  bsp_cutoff_time?: string;
}

export type VoidRejectionReason =
  | 'COUPON_NOT_OPEN'
  | 'VOID_WINDOW_EXPIRED'
  | 'BSP_CUTOFF_PASSED'
  | 'ARC_CUTOFF_PASSED'
  | 'NO_VOID_ALLOWED'
  | 'UNKNOWN_CARRIER';

export interface VoidResult {
  /** Whether void is permitted */
  permitted: boolean;
  /** Document number */
  document_number: string;
  /** Rejection reason (if not permitted) */
  rejection_reason?: VoidRejectionReason;
  /** Human-readable explanation */
  message: string;
  /** Void window info */
  void_window_hours?: number;
  /** Hours remaining in void window (negative if expired) */
  hours_remaining?: number;
  /** Updated coupon statuses (all V if permitted) */
  updated_coupons?: Array<{
    coupon_number: number;
    status: CouponStatus;
  }>;
}

export interface VoidAgentOutput {
  /** Void result */
  result: VoidResult;
}

export type { CouponStatus } from '../ticket-issuance/types.js';
