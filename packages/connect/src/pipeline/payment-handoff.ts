/**
 * STUB — Payment link handoff + status polling.
 * Full implementation in a separate build.
 */

import type { BookingStatus } from '../types.js';

export interface PaymentHandoffConfig {
  pollIntervalMs: number;
  maxPollAttempts: number;
}

export interface PaymentHandoffResult {
  paymentLink: string;
  status: BookingStatus;
  completedAt?: string;
}

export class PaymentHandoff {
  constructor(private _config: PaymentHandoffConfig) {}

  async awaitPayment(_bookingId: string): Promise<PaymentHandoffResult> {
    throw new Error('Not implemented — payment handoff is a stub');
  }
}
