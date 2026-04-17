import { describe, expect, it, beforeEach } from 'vitest';
import type {
  Offer,
  OrderPassenger,
  OrderPayment,
  OrderChangeRequest,
  Service,
} from '@otaip/core';
import { NavitaireOrderOperations } from '../order-operations.js';

// ============================================================
// TEST HELPERS
// ============================================================

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    offerId: 'test-offer-001',
    owner: 'NK',
    offerItems: [
      {
        offerItemId: 'item-1',
        services: [
          {
            serviceId: 'svc-1',
            type: 'flight',
            flight: {
              marketingCarrier: 'NK',
              flightNumber: '1234',
              origin: 'FLL',
              destination: 'LGA',
              departureDateTime: '2026-07-01T08:00:00-04:00',
              arrivalDateTime: '2026-07-01T11:00:00-04:00',
              durationMinutes: 180,
              cabinClass: 'economy',
              bookingClass: 'Y',
              fareBasis: 'Y7NR',
            },
          },
        ],
        price: { amount: '99.00', currencyCode: 'USD' },
      },
    ],
    totalPrice: { amount: '99.00', currencyCode: 'USD' },
    expiresAt: '2026-06-30T23:59:59Z',
    source: 'navitaire',
    ...overrides,
  };
}

function makePassengers(): readonly OrderPassenger[] {
  return [
    {
      passengerId: 'pax-1',
      passengerType: 'ADT',
      givenName: 'Jane',
      surname: 'Doe',
      email: 'jane@example.com',
    },
  ];
}

function makePayment(): OrderPayment {
  return {
    paymentId: 'pay-001',
    method: 'credit_card',
    amount: { amount: '99.00', currencyCode: 'USD' },
    status: 'completed',
    processedAt: new Date().toISOString(),
  };
}

// ============================================================
// TESTS
// ============================================================

describe('NavitaireOrderOperations', () => {
  let ops: NavitaireOrderOperations;

  beforeEach(() => {
    ops = new NavitaireOrderOperations();
  });

  // ──────────────────────────────────────────────────────────
  // orderCreate
  // ──────────────────────────────────────────────────────────

  describe('orderCreate', () => {
    it('creates an order from an offer', async () => {
      const order = await ops.orderCreate(makeOffer(), makePassengers(), makePayment());
      expect(order).toBeDefined();
      expect(order.orderId).toBeTruthy();
      expect(order.owner).toBe('NK');
    });

    it('generates NAV-ORD-* ID', async () => {
      const order = await ops.orderCreate(makeOffer(), makePassengers(), makePayment());
      expect(order.orderId).toMatch(/^NAV-ORD-[A-Z0-9]{6}$/);
    });

    it('sets status to confirmed', async () => {
      const order = await ops.orderCreate(makeOffer(), makePassengers(), makePayment());
      expect(order.status).toBe('confirmed');
    });

    it('maps offer items to order items', async () => {
      const offer = makeOffer();
      const order = await ops.orderCreate(offer, makePassengers(), makePayment());
      expect(order.orderItems).toHaveLength(1);
      expect(order.orderItems[0]!.offerItemRef).toBe('item-1');
      expect(order.orderItems[0]!.status).toBe('confirmed');
      expect(order.orderItems[0]!.services).toHaveLength(1);
      expect(order.orderItems[0]!.services[0]!.type).toBe('flight');
    });

    it('stores passengers', async () => {
      const passengers = makePassengers();
      const order = await ops.orderCreate(makeOffer(), passengers, makePayment());
      expect(order.passengers).toHaveLength(1);
      expect(order.passengers[0]!.givenName).toBe('Jane');
      expect(order.passengers[0]!.surname).toBe('Doe');
    });

    it('records payment', async () => {
      const payment = makePayment();
      const order = await ops.orderCreate(makeOffer(), makePassengers(), payment);
      expect(order.payments).toHaveLength(1);
      expect(order.payments[0]!.paymentId).toBe('pay-001');
      expect(order.payments[0]!.method).toBe('credit_card');
    });
  });

  // ──────────────────────────────────────────────────────────
  // orderRetrieve
  // ──────────────────────────────────────────────────────────

  describe('orderRetrieve', () => {
    it('returns a previously created order', async () => {
      const created = await ops.orderCreate(makeOffer(), makePassengers(), makePayment());
      const retrieved = await ops.orderRetrieve(created.orderId);
      expect(retrieved.orderId).toBe(created.orderId);
      expect(retrieved.status).toBe('confirmed');
    });

    it('throws for unknown order ID', async () => {
      await expect(ops.orderRetrieve('NAV-ORD-XXXXXX')).rejects.toThrow('Order not found');
    });
  });

  // ──────────────────────────────────────────────────────────
  // orderChange
  // ──────────────────────────────────────────────────────────

  describe('orderChange', () => {
    it('adds a service to an order', async () => {
      const created = await ops.orderCreate(makeOffer(), makePassengers(), makePayment());

      const addService: Service = {
        serviceId: 'svc-bag-1',
        type: 'baggage',
        description: 'Checked bag 23kg',
      };

      const change: OrderChangeRequest = {
        orderId: created.orderId,
        changes: [{ type: 'add', newServices: [addService] }],
      };

      const updated = await ops.orderChange(change);
      expect(updated.orderItems).toHaveLength(2);
    });

    it('removes an order item', async () => {
      const created = await ops.orderCreate(makeOffer(), makePassengers(), makePayment());
      const itemId = created.orderItems[0]!.orderItemId;

      const change: OrderChangeRequest = {
        orderId: created.orderId,
        changes: [{ type: 'remove', orderItemId: itemId }],
      };

      const updated = await ops.orderChange(change);
      expect(updated.orderItems).toHaveLength(0);
    });

    it('updates order timestamp on change', async () => {
      const created = await ops.orderCreate(makeOffer(), makePassengers(), makePayment());

      // Small delay to ensure timestamp differs
      const change: OrderChangeRequest = {
        orderId: created.orderId,
        changes: [{ type: 'modify', orderItemId: created.orderItems[0]!.orderItemId }],
      };

      const updated = await ops.orderChange(change);
      expect(updated.updatedAt).toBeDefined();
      // updatedAt should be at least as recent as createdAt
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(created.createdAt).getTime(),
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  // orderCancel
  // ──────────────────────────────────────────────────────────

  describe('orderCancel', () => {
    it('sets status to cancelled', async () => {
      const created = await ops.orderCreate(makeOffer(), makePassengers(), makePayment());
      const cancelled = await ops.orderCancel(created.orderId, 'Customer request');
      expect(cancelled.status).toBe('cancelled');
    });

    it('throws on double cancel', async () => {
      const created = await ops.orderCreate(makeOffer(), makePassengers(), makePayment());
      await ops.orderCancel(created.orderId);
      await expect(ops.orderCancel(created.orderId)).rejects.toThrow('Order already cancelled');
    });
  });

  // ──────────────────────────────────────────────────────────
  // orderViewHistory
  // ──────────────────────────────────────────────────────────

  describe('orderViewHistory', () => {
    it('returns events in order', async () => {
      const created = await ops.orderCreate(makeOffer(), makePassengers(), makePayment());
      const events = await ops.orderViewHistory(created.orderId);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0]!.type).toBe('order.created');
    });

    it('includes create + cancel events', async () => {
      const created = await ops.orderCreate(makeOffer(), makePassengers(), makePayment());
      await ops.orderCancel(created.orderId);
      const events = await ops.orderViewHistory(created.orderId);
      expect(events).toHaveLength(2);
      expect(events[0]!.type).toBe('order.created');
      expect(events[1]!.type).toBe('order.cancelled');
    });
  });
});
