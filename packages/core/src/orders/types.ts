/**
 * OTAIP Offers & Orders — type definitions.
 *
 * Follows IATA AIDM 24.1 terminology where applicable:
 *   - OrderCreate, OrderRetrieve, OrderChange, OrderCancel (message names)
 *   - Offer, OfferItem, Order, OrderItem (entity names)
 *   - Service as the atomic unit of what's sold (flight, seat, bag, meal)
 *
 * These types coexist with the existing PNR model. The industry is
 * mid-transition — some carriers are PNR-based (GDS), some are moving
 * to Orders (NDC/ONE Order). OTAIP speaks both via BookingReference
 * (see bridge.ts).
 *
 * Key design decisions:
 *   - JSON, not XML. AIDM concepts, not AIDM XML schema.
 *   - Queue management stays PNR-only. Orders use event-driven status
 *     changes (OrderEvent), not queues.
 *   - No agent modifications in this sprint — types only. Agent
 *     integration happens via BookingReference in Sprint H.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Money
// ─────────────────────────────────────────────────────────────────────────────

export interface Money {
  /** Decimal string (e.g. "450.00"). Use decimal.js for arithmetic. */
  readonly amount: string;
  /** ISO 4217 currency code. */
  readonly currencyCode: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service — the atomic unit of what's being sold
// ─────────────────────────────────────────────────────────────────────────────

export type ServiceType =
  | 'flight'
  | 'seat'
  | 'baggage'
  | 'meal'
  | 'lounge'
  | 'insurance'
  | 'ancillary';

export interface FlightService {
  /** Marketing carrier IATA code. */
  readonly marketingCarrier: string;
  /** Flight number. */
  readonly flightNumber: string;
  /** Operating carrier (if codeshare). */
  readonly operatingCarrier?: string;
  /** Origin airport IATA code. */
  readonly origin: string;
  /** Destination airport IATA code. */
  readonly destination: string;
  /** ISO 8601 departure datetime. */
  readonly departureDateTime: string;
  /** ISO 8601 arrival datetime. */
  readonly arrivalDateTime: string;
  /** Duration in minutes. */
  readonly durationMinutes: number;
  /** Cabin class. */
  readonly cabinClass?: 'economy' | 'premium_economy' | 'business' | 'first';
  /** Booking class (RBD). */
  readonly bookingClass?: string;
  /** Fare basis code. */
  readonly fareBasis?: string;
}

export interface Service {
  /** Unique service identifier within the offer/order. */
  readonly serviceId: string;
  /** Service type — determines which detail object is populated. */
  readonly type: ServiceType;
  /** Flight details (populated when type='flight'). */
  readonly flight?: FlightService;
  /** Human-readable description (for non-flight services). */
  readonly description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Passenger (AIDM: Anonymous Traveler → Recognized Traveler)
// ─────────────────────────────────────────────────────────────────────────────

export type PassengerTypeCode = 'ADT' | 'CHD' | 'INF';

export interface OrderPassenger {
  /** Passenger identifier within the order. */
  readonly passengerId: string;
  readonly passengerType: PassengerTypeCode;
  readonly givenName: string;
  readonly surname: string;
  readonly title?: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  readonly dateOfBirth?: string;
  readonly gender?: 'Male' | 'Female' | 'Undisclosed';
  /** Contact email. */
  readonly email?: string;
  /** E.164 phone number. */
  readonly phone?: string;
  /** Travel document (passport, ID). */
  readonly travelDocument?: TravelDocument;
  /** Loyalty program info. */
  readonly loyaltyProgram?: LoyaltyInfo;
}

export interface TravelDocument {
  readonly documentType: 'passport' | 'national_id' | 'visa';
  readonly documentNumber: string;
  readonly issuingCountry: string;
  readonly expiryDate: string;
  readonly nationality: string;
}

export interface LoyaltyInfo {
  readonly programCode: string;
  readonly memberNumber: string;
  readonly tierLevel?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Offer (AIDM: Offer + OfferItem)
// ─────────────────────────────────────────────────────────────────────────────

export interface FareDetail {
  /** Fare basis code. */
  readonly fareBasis: string;
  /** Fare type indicator. */
  readonly fareType?: 'published' | 'negotiated' | 'private' | 'web';
  /** Whether refundable. */
  readonly refundable?: boolean;
  /** Whether changeable. */
  readonly changeable?: boolean;
  /** Baggage allowance description. */
  readonly baggageAllowance?: string;
}

export interface OfferItem {
  /** Unique within the offer. */
  readonly offerItemId: string;
  /** Services included in this offer item. */
  readonly services: readonly Service[];
  /** Price for this offer item. */
  readonly price: Money;
  /** Per-passenger type breakdown. */
  readonly passengerRefs?: readonly string[];
  /** Fare details for this item. */
  readonly fareDetail?: FareDetail;
}

export interface Offer {
  /** Unique offer identifier (from the airline/supplier). */
  readonly offerId: string;
  /** Offer owner — the airline code responsible for this offer (AIDM: OfferOwner). */
  readonly owner: string;
  /** Individual priced components. */
  readonly offerItems: readonly OfferItem[];
  /** Total price across all offer items. */
  readonly totalPrice: Money;
  /** ISO 8601 — offers expire (AIDM: TimeLimits). */
  readonly expiresAt: string;
  /** Payment time limit — when payment must be made (AIDM: PaymentTimelimit). */
  readonly paymentTimelimit?: string;
  /** Source system that produced this offer. */
  readonly source?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Order (AIDM: Order + OrderItem)
// ─────────────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'ticketed'
  | 'partially_ticketed'
  | 'cancelled'
  | 'completed';

export type OrderItemStatus =
  | 'pending'
  | 'confirmed'
  | 'ticketed'
  | 'cancelled'
  | 'flown'
  | 'refunded';

export interface OrderItem {
  /** Unique within the order. */
  readonly orderItemId: string;
  /** Reference to the OfferItem this was created from. */
  readonly offerItemRef: string;
  /** Services in this order item. */
  readonly services: readonly Service[];
  /** Status of this order item. */
  readonly status: OrderItemStatus;
  /** Price at time of order creation. */
  readonly price: Money;
}

export interface TicketDocument {
  /** 13-digit ticket number. */
  readonly ticketNumber: string;
  /** Document type. */
  readonly documentType: 'ET' | 'EMD_A' | 'EMD_S';
  /** Passenger this document is for. */
  readonly passengerRef: string;
  /** Coupon numbers covered. */
  readonly couponNumbers: readonly number[];
  /** Issue date (ISO 8601). */
  readonly issueDate: string;
}

export interface OrderPayment {
  /** Payment identifier. */
  readonly paymentId: string;
  /** Payment method. */
  readonly method: 'credit_card' | 'cash' | 'invoice' | 'other';
  /** Amount paid. */
  readonly amount: Money;
  /** Payment status. */
  readonly status: 'pending' | 'completed' | 'failed' | 'refunded';
  /** ISO 8601 timestamp. */
  readonly processedAt?: string;
}

export interface Order {
  /** Unique order identifier (AIDM: OrderID). */
  readonly orderId: string;
  /** Order owner — the airline code (AIDM: Owner). */
  readonly owner: string;
  /** Items in this order. */
  readonly orderItems: readonly OrderItem[];
  /** Passengers on this order. */
  readonly passengers: readonly OrderPassenger[];
  /** Payment records. */
  readonly payments: readonly OrderPayment[];
  /** Overall order status. */
  readonly status: OrderStatus;
  /** Ticket documents issued against this order. */
  readonly ticketDocuments: readonly TicketDocument[];
  /** ISO 8601 creation timestamp. */
  readonly createdAt: string;
  /** ISO 8601 last-modified timestamp. */
  readonly updatedAt: string;
  /** Source system. */
  readonly source?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// OrderChange (AIDM: OrderReshop + OrderChange)
// ─────────────────────────────────────────────────────────────────────────────

export type OrderChangeType = 'add' | 'remove' | 'modify';

export interface OrderChange {
  /** What kind of change. */
  readonly type: OrderChangeType;
  /** Which order item is being changed (for 'remove' and 'modify'). */
  readonly orderItemId?: string;
  /** New services to add (for 'add' and 'modify'). */
  readonly newServices?: readonly Service[];
  /** Reason for change. */
  readonly reason?: string;
}

export interface OrderChangeRequest {
  /** Order to change. */
  readonly orderId: string;
  /** Changes to apply. */
  readonly changes: readonly OrderChange[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Events — event-driven status changes (no queues)
// ─────────────────────────────────────────────────────────────────────────────

export type OrderEventType =
  | 'order.created'
  | 'order.confirmed'
  | 'order.ticketed'
  | 'order.changed'
  | 'order.cancelled'
  | 'order.payment_received'
  | 'order.payment_failed'
  | 'order.refunded';

export interface OrderEvent {
  /** Event identifier. */
  readonly eventId: string;
  /** Event type. */
  readonly type: OrderEventType;
  /** Order this event belongs to. */
  readonly orderId: string;
  /** ISO 8601 timestamp. */
  readonly timestamp: string;
  /** Event-specific data. */
  readonly data?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Operations — AIDM 24.1 message names
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Order lifecycle operations following AIDM 24.1 message naming:
 *   - OrderCreate: create an order from an offer
 *   - OrderRetrieve: fetch an existing order
 *   - OrderChange: modify an existing order
 *   - OrderCancel: cancel an order
 *
 * Implemented by adapters that support ONE Order (e.g. Navitaire).
 * Adapters that only support PNR use the BookingReference bridge
 * to translate.
 */
export interface OrderOperations {
  orderCreate(
    offer: Offer,
    passengers: readonly OrderPassenger[],
    payment: OrderPayment,
  ): Promise<Order>;

  orderRetrieve(orderId: string): Promise<Order>;

  orderChange(change: OrderChangeRequest): Promise<Order>;

  orderCancel(orderId: string, reason?: string): Promise<Order>;

  /** Retrieve the event history for an order. */
  orderViewHistory?(orderId: string): Promise<readonly OrderEvent[]>;
}
