/**
 * Payment Service — Stripe-mode tests.
 *
 * Injects a mock Stripe-shaped object that satisfies `StripeLike` so
 * we can exercise the paths that create and confirm a PaymentIntent
 * without hitting the real Stripe API. The existing booking tests
 * continue to cover the mock-mode (no-Stripe) path unchanged.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockOtaAdapter } from '../mock-ota-adapter.js';
import {
  PaymentService,
  PaymentError,
  type StripeLike,
  type StripePaymentIntent,
} from '../services/payment-service.js';

// ---------------------------------------------------------------------------
// Mock Stripe client — only the surface PaymentService uses.
// ---------------------------------------------------------------------------

interface MockStripeOptions {
  /** Status the confirmed intent should return. Default 'succeeded'. */
  confirmStatus?: StripePaymentIntent['status'];
  /** Error message for last_payment_error on non-success. */
  failureMessage?: string;
}

function makeMockStripe(options: MockStripeOptions = {}) {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  let counter = 0;
  const intents = new Map<string, StripePaymentIntent>();

  const client: StripeLike = {
    paymentIntents: {
      create: async (params) => {
        calls.push({ fn: 'create', args: [params] });
        counter++;
        const id = `pi_test_${counter}`;
        const intent: StripePaymentIntent = {
          id,
          status: 'requires_payment_method',
          client_secret: `${id}_secret_abc`,
          amount: params.amount,
          currency: params.currency,
        };
        intents.set(id, intent);
        return intent;
      },
      confirm: async (id, params) => {
        calls.push({ fn: 'confirm', args: [id, params] });
        const existing = intents.get(id);
        if (!existing) throw new Error(`intent not found: ${id}`);
        const status = options.confirmStatus ?? 'succeeded';
        const updated: StripePaymentIntent = {
          ...existing,
          status,
          ...(status !== 'succeeded' && options.failureMessage
            ? { last_payment_error: { message: options.failureMessage } }
            : {}),
        };
        intents.set(id, updated);
        return updated;
      },
      retrieve: async (id) => {
        calls.push({ fn: 'retrieve', args: [id] });
        const existing = intents.get(id);
        if (!existing) throw new Error(`intent not found: ${id}`);
        return existing;
      },
    },
  };

  return { client, calls, intents };
}

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

async function seedBooking(adapter: MockOtaAdapter): Promise<string> {
  const booked = await adapter.book({
    offerId: 'offer-stripe-1',
    passengers: [
      {
        title: 'mr',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        gender: 'male',
      },
    ],
    contactEmail: 'j@d.test',
    contactPhone: '+15551234567',
  });
  adapter.updateBookingPrice(booked.bookingReference, '250.00', 'USD');
  return booked.bookingReference;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaymentService — Stripe mode', () => {
  let adapter: MockOtaAdapter;

  beforeEach(() => {
    adapter = new MockOtaAdapter();
  });

  it('usesStripe flag flips based on constructor input', () => {
    const mockMode = new PaymentService(adapter);
    expect(mockMode.usesStripe).toBe(false);

    const { client } = makeMockStripe();
    const stripeMode = new PaymentService(adapter, { stripe: client });
    expect(stripeMode.usesStripe).toBe(true);
  });

  it('createIntent returns client_secret and stores intent id on booking (Stripe mode)', async () => {
    const { client, calls } = makeMockStripe();
    const service = new PaymentService(adapter, { stripe: client });
    const ref = await seedBooking(adapter);

    const result = await service.createIntent(ref);
    expect(result.clientSecret).toMatch(/_secret_/);
    expect(result.paymentIntentId).toMatch(/^pi_test_/);

    // Correct amount: $250.00 → 25000 minor units for USD
    expect(calls[0]!.args[0]).toMatchObject({
      amount: 25000,
      currency: 'usd',
      metadata: { booking_reference: ref },
    });

    // Adapter recorded the intent ID
    const booking = await adapter.getBooking(ref);
    expect(booking!.paymentIntentId).toBe(result.paymentIntentId);
  });

  it('createIntent is a no-op in mock mode', async () => {
    const service = new PaymentService(adapter);
    const ref = await seedBooking(adapter);
    const result = await service.createIntent(ref);
    expect(result.clientSecret).toBeNull();
    expect(result.paymentIntentId).toBeNull();
  });

  it('processPayment confirms the existing PaymentIntent and returns succeeded', async () => {
    const { client, calls } = makeMockStripe({ confirmStatus: 'succeeded' });
    const service = new PaymentService(adapter, { stripe: client });
    const ref = await seedBooking(adapter);

    const created = await service.createIntent(ref);
    const result = await service.processPayment(ref, 'pm_card_visa');

    expect(result.status).toBe('succeeded');
    expect(result.paymentId).toBe(`pay_stripe_${created.paymentIntentId}`);
    expect(result.amount).toBe('250.00');
    expect(result.currency).toBe('USD');

    // Order of calls: create + confirm
    expect(calls.map((c) => c.fn)).toEqual(['create', 'confirm']);
    expect(calls[1]!.args[1]).toEqual({ payment_method: 'pm_card_visa' });
  });

  it('throws PaymentError when Stripe intent is declined', async () => {
    const { client } = makeMockStripe({
      confirmStatus: 'requires_payment_method',
      failureMessage: 'Your card was declined.',
    });
    const service = new PaymentService(adapter, { stripe: client });
    const ref = await seedBooking(adapter);
    await service.createIntent(ref);

    await expect(service.processPayment(ref, 'pm_card_declined')).rejects.toThrow(
      /Your card was declined/,
    );
  });

  it('creates-and-confirms when processPayment is called without a prior intent', async () => {
    const { client, calls } = makeMockStripe({ confirmStatus: 'succeeded' });
    const service = new PaymentService(adapter, { stripe: client });
    const ref = await seedBooking(adapter);

    const result = await service.processPayment(ref, 'pm_card_visa');
    expect(result.status).toBe('succeeded');
    expect(calls.map((c) => c.fn)).toEqual(['create', 'confirm']);
  });

  it('JPY (zero-decimal currency) passes amount through without cents multiplier', async () => {
    const { client, calls } = makeMockStripe();
    const service = new PaymentService(adapter, { stripe: client });
    const booked = await adapter.book({
      offerId: 'offer-jpy',
      passengers: [
        { title: 'ms', firstName: 'Yuki', lastName: 'Sato', dateOfBirth: '1990-01-01', gender: 'female' },
      ],
      contactEmail: 'y@s.test',
      contactPhone: '+819012345678',
    });
    adapter.updateBookingPrice(booked.bookingReference, '25000', 'JPY');

    await service.createIntent(booked.bookingReference);
    expect(calls[0]!.args[0]).toMatchObject({ amount: 25000, currency: 'jpy' });
  });

  it('mock mode still succeeds when no Stripe is wired', async () => {
    const service = new PaymentService(adapter);
    const ref = await seedBooking(adapter);
    const result = await service.processPayment(ref);
    expect(result.status).toBe('succeeded');
    expect(result.paymentId).toMatch(/^pay_mock_/);
  });
});
