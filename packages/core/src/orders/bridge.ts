/**
 * BookingReference bridge — PNR ↔ Order mapping.
 *
 * The travel industry is mid-transition. Some carriers use PNRs (GDS),
 * some use Orders (ONE Order / NDC). OTAIP agents accept
 * BookingReference and let the adapter/router decide the underlying
 * model.
 *
 * Queue management stays PNR-only. Orders use event-driven status
 * changes (OrderEvent), not queues.
 *
 * Usage:
 *   const ref = createPnrReference('ABC123', 'AMADEUS');
 *   const ref = createOrderReference('ORD-001', 'BA');
 *   if (isPnrReference(ref)) { ... }
 *   if (isOrderReference(ref)) { ... }
 */

import type { Order, OrderPassenger } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// BookingReference — the union type
// ─────────────────────────────────────────────────────────────────────────────

export interface PnrReference {
  readonly type: 'pnr';
  /** 5-8 character alphanumeric record locator. */
  readonly recordLocator: string;
  /** GDS system that owns the PNR. */
  readonly gds?: string;
  /** Airline code (for airline-hosted PNRs). */
  readonly airline?: string;
}

export interface OrderReference {
  readonly type: 'order';
  /** Unique order ID from the carrier/supplier. */
  readonly orderId: string;
  /** Order owner airline code. */
  readonly owner: string;
}

export type BookingReference = PnrReference | OrderReference;

// ─────────────────────────────────────────────────────────────────────────────
// Constructors
// ─────────────────────────────────────────────────────────────────────────────

export function createPnrReference(
  recordLocator: string,
  gds?: string,
  airline?: string,
): PnrReference {
  return { type: 'pnr', recordLocator, gds, airline };
}

export function createOrderReference(
  orderId: string,
  owner: string,
): OrderReference {
  return { type: 'order', orderId, owner };
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

export function isPnrReference(ref: BookingReference): ref is PnrReference {
  return ref.type === 'pnr';
}

export function isOrderReference(ref: BookingReference): ref is OrderReference {
  return ref.type === 'order';
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a human-readable booking identifier from either reference type.
 * For PNR: the record locator. For Order: the order ID.
 */
export function getBookingIdentifier(ref: BookingReference): string {
  return isPnrReference(ref) ? ref.recordLocator : ref.orderId;
}

/**
 * Extract the responsible party (GDS or airline) from either reference type.
 */
export function getBookingOwner(ref: BookingReference): string | undefined {
  return isPnrReference(ref) ? (ref.airline ?? ref.gds) : ref.owner;
}

/**
 * Convert a PNR-style passenger record to the Order passenger model.
 *
 * This is the bridge function that adapters use when converting
 * GDS PNR data to the Order model. The inverse (Order → PNR) is
 * handled by the PnrBuilder agent.
 */
export function pnrPassengerToOrderPassenger(
  pnr: {
    lastName: string;
    firstName: string;
    title?: string;
    passengerType: 'ADT' | 'CHD' | 'INF';
    dateOfBirth?: string;
    gender?: 'M' | 'F';
    email?: string;
    phone?: string;
    passportNumber?: string;
    passportExpiry?: string;
    passportCountry?: string;
    nationality?: string;
  },
  passengerId: string,
): OrderPassenger {
  return {
    passengerId,
    passengerType: pnr.passengerType,
    givenName: pnr.firstName,
    surname: pnr.lastName,
    title: pnr.title,
    dateOfBirth: pnr.dateOfBirth,
    gender: pnr.gender === 'M' ? 'Male' : pnr.gender === 'F' ? 'Female' : undefined,
    email: pnr.email,
    phone: pnr.phone,
    travelDocument:
      pnr.passportNumber && pnr.passportCountry && pnr.nationality && pnr.passportExpiry
        ? {
            documentType: 'passport',
            documentNumber: pnr.passportNumber,
            issuingCountry: pnr.passportCountry,
            expiryDate: pnr.passportExpiry,
            nationality: pnr.nationality,
          }
        : undefined,
  };
}

/**
 * Create a BookingReference from an Order object.
 */
export function orderToReference(order: Order): OrderReference {
  return createOrderReference(order.orderId, order.owner);
}

/**
 * Determine whether a booking reference points to a system that
 * supports Order operations. Used by GdsNdcRouter to decide whether
 * to use OrderCreate or PNR-based booking.
 */
export function supportsOrderModel(ref: BookingReference): boolean {
  return ref.type === 'order';
}
