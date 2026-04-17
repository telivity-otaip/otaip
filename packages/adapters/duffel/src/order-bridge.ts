/**
 * Duffel Order Bridge — maps between Duffel's native order model and
 * OTAIP's AIDM-aligned Order types.
 *
 * Duffel already uses "orders" as its booking primitive (not PNRs), so
 * this bridge is mostly terminology alignment rather than a conceptual
 * translation. The mapping is:
 *
 *   Duffel offer_request → OTAIP Offer
 *   Duffel order         → OTAIP Order
 *   Duffel order_change  → OTAIP OrderChange
 *   Duffel order_cancellation → OTAIP OrderCancel
 *
 * This is a MOCK implementation — no real Duffel API calls are made.
 * Same pattern as MockDuffelAdapter.
 */

import type {
  Offer,
  Order,
  OrderChangeRequest,
  OrderEvent,
  OrderItem,
  OrderOperations,
  OrderPassenger,
  OrderPayment,
} from '@otaip/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateOrderId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return `DFL-ORD-${id}`;
}

function generateEventId(): string {
  return `dfl-evt-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// DuffelOrderBridge
// ---------------------------------------------------------------------------

export class DuffelOrderBridge implements OrderOperations {
  private readonly orders = new Map<string, Order>();
  private readonly events = new Map<string, OrderEvent[]>();

  async orderCreate(
    offer: Offer,
    passengers: readonly OrderPassenger[],
    payment: OrderPayment,
  ): Promise<Order> {
    const orderId = generateOrderId();
    const now = nowIso();

    // Map offer items to order items — Duffel offers map 1:1 to order slices
    const orderItems: readonly OrderItem[] = offer.offerItems.map((item) => ({
      orderItemId: `${orderId}-${item.offerItemId}`,
      offerItemRef: item.offerItemId,
      services: item.services,
      status: 'confirmed' as const,
      price: item.price,
    }));

    const order: Order = {
      orderId,
      owner: offer.owner,
      orderItems,
      passengers,
      payments: [payment],
      status: 'confirmed',
      ticketDocuments: [],
      createdAt: now,
      updatedAt: now,
      source: 'duffel',
    };

    this.orders.set(orderId, order);

    // Record creation event
    const event: OrderEvent = {
      eventId: generateEventId(),
      type: 'order.created',
      orderId,
      timestamp: now,
      data: { offerRef: offer.offerId },
    };
    this.events.set(orderId, [event]);

    return order;
  }

  async orderRetrieve(orderId: string): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }
    return order;
  }

  async orderChange(change: OrderChangeRequest): Promise<Order> {
    const order = this.orders.get(change.orderId);
    if (!order) {
      throw new Error(`Order not found: ${change.orderId}`);
    }

    const now = nowIso();
    let updatedItems = [...order.orderItems];

    for (const ch of change.changes) {
      switch (ch.type) {
        case 'add': {
          if (ch.newServices) {
            const newItem: OrderItem = {
              orderItemId: `${order.orderId}-added-${Date.now()}`,
              offerItemRef: 'added',
              services: ch.newServices,
              status: 'confirmed',
              price: { amount: '0.00', currencyCode: order.payments[0]?.amount.currencyCode ?? 'USD' },
            };
            updatedItems = [...updatedItems, newItem];
          }
          break;
        }
        case 'remove': {
          if (ch.orderItemId) {
            updatedItems = updatedItems.filter((i) => i.orderItemId !== ch.orderItemId);
          }
          break;
        }
        case 'modify': {
          break;
        }
      }
    }

    const updatedOrder: Order = {
      ...order,
      orderItems: updatedItems,
      updatedAt: now,
    };

    this.orders.set(change.orderId, updatedOrder);

    // Record change event
    const orderEvents = this.events.get(change.orderId) ?? [];
    orderEvents.push({
      eventId: generateEventId(),
      type: 'order.changed',
      orderId: change.orderId,
      timestamp: now,
      data: { changes: change.changes.length },
    });
    this.events.set(change.orderId, orderEvents);

    return updatedOrder;
  }

  async orderCancel(orderId: string, reason?: string): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    if (order.status === 'cancelled') {
      throw new Error(`Order already cancelled: ${orderId}`);
    }

    const now = nowIso();

    const cancelledItems: readonly OrderItem[] = order.orderItems.map((item) => ({
      ...item,
      status: 'cancelled' as const,
    }));

    const cancelledOrder: Order = {
      ...order,
      orderItems: cancelledItems,
      status: 'cancelled',
      updatedAt: now,
    };

    this.orders.set(orderId, cancelledOrder);

    // Record cancel event
    const orderEvents = this.events.get(orderId) ?? [];
    orderEvents.push({
      eventId: generateEventId(),
      type: 'order.cancelled',
      orderId,
      timestamp: now,
      data: reason ? { reason } : undefined,
    });
    this.events.set(orderId, orderEvents);

    return cancelledOrder;
  }

  async orderViewHistory(orderId: string): Promise<readonly OrderEvent[]> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }
    return this.events.get(orderId) ?? [];
  }
}
