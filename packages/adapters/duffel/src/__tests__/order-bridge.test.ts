import { describe, expect, it, beforeEach } from 'vitest';
import type {
  Offer,
  OrderPassenger,
  OrderPayment,
  OrderChangeRequest,
} from '@otaip/core';
import { DuffelOrderBridge } from '../order-bridge.js';

// ============================================================
// TEST HELPERS
// ============================================================

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    offerId: 'dfl-offer-001',
    owner: 'BA',
    offerItems: [
      {
        offerItemId: 'slice-1',
        services: [
          {
            serviceId: 'svc-1',
            type: 'flight',
            flight: {
              marketingCarrier: 'BA',
              flightNumber: '304',
              origin: 'LHR',
              destination: 'CDG',
              departureDateTime: '2026-07-01T10:00:00+01:00',
              arrivalDateTime: '2026-07-01T12:15:00+02:00',
              durationMinutes: 75,
              cabinClass: 'economy',
              bookingClass: 'Y',
              fareBasis: 'YOW',
            },
          },
        ],
        price: { amount: '175.00', currencyCode: 'GBP' },
      },
    ],
    totalPrice: { amount: '175.00', currencyCode: 'GBP' },
    expiresAt: '2026-06-30T23:59:59Z',
    source: 'duffel',
    ...overrides,
  };
}

function makePassengers(): readonly OrderPassenger[] {
  return [
    {
      passengerId: 'pax-1',
      passengerType: 'ADT',
      givenName: 'John',
      surname: 'Smith',
      email: 'john@example.com',
      phone: '+44123456789',
    },
  ];
}

function makePayment(): OrderPayment {
  return {
    paymentId: 'pay-dfl-001',
    method: 'credit_card',
    amount: { amount: '175.00', currencyCode: 'GBP' },
    status: 'completed',
    processedAt: new Date().toISOString(),
  };
}

// ============================================================
// TESTS
// ============================================================

describe('DuffelOrderBridge', () => {
  let bridge: DuffelOrderBridge;

  beforeEach(() => {
    bridge = new DuffelOrderBridge();
  });

  // ──────────────────────────────────────────────────────────
  // orderCreate
  // ──────────────────────────────────────────────────────────

  it('maps offer to order', async () => {
    const order = await bridge.orderCreate(makeOffer(), makePassengers(), makePayment());
    expect(order).toBeDefined();
    expect(order.status).toBe('confirmed');
    expect(order.owner).toBe('BA');
    expect(order.source).toBe('duffel');
  });

  it('assigns DFL-ORD-* ID', async () => {
    const order = await bridge.orderCreate(makeOffer(), makePassengers(), makePayment());
    expect(order.orderId).toMatch(/^DFL-ORD-[a-z0-9]{8}$/);
  });

  // ──────────────────────────────────────────────────────────
  // orderRetrieve
  // ──────────────────────────────────────────────────────────

  it('retrieves a created order', async () => {
    const created = await bridge.orderCreate(makeOffer(), makePassengers(), makePayment());
    const retrieved = await bridge.orderRetrieve(created.orderId);
    expect(retrieved.orderId).toBe(created.orderId);
  });

  it('throws for unknown order', async () => {
    await expect(bridge.orderRetrieve('DFL-ORD-nonexist')).rejects.toThrow('Order not found');
  });

  // ──────────────────────────────────────────────────────────
  // orderChange
  // ──────────────────────────────────────────────────────────

  it('modifies an order', async () => {
    const created = await bridge.orderCreate(makeOffer(), makePassengers(), makePayment());
    const change: OrderChangeRequest = {
      orderId: created.orderId,
      changes: [
        {
          type: 'add',
          newServices: [{ serviceId: 'svc-bag', type: 'baggage', description: '23kg bag' }],
        },
      ],
    };
    const updated = await bridge.orderChange(change);
    expect(updated.orderItems).toHaveLength(2);
  });

  // ──────────────────────────────────────────────────────────
  // orderCancel
  // ──────────────────────────────────────────────────────────

  it('cancels an order', async () => {
    const created = await bridge.orderCreate(makeOffer(), makePassengers(), makePayment());
    const cancelled = await bridge.orderCancel(created.orderId, 'Schedule change');
    expect(cancelled.status).toBe('cancelled');
  });

  it('prevents double cancel', async () => {
    const created = await bridge.orderCreate(makeOffer(), makePassengers(), makePayment());
    await bridge.orderCancel(created.orderId);
    await expect(bridge.orderCancel(created.orderId)).rejects.toThrow('Order already cancelled');
  });

  // ──────────────────────────────────────────────────────────
  // Passenger + payment mapping
  // ──────────────────────────────────────────────────────────

  it('has correct passenger mapping', async () => {
    const order = await bridge.orderCreate(makeOffer(), makePassengers(), makePayment());
    expect(order.passengers).toHaveLength(1);
    expect(order.passengers[0]!.givenName).toBe('John');
    expect(order.passengers[0]!.surname).toBe('Smith');
  });

  it('has correct payment record', async () => {
    const order = await bridge.orderCreate(makeOffer(), makePassengers(), makePayment());
    expect(order.payments).toHaveLength(1);
    expect(order.payments[0]!.amount.amount).toBe('175.00');
    expect(order.payments[0]!.amount.currencyCode).toBe('GBP');
  });

  it('order items reference offer items', async () => {
    const order = await bridge.orderCreate(makeOffer(), makePassengers(), makePayment());
    expect(order.orderItems[0]!.offerItemRef).toBe('slice-1');
    expect(order.orderItems[0]!.services[0]!.type).toBe('flight');
  });
});
