import { describe, expect, it } from 'vitest';
import {
  moneySchema,
  serviceSchema,
  offerSchema,
  offerItemSchema,
  orderSchema,
  orderItemSchema,
  orderPassengerSchema,
  orderPaymentSchema,
  ticketDocumentSchema,
  orderChangeRequestSchema,
  orderEventSchema,
  fareDetailSchema,
  flightServiceSchema,
  travelDocumentSchema,
  loyaltyInfoSchema,
} from '../schemas.js';

describe('Money schema', () => {
  it('accepts valid money', () => {
    expect(moneySchema.safeParse({ amount: '450.00', currencyCode: 'USD' }).success).toBe(true);
  });
  it('rejects missing currency', () => {
    expect(moneySchema.safeParse({ amount: '100' }).success).toBe(false);
  });
  it('rejects non-3-char currency', () => {
    expect(moneySchema.safeParse({ amount: '100', currencyCode: 'US' }).success).toBe(false);
  });
});

describe('FlightService schema', () => {
  const valid = {
    marketingCarrier: 'BA',
    flightNumber: '112',
    origin: 'LHR',
    destination: 'JFK',
    departureDateTime: '2026-05-01T18:00:00Z',
    arrivalDateTime: '2026-05-01T21:00:00Z',
    durationMinutes: 420,
  };
  it('accepts valid flight', () => {
    expect(flightServiceSchema.safeParse(valid).success).toBe(true);
  });
  it('accepts optional fields', () => {
    expect(flightServiceSchema.safeParse({ ...valid, cabinClass: 'business', bookingClass: 'J', fareBasis: 'JOWUS' }).success).toBe(true);
  });
  it('rejects invalid cabin class', () => {
    expect(flightServiceSchema.safeParse({ ...valid, cabinClass: 'luxury' }).success).toBe(false);
  });
});

describe('Service schema', () => {
  it('accepts flight service', () => {
    const result = serviceSchema.safeParse({
      serviceId: 'svc-1',
      type: 'flight',
      flight: {
        marketingCarrier: 'BA', flightNumber: '112', origin: 'LHR', destination: 'JFK',
        departureDateTime: '2026-05-01T18:00:00Z', arrivalDateTime: '2026-05-01T21:00:00Z', durationMinutes: 420,
      },
    });
    expect(result.success).toBe(true);
  });
  it('accepts ancillary service with description', () => {
    expect(serviceSchema.safeParse({ serviceId: 'svc-2', type: 'baggage', description: '23kg checked bag' }).success).toBe(true);
  });
  it('rejects unknown service type', () => {
    expect(serviceSchema.safeParse({ serviceId: 'x', type: 'spa' }).success).toBe(false);
  });
});

describe('OrderPassenger schema', () => {
  const valid = { passengerId: 'pax-1', passengerType: 'ADT', givenName: 'John', surname: 'Test' };
  it('accepts minimal passenger', () => {
    expect(orderPassengerSchema.safeParse(valid).success).toBe(true);
  });
  it('accepts passenger with travel document', () => {
    expect(orderPassengerSchema.safeParse({
      ...valid,
      travelDocument: { documentType: 'passport', documentNumber: 'AB123', issuingCountry: 'US', expiryDate: '2030-01-01', nationality: 'US' },
    }).success).toBe(true);
  });
  it('accepts passenger with loyalty info', () => {
    expect(orderPassengerSchema.safeParse({
      ...valid,
      loyaltyProgram: { programCode: 'BA', memberNumber: '12345', tierLevel: 'Gold' },
    }).success).toBe(true);
  });
  it('rejects empty given name', () => {
    expect(orderPassengerSchema.safeParse({ ...valid, givenName: '' }).success).toBe(false);
  });
});

describe('Offer schema', () => {
  const validOffer = {
    offerId: 'offer-1',
    owner: 'BA',
    offerItems: [{
      offerItemId: 'oi-1',
      services: [{ serviceId: 'svc-1', type: 'flight' }],
      price: { amount: '450.00', currencyCode: 'USD' },
    }],
    totalPrice: { amount: '450.00', currencyCode: 'USD' },
    expiresAt: '2026-05-01T23:59:59Z',
  };
  it('accepts valid offer', () => {
    expect(offerSchema.safeParse(validOffer).success).toBe(true);
  });
  it('rejects empty offer items', () => {
    expect(offerSchema.safeParse({ ...validOffer, offerItems: [] }).success).toBe(false);
  });
  it('accepts offer with fare detail', () => {
    const withFare = {
      ...validOffer,
      offerItems: [{
        ...validOffer.offerItems[0],
        fareDetail: { fareBasis: 'YOW', refundable: true, changeable: true },
      }],
    };
    expect(offerSchema.safeParse(withFare).success).toBe(true);
  });
});

describe('Order schema', () => {
  const validOrder = {
    orderId: 'ORD-001',
    owner: 'BA',
    orderItems: [{
      orderItemId: 'item-1',
      offerItemRef: 'oi-1',
      services: [{ serviceId: 'svc-1', type: 'flight' }],
      status: 'confirmed',
      price: { amount: '450.00', currencyCode: 'USD' },
    }],
    passengers: [{ passengerId: 'pax-1', passengerType: 'ADT', givenName: 'John', surname: 'Test' }],
    payments: [],
    status: 'confirmed',
    ticketDocuments: [],
    createdAt: '2026-04-20T12:00:00Z',
    updatedAt: '2026-04-20T12:00:00Z',
  };
  it('accepts valid order', () => {
    expect(orderSchema.safeParse(validOrder).success).toBe(true);
  });
  it('accepts order with ticket documents', () => {
    const withTickets = {
      ...validOrder,
      status: 'ticketed',
      ticketDocuments: [{
        ticketNumber: '125-1234567890',
        documentType: 'ET',
        passengerRef: 'pax-1',
        couponNumbers: [1, 2],
        issueDate: '2026-04-20',
      }],
    };
    expect(orderSchema.safeParse(withTickets).success).toBe(true);
  });
  it('accepts order with payments', () => {
    const withPayment = {
      ...validOrder,
      payments: [{
        paymentId: 'pay-1',
        method: 'credit_card',
        amount: { amount: '450.00', currencyCode: 'USD' },
        status: 'completed',
        processedAt: '2026-04-20T12:05:00Z',
      }],
    };
    expect(orderSchema.safeParse(withPayment).success).toBe(true);
  });
  it('rejects invalid order status', () => {
    expect(orderSchema.safeParse({ ...validOrder, status: 'invalid' }).success).toBe(false);
  });
});

describe('OrderChangeRequest schema', () => {
  it('accepts valid change request', () => {
    expect(orderChangeRequestSchema.safeParse({
      orderId: 'ORD-001',
      changes: [{ type: 'remove', orderItemId: 'item-1', reason: 'schedule change' }],
    }).success).toBe(true);
  });
  it('rejects empty changes array', () => {
    expect(orderChangeRequestSchema.safeParse({ orderId: 'ORD-001', changes: [] }).success).toBe(false);
  });
  it('accepts add change with new services', () => {
    expect(orderChangeRequestSchema.safeParse({
      orderId: 'ORD-001',
      changes: [{ type: 'add', newServices: [{ serviceId: 'bag-1', type: 'baggage', description: '23kg' }] }],
    }).success).toBe(true);
  });
});

describe('OrderEvent schema', () => {
  it('accepts valid event', () => {
    expect(orderEventSchema.safeParse({
      eventId: 'evt-1',
      type: 'order.created',
      orderId: 'ORD-001',
      timestamp: '2026-04-20T12:00:00Z',
    }).success).toBe(true);
  });
  it('accepts event with data', () => {
    expect(orderEventSchema.safeParse({
      eventId: 'evt-2',
      type: 'order.payment_received',
      orderId: 'ORD-001',
      timestamp: '2026-04-20T12:05:00Z',
      data: { paymentId: 'pay-1', amount: '450.00' },
    }).success).toBe(true);
  });
  it('rejects invalid event type', () => {
    expect(orderEventSchema.safeParse({
      eventId: 'x', type: 'order.exploded', orderId: 'x', timestamp: 'x',
    }).success).toBe(false);
  });
});

describe('FareDetail schema', () => {
  it('accepts minimal fare detail', () => {
    expect(fareDetailSchema.safeParse({ fareBasis: 'YOW' }).success).toBe(true);
  });
  it('accepts full fare detail', () => {
    expect(fareDetailSchema.safeParse({
      fareBasis: 'YOW', fareType: 'published', refundable: true, changeable: true, baggageAllowance: '2PC',
    }).success).toBe(true);
  });
});
