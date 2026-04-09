export type CouponNumber = 1 | 2 | 3 | 4;
export type LiftStatus = 'LIFTED' | 'OPEN' | 'VOID' | 'REFUNDED';
export type RevAcctOperation =
  | 'recordLift'
  | 'recognizeRevenue'
  | 'getUpliftReport'
  | 'getDeferredRevenue'
  | 'recordVoid'
  | 'recordRefund';

export interface CouponLiftInput {
  ticketNumber: string;
  couponNumber: CouponNumber;
  flightNumber: string;
  flightDate: string;
  origin: string;
  destination: string;
  passengerName: string;
  cabin: 'F' | 'C' | 'W' | 'Y';
  fareAmount: string;
  currency: string;
  liftedAt: string;
}

export interface LiftRecord {
  liftId: string;
  ticketNumber: string;
  couponNumber: CouponNumber;
  flightNumber: string;
  flightDate: string;
  origin: string;
  destination: string;
  fareAmount: string;
  currency: string;
  status: LiftStatus;
  liftedAt?: string;
  recognizedAt?: string;
}

export interface RevenueRecognitionResult {
  flightRef: string;
  couponsLifted: number;
  totalRevenue: string;
  currency: string;
  recognizedAt: string;
  lineItems: LiftRecord[];
}

export interface UpliftReport {
  period: { from: string; to: string };
  totalCoupons: number;
  totalRevenue: string;
  byRoute: Array<{ route: string; coupons: number; revenue: string }>;
  byCabin: { F: string; C: string; W: string; Y: string };
  averageYield: string;
}

export interface DeferredRevenueReport {
  reportDate: string;
  openCoupons: number;
  deferredAmount: string;
  currency: string;
  byFutureDate: Array<{ date: string; coupons: number; amount: string }>;
}

export interface RevenueAccountingInput {
  operation: RevAcctOperation;
  coupon?: CouponLiftInput;
  flightRef?: string;
  period?: { from: string; to: string };
  ticketNumber?: string;
  refundAmount?: string;
  currentDate?: string;
}
export interface RevenueAccountingOutput {
  lift?: LiftRecord;
  recognition?: RevenueRecognitionResult;
  uplift?: UpliftReport;
  deferred?: DeferredRevenueReport;
  message?: string;
}
