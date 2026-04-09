/**
 * Order Management — Agent 3.6
 *
 * Travel order lifecycle management — create, modify, cancel, retrieve,
 * and list orders with status tracking and transition validation.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import Decimal from 'decimal.js';
import type {
  OrderManagementInput,
  OrderManagementOutput,
  Order,
  OrderItem,
  OrderStatus,
  OrderHistoryEntry,
  CreateOrderData,
  ModifyOrderData,
  CancelOrderData,
  GetOrderData,
  ListOrdersData,
} from './types.js';

const VALID_OPERATIONS = new Set([
  'createOrder',
  'modifyOrder',
  'cancelOrder',
  'getOrder',
  'listOrders',
]);

const MODIFIABLE_STATUSES: ReadonlySet<OrderStatus> = new Set(['PENDING', 'CONFIRMED']);
const CANCELLABLE_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'PENDING',
  'CONFIRMED',
  'MODIFIED',
]);

export class OrderManagement implements Agent<OrderManagementInput, OrderManagementOutput> {
  readonly id = '3.6';
  readonly name = 'Order Management';
  readonly version = '0.1.0';

  private initialized = false;
  private orders: Map<string, Order> = new Map();
  private orderCounter = 0;

  async initialize(): Promise<void> {
    this.orders.clear();
    this.orderCounter = 0;
    this.initialized = true;
  }

  async execute(
    input: AgentInput<OrderManagementInput>,
  ): Promise<AgentOutput<OrderManagementOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const { operation } = input.data;
    let result: OrderManagementOutput;

    switch (operation) {
      case 'createOrder':
        result = this.handleCreate(input.data.createOrder!);
        break;
      case 'modifyOrder':
        result = this.handleModify(input.data.modifyOrder!);
        break;
      case 'cancelOrder':
        result = this.handleCancel(input.data.cancelOrder!);
        break;
      case 'getOrder':
        result = this.handleGet(input.data.getOrder!);
        break;
      case 'listOrders':
        result = this.handleList(input.data.listOrders ?? {});
        break;
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Unknown operation.');
    }

    const warnings: string[] = [];
    if (!result.success && result.errorMessage) {
      warnings.push(result.errorMessage);
    }

    return {
      data: result,
      confidence: 1.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        operation,
        success: result.success,
        order_count: this.orders.size,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }
    return { status: 'healthy' };
  }

  destroy(): void {
    this.orders.clear();
    this.orderCounter = 0;
    this.initialized = false;
  }

  // ---------------------------------------------------------------------------
  // Operation handlers
  // ---------------------------------------------------------------------------

  private handleCreate(data: CreateOrderData): OrderManagementOutput {
    this.orderCounter++;
    const orderId = `ORD${String(this.orderCounter).padStart(6, '0')}`;
    const now = new Date().toISOString();

    const totalAmount = data.items
      .reduce(
        (sum, item) => sum.plus(new Decimal(item.amount).times(item.quantity)),
        new Decimal(0),
      )
      .toFixed(2);

    const initialHistory: OrderHistoryEntry = {
      timestamp: now,
      fromStatus: null,
      toStatus: 'PENDING',
      reason: 'Order created',
    };

    const order: Order = {
      orderId,
      status: 'PENDING',
      passengerName: data.passengerName,
      passengerEmail: data.passengerEmail,
      recordLocator: data.recordLocator,
      items: [...data.items],
      totalAmount,
      currency: data.currency,
      source: data.source,
      history: [initialHistory],
      createdAt: now,
      updatedAt: now,
    };

    this.orders.set(orderId, order);

    return { order: this.cloneOrder(order), operation: 'createOrder', success: true };
  }

  private handleModify(data: ModifyOrderData): OrderManagementOutput {
    const order = this.orders.get(data.orderId);
    if (!order) {
      return {
        operation: 'modifyOrder',
        success: false,
        errorCode: 'ORDER_NOT_FOUND',
        errorMessage: `Order ${data.orderId} not found.`,
      };
    }

    if (order.status === 'FULFILLED') {
      return {
        operation: 'modifyOrder',
        success: false,
        errorCode: 'ORDER_ALREADY_FULFILLED',
        errorMessage: `Order ${data.orderId} is already fulfilled and cannot be modified.`,
      };
    }

    if (order.status === 'CANCELLED') {
      return {
        operation: 'modifyOrder',
        success: false,
        errorCode: 'ORDER_ALREADY_CANCELLED',
        errorMessage: `Order ${data.orderId} is already cancelled and cannot be modified.`,
      };
    }

    if (!MODIFIABLE_STATUSES.has(order.status)) {
      return {
        operation: 'modifyOrder',
        success: false,
        errorCode: 'INVALID_STATUS_TRANSITION',
        errorMessage: `Cannot modify order in status ${order.status}.`,
      };
    }

    const now = new Date().toISOString();
    const previousStatus = order.status;

    if (data.items) {
      order.items = [...data.items];
      order.totalAmount = data.items
        .reduce(
          (sum, item) => sum.plus(new Decimal(item.amount).times(item.quantity)),
          new Decimal(0),
        )
        .toFixed(2);
    }
    if (data.passengerName) {
      order.passengerName = data.passengerName;
    }
    if (data.passengerEmail) {
      order.passengerEmail = data.passengerEmail;
    }

    order.status = 'MODIFIED';
    order.updatedAt = now;
    order.history.push({
      timestamp: now,
      fromStatus: previousStatus,
      toStatus: 'MODIFIED',
      reason: data.reason,
    });

    return { order: this.cloneOrder(order), operation: 'modifyOrder', success: true };
  }

  private handleCancel(data: CancelOrderData): OrderManagementOutput {
    const order = this.orders.get(data.orderId);
    if (!order) {
      return {
        operation: 'cancelOrder',
        success: false,
        errorCode: 'ORDER_NOT_FOUND',
        errorMessage: `Order ${data.orderId} not found.`,
      };
    }

    if (order.status === 'FULFILLED') {
      return {
        operation: 'cancelOrder',
        success: false,
        errorCode: 'ORDER_ALREADY_FULFILLED',
        errorMessage: `Order ${data.orderId} is already fulfilled and cannot be cancelled.`,
      };
    }

    if (order.status === 'CANCELLED') {
      return {
        operation: 'cancelOrder',
        success: false,
        errorCode: 'ORDER_ALREADY_CANCELLED',
        errorMessage: `Order ${data.orderId} is already cancelled.`,
      };
    }

    if (!CANCELLABLE_STATUSES.has(order.status)) {
      return {
        operation: 'cancelOrder',
        success: false,
        errorCode: 'INVALID_STATUS_TRANSITION',
        errorMessage: `Cannot cancel order in status ${order.status}.`,
      };
    }

    const now = new Date().toISOString();
    const previousStatus = order.status;

    order.status = 'CANCELLED';
    order.updatedAt = now;
    order.history.push({
      timestamp: now,
      fromStatus: previousStatus,
      toStatus: 'CANCELLED',
      reason: data.reason,
    });

    return { order: this.cloneOrder(order), operation: 'cancelOrder', success: true };
  }

  private handleGet(data: GetOrderData): OrderManagementOutput {
    const order = this.orders.get(data.orderId);
    if (!order) {
      return {
        operation: 'getOrder',
        success: false,
        errorCode: 'ORDER_NOT_FOUND',
        errorMessage: `Order ${data.orderId} not found.`,
      };
    }
    return { order: this.cloneOrder(order), operation: 'getOrder', success: true };
  }

  private handleList(data: ListOrdersData): OrderManagementOutput {
    let orders = Array.from(this.orders.values());

    if (data.filter) {
      if (data.filter.status) {
        orders = orders.filter((o) => o.status === data.filter!.status);
      }
      if (data.filter.passengerEmail) {
        orders = orders.filter(
          (o) => o.passengerEmail.toLowerCase() === data.filter!.passengerEmail!.toLowerCase(),
        );
      }
      if (data.filter.source) {
        orders = orders.filter((o) => o.source === data.filter!.source);
      }
    }

    return {
      orders: orders.map((o) => this.cloneOrder(o)),
      operation: 'listOrders',
      success: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private cloneOrder(order: Order): Order {
    return {
      ...order,
      items: order.items.map((i) => ({ ...i })),
      history: order.history.map((h) => ({ ...h })),
    };
  }

  private validateInput(data: OrderManagementInput): void {
    if (!data.operation || !VALID_OPERATIONS.has(data.operation)) {
      throw new AgentInputValidationError(
        this.id,
        'operation',
        `Must be one of: ${[...VALID_OPERATIONS].join(', ')}`,
      );
    }

    switch (data.operation) {
      case 'createOrder':
        this.validateCreateOrder(data.createOrder);
        break;
      case 'modifyOrder':
        this.validateModifyOrder(data.modifyOrder);
        break;
      case 'cancelOrder':
        this.validateCancelOrder(data.cancelOrder);
        break;
      case 'getOrder':
        this.validateGetOrder(data.getOrder);
        break;
      case 'listOrders':
        // listOrders has no required fields
        break;
    }
  }

  private validateCreateOrder(data: CreateOrderData | undefined): void {
    if (!data) {
      throw new AgentInputValidationError(
        this.id,
        'createOrder',
        'createOrder data is required for createOrder operation.',
      );
    }
    if (!data.passengerName || data.passengerName.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'passengerName', 'Passenger name is required.');
    }
    if (!data.passengerEmail || data.passengerEmail.trim().length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'passengerEmail',
        'Passenger email is required.',
      );
    }
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new AgentInputValidationError(this.id, 'items', 'At least one order item is required.');
    }
    for (const item of data.items) {
      this.validateOrderItem(item);
    }
    if (!data.currency || data.currency.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'currency', 'Currency is required.');
    }
    if (!data.source || data.source.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'source', 'Source is required.');
    }
  }

  private validateOrderItem(item: OrderItem): void {
    if (!item.description || item.description.trim().length === 0) {
      throw new AgentInputValidationError(
        this.id,
        'item.description',
        'Item description is required.',
      );
    }
    if (!item.amount) {
      throw new AgentInputValidationError(this.id, 'item.amount', 'Item amount is required.');
    }
    try {
      const d = new Decimal(item.amount);
      if (d.isNegative()) {
        throw new AgentInputValidationError(
          this.id,
          'item.amount',
          'Item amount must be non-negative.',
        );
      }
    } catch {
      throw new AgentInputValidationError(
        this.id,
        'item.amount',
        'Item amount must be a valid decimal number.',
      );
    }
    if (!item.currency || item.currency.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'item.currency', 'Item currency is required.');
    }
    if (item.quantity == null || item.quantity < 1) {
      throw new AgentInputValidationError(
        this.id,
        'item.quantity',
        'Item quantity must be at least 1.',
      );
    }
  }

  private validateModifyOrder(data: ModifyOrderData | undefined): void {
    if (!data) {
      throw new AgentInputValidationError(
        this.id,
        'modifyOrder',
        'modifyOrder data is required for modifyOrder operation.',
      );
    }
    if (!data.orderId || data.orderId.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'orderId', 'Order ID is required.');
    }
    if (!data.reason || data.reason.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'reason', 'Modification reason is required.');
    }
    if (data.items) {
      if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new AgentInputValidationError(
          this.id,
          'items',
          'Items array must not be empty when provided.',
        );
      }
      for (const item of data.items) {
        this.validateOrderItem(item);
      }
    }
  }

  private validateCancelOrder(data: CancelOrderData | undefined): void {
    if (!data) {
      throw new AgentInputValidationError(
        this.id,
        'cancelOrder',
        'cancelOrder data is required for cancelOrder operation.',
      );
    }
    if (!data.orderId || data.orderId.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'orderId', 'Order ID is required.');
    }
    if (!data.reason || data.reason.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'reason', 'Cancellation reason is required.');
    }
  }

  private validateGetOrder(data: GetOrderData | undefined): void {
    if (!data) {
      throw new AgentInputValidationError(
        this.id,
        'getOrder',
        'getOrder data is required for getOrder operation.',
      );
    }
    if (!data.orderId || data.orderId.trim().length === 0) {
      throw new AgentInputValidationError(this.id, 'orderId', 'Order ID is required.');
    }
  }
}

export type {
  OrderManagementInput,
  OrderManagementOutput,
  Order,
  OrderItem,
  OrderStatus,
  OrderOperationType,
  OrderErrorCode,
  OrderHistoryEntry,
  CreateOrderData,
  ModifyOrderData,
  CancelOrderData,
  GetOrderData,
  ListOrdersData,
  ListOrdersFilter,
} from './types.js';
