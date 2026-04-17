import { describe, expect, it } from 'vitest';
import {
  createPnrReference,
  createOrderReference,
  isPnrReference,
  isOrderReference,
  getBookingIdentifier,
  getBookingOwner,
  pnrPassengerToOrderPassenger,
  orderToReference,
  supportsOrderModel,
} from '../bridge.js';
import type { Order } from '../types.js';

describe('BookingReference constructors', () => {
  it('creates a PNR reference', () => {
    const ref = createPnrReference('ABC123', 'AMADEUS', 'BA');
    expect(ref.type).toBe('pnr');
    expect(ref.recordLocator).toBe('ABC123');
    expect(ref.gds).toBe('AMADEUS');
    expect(ref.airline).toBe('BA');
  });

  it('creates an Order reference', () => {
    const ref = createOrderReference('ORD-001', 'BA');
    expect(ref.type).toBe('order');
    expect(ref.orderId).toBe('ORD-001');
    expect(ref.owner).toBe('BA');
  });
});

describe('Type guards', () => {
  it('isPnrReference returns true for PNR', () => {
    expect(isPnrReference(createPnrReference('ABC123'))).toBe(true);
  });
  it('isPnrReference returns false for Order', () => {
    expect(isPnrReference(createOrderReference('ORD-001', 'BA'))).toBe(false);
  });
  it('isOrderReference returns true for Order', () => {
    expect(isOrderReference(createOrderReference('ORD-001', 'BA'))).toBe(true);
  });
  it('isOrderReference returns false for PNR', () => {
    expect(isOrderReference(createPnrReference('ABC123'))).toBe(false);
  });
});

describe('getBookingIdentifier', () => {
  it('returns record locator for PNR', () => {
    expect(getBookingIdentifier(createPnrReference('ABC123'))).toBe('ABC123');
  });
  it('returns orderId for Order', () => {
    expect(getBookingIdentifier(createOrderReference('ORD-001', 'BA'))).toBe('ORD-001');
  });
});

describe('getBookingOwner', () => {
  it('returns airline for PNR with airline', () => {
    expect(getBookingOwner(createPnrReference('ABC', 'AMADEUS', 'BA'))).toBe('BA');
  });
  it('returns GDS for PNR without airline', () => {
    expect(getBookingOwner(createPnrReference('ABC', 'SABRE'))).toBe('SABRE');
  });
  it('returns owner for Order', () => {
    expect(getBookingOwner(createOrderReference('ORD-001', 'BA'))).toBe('BA');
  });
});

describe('supportsOrderModel', () => {
  it('returns false for PNR', () => {
    expect(supportsOrderModel(createPnrReference('ABC'))).toBe(false);
  });
  it('returns true for Order', () => {
    expect(supportsOrderModel(createOrderReference('ORD', 'BA'))).toBe(true);
  });
});

describe('pnrPassengerToOrderPassenger', () => {
  it('maps basic PNR passenger', () => {
    const result = pnrPassengerToOrderPassenger({
      lastName: 'TEST',
      firstName: 'JOHN',
      passengerType: 'ADT',
    }, 'pax-1');

    expect(result.passengerId).toBe('pax-1');
    expect(result.surname).toBe('TEST');
    expect(result.givenName).toBe('JOHN');
    expect(result.passengerType).toBe('ADT');
    expect(result.travelDocument).toBeUndefined();
  });

  it('maps gender M → Male', () => {
    const result = pnrPassengerToOrderPassenger({
      lastName: 'A', firstName: 'B', passengerType: 'ADT', gender: 'M',
    }, 'pax-1');
    expect(result.gender).toBe('Male');
  });

  it('maps gender F → Female', () => {
    const result = pnrPassengerToOrderPassenger({
      lastName: 'A', firstName: 'B', passengerType: 'ADT', gender: 'F',
    }, 'pax-1');
    expect(result.gender).toBe('Female');
  });

  it('maps passport when all fields present', () => {
    const result = pnrPassengerToOrderPassenger({
      lastName: 'TEST', firstName: 'JOHN', passengerType: 'ADT',
      passportNumber: 'AB1234567', passportExpiry: '2030-06-15',
      passportCountry: 'US', nationality: 'US',
    }, 'pax-1');

    expect(result.travelDocument).toEqual({
      documentType: 'passport',
      documentNumber: 'AB1234567',
      issuingCountry: 'US',
      expiryDate: '2030-06-15',
      nationality: 'US',
    });
  });

  it('omits passport when fields are partial', () => {
    const result = pnrPassengerToOrderPassenger({
      lastName: 'TEST', firstName: 'JOHN', passengerType: 'ADT',
      passportNumber: 'AB123',
      // Missing: passportExpiry, passportCountry, nationality
    }, 'pax-1');
    expect(result.travelDocument).toBeUndefined();
  });
});

describe('orderToReference', () => {
  it('creates OrderReference from Order', () => {
    const order: Order = {
      orderId: 'ORD-001',
      owner: 'BA',
      orderItems: [],
      passengers: [],
      payments: [],
      status: 'confirmed',
      ticketDocuments: [],
      createdAt: '2026-04-20T12:00:00Z',
      updatedAt: '2026-04-20T12:00:00Z',
    };
    const ref = orderToReference(order);
    expect(ref.type).toBe('order');
    expect(ref.orderId).toBe('ORD-001');
    expect(ref.owner).toBe('BA');
  });
});
