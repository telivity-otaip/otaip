/**
 * EMD Management — Types
 *
 * Agent 4.2: Electronic Miscellaneous Document issuance.
 */

import type { CouponStatus } from '../ticket-issuance/types.js';

export type EmdType = 'EMD-A' | 'EMD-S';

/** IATA Reason For Issuance Code */
export type RficCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export const RFIC_DESCRIPTIONS: Record<RficCode, string> = {
  A: 'Air transportation',
  B: 'Surface transportation',
  C: 'Excess baggage',
  D: 'Financial impact',
  E: 'Airport services',
  F: 'Merchandise',
  G: 'In-flight services',
};

export interface EmdCoupon {
  /** Coupon number (1-4) */
  coupon_number: number;
  /** RFIC code */
  rfic: RficCode;
  /** RFISC — carrier-specific, stored as passthrough */
  rfisc?: string;
  /** Service description */
  description: string;
  /** Coupon amount (decimal string) */
  amount: string;
  /** Currency */
  currency: string;
  /** Coupon status */
  status: CouponStatus;
  /** For EMD-A: linked ticket number */
  associated_ticket_number?: string;
  /** For EMD-A: linked coupon number on the ticket */
  associated_coupon_number?: number;
}

export interface EmdRecord {
  /** 13-digit EMD number */
  emd_number: string;
  /** EMD type */
  emd_type: EmdType;
  /** Record locator */
  record_locator: string;
  /** Issuing carrier */
  issuing_carrier: string;
  /** Issue date (ISO) */
  issue_date: string;
  /** Passenger name (LAST/FIRST) */
  passenger_name: string;
  /** EMD coupons */
  coupons: EmdCoupon[];
  /** Total amount (decimal string) */
  total_amount: string;
  /** Currency */
  currency: string;
  /** Related ticket number (for EMD-A) */
  related_ticket_number?: string;
}

export interface EmdManagementInput {
  /** EMD type to issue */
  emd_type: EmdType;
  /** Record locator */
  record_locator: string;
  /** Issuing carrier */
  issuing_carrier: string;
  /** Passenger name (LAST/FIRST) */
  passenger_name: string;
  /** Services to issue EMD coupons for */
  services: Array<{
    rfic: RficCode;
    rfisc?: string;
    description: string;
    amount: string;
    currency: string;
    /** For EMD-A: associated ticket number */
    associated_ticket_number?: string;
    /** For EMD-A: associated coupon number */
    associated_coupon_number?: number;
  }>;
  /** Issue date override (ISO) */
  issue_date?: string;
  /** EMD number prefix (3-digit) */
  emd_number_prefix?: string;
  /** Related ticket number for the entire EMD-A */
  related_ticket_number?: string;
}

export interface EmdManagementOutput {
  /** Issued EMD record */
  emd: EmdRecord;
  /** Number of coupons issued */
  coupon_count: number;
}

export type { CouponStatus } from '../ticket-issuance/types.js';
