/**
 * Order Management — Persistence adapter tests
 *
 * Agent 3.6: Verifies that the agent works correctly when constructed
 * with an InMemoryPersistenceAdapter injected via the config.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryPersistenceAdapter } from '@otaip/core';
import { OrderManagement } from '../index.js';
import type { OrderManagementInput, OrderItem, CreateOrderData } from '../types.js';

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    description: 'LHR-JFK Economy',
    amount: '450.00',
    currency: 'USD',
    quantity: 1,
    ...overrides,
  };
}

function makeCreateData(overrides: Partial<CreateOrderData> = {}): CreateOrderData {
  return {
    passengerName: 'John Doe',
    passengerEmail: 'john@example.com',
    recordLocator: 'ABC123',
    items: [makeItem()],
    currency: 'USD',
    source: 'GDS_AMADEUS',
    ...overrides,
  };
}

function createInput(overrides: Partial<CreateOrderData> = {}): OrderManagementInput {
  return {
    operation: 'createOrder',
    createOrder: makeCreateData(overrides),
  };
}

let persistence: InMemoryPersistenceAdapter;
let agent: OrderManagement;

beforeEach(async () => {
  persistence = new InMemoryPersistenceAdapter();
  agent = new OrderManagement({ persistence });
  await agent.initialize();
});

async function createOrderAndGetId(overrides: Partial<CreateOrderData> = {}): Promise<string> {
  const result = await agent.execute({ data: createInput(overrides) });
  return result.data.order!.orderId;
}

describe('OrderManagement with PersistenceAdapter', () => {
  it('stores order in persistence adapter', async () => {
    const orderId = await createOrderAndGetId();
    expect(persistence.size).toBe(1);
    expect(await persistence.has(`order:${orderId}`)).toBe(true);
  });

  it('retrieves order via getOrder', async () => {
    const orderId = await createOrderAndGetId();
    const result = await agent.execute({
      data: { operation: 'getOrder', getOrder: { orderId } },
    });
    expect(result.data.success).toBe(true);
    expect(result.data.order!.orderId).toBe(orderId);
    expect(result.data.order!.status).toBe('PENDING');
  });

  it('modifies order and persists change', async () => {
    const orderId = await createOrderAndGetId();
    const result = await agent.execute({
      data: {
        operation: 'modifyOrder',
        modifyOrder: {
          orderId,
          items: [makeItem({ amount: '500.00' })],
          reason: 'Price change',
        },
      },
    });
    expect(result.data.success).toBe(true);
    expect(result.data.order!.status).toBe('MODIFIED');
    expect(result.data.order!.totalAmount).toBe('500.00');

    // Verify persistence has the updated value
    const stored = await persistence.get<{ status: string }>(`order:${orderId}`);
    expect(stored!.status).toBe('MODIFIED');
  });

  it('cancels order and persists change', async () => {
    const orderId = await createOrderAndGetId();
    const result = await agent.execute({
      data: {
        operation: 'cancelOrder',
        cancelOrder: { orderId, reason: 'Customer request' },
      },
    });
    expect(result.data.success).toBe(true);
    expect(result.data.order!.status).toBe('CANCELLED');

    const stored = await persistence.get<{ status: string }>(`order:${orderId}`);
    expect(stored!.status).toBe('CANCELLED');
  });

  it('lists orders from persistence', async () => {
    await createOrderAndGetId({ passengerEmail: 'a@test.com' });
    await createOrderAndGetId({ passengerEmail: 'b@test.com' });
    const result = await agent.execute({
      data: { operation: 'listOrders' },
    });
    expect(result.data.success).toBe(true);
    expect(result.data.orders).toHaveLength(2);
  });

  it('filters listed orders from persistence by status', async () => {
    const orderId = await createOrderAndGetId();
    await createOrderAndGetId({ passengerEmail: 'other@test.com' });
    await agent.execute({
      data: {
        operation: 'cancelOrder',
        cancelOrder: { orderId, reason: 'Cancel' },
      },
    });
    const result = await agent.execute({
      data: {
        operation: 'listOrders',
        listOrders: { filter: { status: 'CANCELLED' } },
      },
    });
    expect(result.data.orders).toHaveLength(1);
    expect(result.data.orders![0]!.status).toBe('CANCELLED');
  });

  it('returns ORDER_NOT_FOUND for missing order', async () => {
    const result = await agent.execute({
      data: { operation: 'getOrder', getOrder: { orderId: 'ORD999999' } },
    });
    expect(result.data.success).toBe(false);
    expect(result.data.errorCode).toBe('ORDER_NOT_FOUND');
  });

  it('metadata includes correct order_count from persistence', async () => {
    await createOrderAndGetId();
    await createOrderAndGetId();
    const result = await agent.execute({
      data: { operation: 'listOrders' },
    });
    expect(result.metadata!['order_count']).toBe(2);
  });

  it('works without persistence (backward compatible)', async () => {
    const plainAgent = new OrderManagement();
    await plainAgent.initialize();
    const result = await plainAgent.execute({ data: createInput() });
    expect(result.data.success).toBe(true);
    expect(result.data.order).toBeDefined();
    plainAgent.destroy();
  });
});
