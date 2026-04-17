/**
 * OTAIP Offers & Orders — public barrel.
 *
 * AIDM 24.1 aligned data model for the ONE Order transition.
 * Coexists with PNR types — both models work through BookingReference.
 */

// Types
export type {
  FareDetail,
  FlightService,
  LoyaltyInfo,
  Money,
  Offer,
  OfferItem,
  Order,
  OrderChange,
  OrderChangeRequest,
  OrderChangeType,
  OrderEvent,
  OrderEventType,
  OrderItem,
  OrderItemStatus,
  OrderOperations,
  OrderPassenger,
  OrderPayment,
  OrderStatus,
  PassengerTypeCode,
  Service,
  ServiceType,
  TicketDocument,
  TravelDocument,
} from './types.js';

// Schemas
export {
  fareDetailSchema,
  flightServiceSchema,
  loyaltyInfoSchema,
  moneySchema,
  offerItemSchema,
  offerSchema,
  orderChangeRequestSchema,
  orderChangeSchema,
  orderChangeTypeSchema,
  orderEventSchema,
  orderEventTypeSchema,
  orderItemSchema,
  orderItemStatusSchema,
  orderPassengerSchema,
  orderPaymentSchema,
  orderSchema,
  orderStatusSchema,
  passengerTypeCodeSchema,
  serviceSchema,
  serviceTypeSchema,
  ticketDocumentSchema,
  travelDocumentSchema,
} from './schemas.js';

// Bridge
export type {
  BookingReference,
  OrderReference,
  PnrReference,
} from './bridge.js';
export {
  createOrderReference,
  createPnrReference,
  getBookingIdentifier,
  getBookingOwner,
  isOrderReference,
  isPnrReference,
  orderToReference,
  pnrPassengerToOrderPassenger,
  supportsOrderModel,
} from './bridge.js';
