import Decimal from 'decimal.js';
import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  RevenueAccountingInput,
  RevenueAccountingOutput,
  LiftRecord,
  CouponLiftInput,
  RevenueRecognitionResult,
  UpliftReport,
  DeferredRevenueReport,
} from './types.js';

let nextId = 0;
function uuid(): string {
  return `LFT${String(++nextId).padStart(8, '0')}`;
}

export class RevenueAccountingAgent implements Agent<
  RevenueAccountingInput,
  RevenueAccountingOutput
> {
  readonly id = '7.6';
  readonly name = 'Revenue Accounting';
  readonly version = '0.1.0';
  private initialized = false;
  // key: ticketNumber-couponNumber
  private store = new Map<string, LiftRecord>();

  getStore(): Map<string, LiftRecord> {
    return this.store;
  }
  async initialize(): Promise<void> {
    this.initialized = true;
  }

  private couponKey(ticket: string, coupon: number): string {
    return `${ticket}-${coupon}`;
  }

  async execute(
    input: AgentInput<RevenueAccountingInput>,
  ): Promise<AgentOutput<RevenueAccountingOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);
    const d = input.data;
    switch (d.operation) {
      case 'recordLift':
        return this.recordLift(d.coupon!);
      case 'recognizeRevenue':
        return this.recognizeRevenue(d.flightRef!);
      case 'getUpliftReport':
        return this.upliftReport(d.period!);
      case 'getDeferredRevenue':
        return this.deferredRevenue(d.currentDate ?? new Date().toISOString().slice(0, 10));
      case 'recordVoid':
        return this.recordVoid(d.ticketNumber!);
      case 'recordRefund':
        return this.recordRefund(d.ticketNumber!, d.refundAmount!);
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Invalid.');
    }
  }

  private recordLift(c: CouponLiftInput): AgentOutput<RevenueAccountingOutput> {
    const key = this.couponKey(c.ticketNumber, c.couponNumber);
    const existing = this.store.get(key);
    if (existing) {
      if (existing.status === 'LIFTED')
        throw new AgentInputValidationError(this.id, 'coupon', 'COUPON_ALREADY_LIFTED');
      if (existing.status === 'VOID')
        throw new AgentInputValidationError(this.id, 'coupon', 'COUPON_VOIDED');
      if (existing.status === 'REFUNDED')
        throw new AgentInputValidationError(this.id, 'coupon', 'COUPON_REFUNDED');
    }

    const lift: LiftRecord = {
      liftId: uuid(),
      ticketNumber: c.ticketNumber,
      couponNumber: c.couponNumber,
      flightNumber: c.flightNumber,
      flightDate: c.flightDate,
      origin: c.origin,
      destination: c.destination,
      fareAmount: c.fareAmount,
      currency: c.currency,
      status: 'LIFTED',
      liftedAt: c.liftedAt,
    };
    this.store.set(key, lift);
    return { data: { lift }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private recognizeRevenue(flightRef: string): AgentOutput<RevenueAccountingOutput> {
    // flightRef format: "flightNumber-flightDate"
    const now = new Date().toISOString();
    const lineItems: LiftRecord[] = [];
    for (const r of this.store.values()) {
      if (`${r.flightNumber}-${r.flightDate}` === flightRef && r.status === 'LIFTED') {
        r.recognizedAt = now;
        lineItems.push(r);
      }
    }
    const total = lineItems.reduce((s, r) => s.plus(new Decimal(r.fareAmount)), new Decimal(0));
    const result: RevenueRecognitionResult = {
      flightRef,
      couponsLifted: lineItems.length,
      totalRevenue: total.toFixed(2),
      currency: lineItems[0]?.currency ?? 'USD',
      recognizedAt: now,
      lineItems,
    };
    return { data: { recognition: result }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private upliftReport(period: { from: string; to: string }): AgentOutput<RevenueAccountingOutput> {
    const lifted = [...this.store.values()].filter(
      (r) => r.status === 'LIFTED' && r.flightDate >= period.from && r.flightDate <= period.to,
    );

    const routeMap = new Map<string, { coupons: number; revenue: Decimal }>();
    const cabinMap: Record<string, Decimal> = {
      F: new Decimal(0),
      C: new Decimal(0),
      W: new Decimal(0),
      Y: new Decimal(0),
    };

    for (const r of lifted) {
      const route = `${r.origin}-${r.destination}`;
      const entry = routeMap.get(route) ?? { coupons: 0, revenue: new Decimal(0) };
      entry.coupons++;
      entry.revenue = entry.revenue.plus(r.fareAmount);
      routeMap.set(route, entry);
      // Infer cabin from first char of fare — simplified, actual cabin stored on record would be better
      // Since LiftRecord doesn't store cabin directly after lift, we skip cabin breakdown in this simplified version
    }

    const totalRev = lifted.reduce((s, r) => s.plus(new Decimal(r.fareAmount)), new Decimal(0));
    const avgYield = lifted.length > 0 ? totalRev.dividedBy(lifted.length) : new Decimal(0);

    const report: UpliftReport = {
      period,
      totalCoupons: lifted.length,
      totalRevenue: totalRev.toFixed(2),
      byRoute: [...routeMap.entries()].map(([route, d]) => ({
        route,
        coupons: d.coupons,
        revenue: d.revenue.toFixed(2),
      })),
      byCabin: {
        F: cabinMap['F']!.toFixed(2),
        C: cabinMap['C']!.toFixed(2),
        W: cabinMap['W']!.toFixed(2),
        Y: cabinMap['Y']!.toFixed(2),
      },
      averageYield: avgYield.toFixed(2),
    };
    return { data: { uplift: report }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private deferredRevenue(currentDate: string): AgentOutput<RevenueAccountingOutput> {
    const open = [...this.store.values()].filter((r) => r.status === 'OPEN');
    const total = open.reduce((s, r) => s.plus(new Decimal(r.fareAmount)), new Decimal(0));

    const dateMap = new Map<string, { coupons: number; amount: Decimal }>();
    for (const r of open) {
      const entry = dateMap.get(r.flightDate) ?? { coupons: 0, amount: new Decimal(0) };
      entry.coupons++;
      entry.amount = entry.amount.plus(r.fareAmount);
      dateMap.set(r.flightDate, entry);
    }

    const report: DeferredRevenueReport = {
      reportDate: currentDate,
      openCoupons: open.length,
      deferredAmount: total.toFixed(2),
      currency: 'USD',
      byFutureDate: [...dateMap.entries()]
        .sort()
        .map(([date, d]) => ({ date, coupons: d.coupons, amount: d.amount.toFixed(2) })),
    };
    return { data: { deferred: report }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private recordVoid(ticketNumber: string): AgentOutput<RevenueAccountingOutput> {
    let voided = 0;
    for (const r of this.store.values()) {
      if (r.ticketNumber === ticketNumber) {
        r.status = 'VOID';
        voided++;
      }
    }
    if (voided === 0)
      throw new AgentInputValidationError(this.id, 'ticketNumber', 'COUPON_NOT_FOUND');
    return {
      data: { message: `${voided} coupon(s) voided.` },
      confidence: 1.0,
      metadata: { agent_id: this.id },
    };
  }

  private recordRefund(
    ticketNumber: string,
    _refundAmount: string,
  ): AgentOutput<RevenueAccountingOutput> {
    let refunded = 0;
    for (const r of this.store.values()) {
      if (r.ticketNumber === ticketNumber) {
        r.status = 'REFUNDED';
        refunded++;
      }
    }
    if (refunded === 0)
      throw new AgentInputValidationError(this.id, 'ticketNumber', 'COUPON_NOT_FOUND');
    return {
      data: { message: `${refunded} coupon(s) refunded.` },
      confidence: 1.0,
      metadata: { agent_id: this.id },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    return this.initialized
      ? { status: 'healthy' }
      : { status: 'unhealthy', details: 'Not initialized.' };
  }
  destroy(): void {
    this.initialized = false;
    this.store.clear();
  }
}

export type {
  RevenueAccountingInput,
  RevenueAccountingOutput,
  LiftRecord,
  CouponLiftInput,
  RevenueRecognitionResult,
  UpliftReport,
  DeferredRevenueReport,
  CouponNumber,
  LiftStatus,
  RevAcctOperation,
} from './types.js';
