/**
 * Order Management — Types
 *
 * Agent 3.6: Travel order lifecycle management.
 */

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'MODIFIED'
  | 'CANCELLED'
  | 'FULFILLED';

export type OrderOperationType =
  | 'createOrder'
  | 'modifyOrder'
  | 'cancelOrder'
  | 'getOrder'
  | 'listOrders';

export type OrderErrorCode =
  | 'ORDER_NOT_FOUND'
  | 'ORDER_ALREADY_FULFILLED'
  | 'ORDER_ALREADY_CANCELLED'
  | 'INVALID_STATUS_TRANSITION';

export interface OrderItem {
  /** Item description (e.g. flight segment, ancillary) */
  description: string;
  /** Item amount */
  amount: string;
  /** Currency code */
  currency: string;
  /** Item quantity */
  quantity: number;
}

export interface OrderHistoryEntry {
  /** Timestamp of the status change (ISO) */
  timestamp: string;
  /** Status before the change */
  fromStatus: OrderStatus | null;
  /** Status after the change */
  toStatus: OrderStatus;
  /** Reason for the change */
  reason: string;
}

export interface Order {
  /** Order ID (ORD-prefixed) */
  orderId: string;
  /** Current status */
  status: OrderStatus;
  /** Passenger name */
  passengerName: string;
  /** Passenger email */
  passengerEmail: string;
  /** Record locator / PNR */
  recordLocator?: string;
  /** Order items */
  items: OrderItem[];
  /** Total amount (decimal string) */
  totalAmount: string;
  /** Currency code */
  currency: string;
  /** Source system */
  source: string;
  /** Status history */
  history: OrderHistoryEntry[];
  /** Created at (ISO) */
  createdAt: string;
  /** Last updated at (ISO) */
  updatedAt: string;
}

export interface CreateOrderData {
  passengerName: string;
  passengerEmail: string;
  recordLocator?: string;
  items: OrderItem[];
  currency: string;
  source: string;
}

export interface ModifyOrderData {
  orderId: string;
  items?: OrderItem[];
  passengerName?: string;
  passengerEmail?: string;
  reason: string;
}

export interface CancelOrderData {
  orderId: string;
  reason: string;
}

export interface GetOrderData {
  orderId: string;
}

export interface ListOrdersFilter {
  status?: OrderStatus;
  passengerEmail?: string;
  source?: string;
}

export interface ListOrdersData {
  filter?: ListOrdersFilter;
}

export interface OrderManagementInput {
  operation: OrderOperationType;
  createOrder?: CreateOrderData;
  modifyOrder?: ModifyOrderData;
  cancelOrder?: CancelOrderData;
  getOrder?: GetOrderData;
  listOrders?: ListOrdersData;
}

export interface OrderManagementOutput {
  /** The resulting order (for create / modify / cancel / get) */
  order?: Order;
  /** List of orders (for listOrders) */
  orders?: Order[];
  /** Operation that was performed */
  operation: OrderOperationType;
  /** Whether the operation succeeded */
  success: boolean;
  /** Error code if operation failed */
  errorCode?: OrderErrorCode;
  /** Error message if operation failed */
  errorMessage?: string;
}
