import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  mapSearchResults,
  mapPropertyDetail,
  mapBookingResponse,
  mapVerifyResponse,
  mapModifyResponse,
  mapCancelResponse,
  toDecimalString,
} from '../mapper.js';
import type {
  HaipSearchResponse,
  HaipProperty,
  HaipBookResponse,
  HaipBookingStatusResponse,
  HaipModifyResponse,
  HaipCancelResponse,
} from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProperty(overrides?: Partial<HaipProperty>): HaipProperty {
  return {
    id: 'prop-001',
    name: 'Telivity Grand Hotel',
    address: {
      line1: '123 Main St',
      city: 'New York',
      stateProvince: 'NY',
      postalCode: '10001',
      countryCode: 'US',
    },
    coordinates: { latitude: 40.7128, longitude: -74.006 },
    chainCode: 'TG',
    chainName: 'Telivity',
    starRating: 4,
    amenities: ['WiFi', 'Pool', 'Gym'],
    roomTypes: [
      {
        roomTypeId: 'rt-std-k',
        code: 'KNG',
        name: 'Standard King',
        maxOccupancy: 2,
        bedType: 'King',
      },
    ],
    rates: [
      {
        rateId: 'rate-001',
        roomTypeId: 'rt-std-k',
        nightlyRate: '199.99',
        totalRate: '399.98',
        currency: 'USD',
        rateType: 'bar',
        paymentModel: 'pay_at_property',
        cancellationPolicy: {
          refundable: true,
          cancellationDeadline: '2026-04-06T14:00:00Z',
          penalties: [
            {
              hoursBeforeCheckin: 24,
              penaltyType: 'nights',
              penaltyValue: 1,
            },
          ],
        },
        nightlyBreakdown: [
          { date: '2026-04-07', amount: '199.99', currency: 'USD' },
          { date: '2026-04-08', amount: '199.99', currency: 'USD' },
        ],
        mandatoryFees: [
          {
            type: 'resort_fee',
            amount: '25.00',
            currency: 'USD',
            perUnit: 'per_night',
          },
        ],
        taxAmount: '35.60',
      },
    ],
    photos: [
      {
        url: 'https://haip.example.com/photos/exterior.jpg',
        caption: 'Hotel Exterior',
        category: 'exterior',
      },
    ],
    description: 'A beautiful hotel in the heart of the city.',
    contactInfo: {
      phone: '+1-555-0100',
      email: 'info@telivitygrand.com',
    },
    contentCompleteness: 92,
    ...overrides,
  };
}

function makeSearchResponse(
  properties?: HaipProperty[],
): HaipSearchResponse {
  return {
    properties: properties ?? [makeProperty()],
    totalResults: (properties ?? [makeProperty()]).length,
  };
}

function makeBookResponse(
  overrides?: Partial<HaipBookResponse>,
): HaipBookResponse {
  return {
    confirmationNumber: 'HAIP-12345',
    externalConfirmationCode: 'OTAIP-EXT-001',
    status: 'confirmed',
    propertyId: 'prop-001',
    propertyName: 'Telivity Grand Hotel',
    roomTypeName: 'Standard King',
    checkIn: '2026-04-07',
    checkOut: '2026-04-09',
    rooms: 1,
    guest: { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
    totalAmount: '449.58',
    currency: 'USD',
    cancellationDeadline: '2026-04-06T14:00:00Z',
    createdAt: '2026-04-01T10:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// toDecimalString
// ---------------------------------------------------------------------------

describe('toDecimalString', () => {
  it('converts string numbers', () => {
    expect(toDecimalString('199.99')).toBe('199.99');
  });

  it('converts numeric values', () => {
    expect(toDecimalString(42)).toBe('42');
  });

  it('returns "0" for undefined/null/empty', () => {
    expect(toDecimalString(undefined)).toBe('0');
    expect(toDecimalString(null)).toBe('0');
    expect(toDecimalString('')).toBe('0');
  });

  it('preserves decimal precision', () => {
    const result = toDecimalString('100.10');
    expect(new Decimal(result).equals(new Decimal('100.10'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mapSearchResults
// ---------------------------------------------------------------------------

describe('mapSearchResults', () => {
  it('maps a full search response', () => {
    const results = mapSearchResults(makeSearchResponse());

    expect(results).toHaveLength(1);
    const r = results[0]!;

    expect(r.source.sourceId).toBe('haip');
    expect(r.source.sourcePropertyId).toBe('prop-001');
    expect(r.propertyName).toBe('Telivity Grand Hotel');
    expect(r.address.city).toBe('New York');
    expect(r.coordinates.latitude).toBe(40.7128);
    expect(r.chainCode).toBe('TG');
    expect(r.starRating).toBe(4);
    expect(r.amenities).toEqual(['WiFi', 'Pool', 'Gym']);
  });

  it('passes content completeness as qualityScore', () => {
    const results = mapSearchResults(makeSearchResponse());
    expect(results[0]!.source.qualityScore).toBe(92);
  });

  it('preserves nightly breakdown', () => {
    const results = mapSearchResults(makeSearchResponse());
    const rate = results[0]!.rates[0]!;

    expect(rate.nightlyBreakdown).toBeDefined();
    expect(rate.nightlyBreakdown).toHaveLength(2);
    expect(rate.nightlyBreakdown![0]!.date).toBe('2026-04-07');
    expect(rate.nightlyBreakdown![0]!.amount).toBe('199.99');
  });

  it('maps room types correctly', () => {
    const results = mapSearchResults(makeSearchResponse());
    const room = results[0]!.roomTypes[0]!;

    expect(room.roomTypeId).toBe('rt-std-k');
    expect(room.code).toBe('KNG');
    expect(room.description).toBe('Standard King');
    expect(room.maxOccupancy).toBe(2);
    expect(room.bedTypeRaw).toBe('King');
  });

  it('maps rates with decimal precision', () => {
    const results = mapSearchResults(makeSearchResponse());
    const rate = results[0]!.rates[0]!;

    expect(rate.nightlyRate).toBe('199.99');
    expect(rate.totalRate).toBe('399.98');
    expect(rate.currency).toBe('USD');
    expect(rate.taxAmount).toBe('35.6');
  });

  it('maps cancellation policy', () => {
    const results = mapSearchResults(makeSearchResponse());
    const policy = results[0]!.rates[0]!.cancellationPolicy;

    expect(policy.refundable).toBe(true);
    expect(policy.deadlines).toHaveLength(1);
    expect(policy.deadlines[0]!.hoursBeforeCheckin).toBe(24);
    expect(policy.deadlines[0]!.penaltyType).toBe('nights');
    expect(policy.deadlines[0]!.penaltyValue).toBe(1);
  });

  it('maps mandatory fees with decimal precision', () => {
    const results = mapSearchResults(makeSearchResponse());
    const fees = results[0]!.rates[0]!.mandatoryFees;

    expect(fees).toBeDefined();
    expect(fees).toHaveLength(1);
    expect(fees![0]!.type).toBe('resort_fee');
    expect(fees![0]!.amount).toBe('25');
    expect(fees![0]!.perUnit).toBe('per_night');
  });

  it('defaults unknown rate types to bar', () => {
    const prop = makeProperty();
    prop.rates[0]!.rateType = 'unknown_type';
    const results = mapSearchResults(makeSearchResponse([prop]));
    expect(results[0]!.rates[0]!.rateType).toBe('bar');
  });

  it('defaults unknown payment models to pay_at_property', () => {
    const prop = makeProperty();
    prop.rates[0]!.paymentModel = 'bitcoin';
    const results = mapSearchResults(makeSearchResponse([prop]));
    expect(results[0]!.rates[0]!.paymentModel).toBe('pay_at_property');
  });

  it('handles empty properties array', () => {
    const results = mapSearchResults({ properties: [], totalResults: 0 });
    expect(results).toEqual([]);
  });

  it('handles property with no photos', () => {
    const prop = makeProperty({ photos: [] });
    const results = mapSearchResults(makeSearchResponse([prop]));
    expect(results[0]!.photos).toEqual([]);
  });

  it('handles property with no amenities', () => {
    const prop = makeProperty({ amenities: [] });
    const results = mapSearchResults(makeSearchResponse([prop]));
    expect(results[0]!.amenities).toEqual([]);
  });

  it('handles property with no contentCompleteness', () => {
    const prop = makeProperty({ contentCompleteness: undefined });
    const results = mapSearchResults(makeSearchResponse([prop]));
    expect(results[0]!.source.qualityScore).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// mapPropertyDetail
// ---------------------------------------------------------------------------

describe('mapPropertyDetail', () => {
  it('maps a single property', () => {
    const result = mapPropertyDetail(makeProperty());

    expect(result.source.sourceId).toBe('haip');
    expect(result.propertyName).toBe('Telivity Grand Hotel');
    expect(result.rates).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// mapBookingResponse
// ---------------------------------------------------------------------------

describe('mapBookingResponse', () => {
  it('maps 3-layer confirmation codes', () => {
    const result = mapBookingResponse(makeBookResponse());

    expect(result.confirmation.crsConfirmation).toBe('HAIP-12345');
    expect(result.confirmation.pmsConfirmation).toBe('HAIP-12345');
    expect(result.confirmation.channelConfirmation).toBe('OTAIP-EXT-001');
    expect(result.confirmation.source.sourceId).toBe('haip');
  });

  it('uses externalRef fallback for channelConfirmation', () => {
    const response = makeBookResponse({ externalConfirmationCode: undefined });
    const result = mapBookingResponse(response, 'FALLBACK-REF');

    expect(result.confirmation.channelConfirmation).toBe('FALLBACK-REF');
  });

  it('maps booking status as confirmed (auto-confirm)', () => {
    const result = mapBookingResponse(makeBookResponse());
    expect(result.status).toBe('confirmed');
  });

  it('maps total amount with decimal precision', () => {
    const result = mapBookingResponse(makeBookResponse());
    expect(result.totalAmount).toBe('449.58');
    expect(new Decimal(result.totalAmount).isFinite()).toBe(true);
  });

  it('preserves free cancellation deadline', () => {
    const result = mapBookingResponse(makeBookResponse());
    expect(result.freeCancellationUntil).toBe('2026-04-06T14:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// mapVerifyResponse
// ---------------------------------------------------------------------------

describe('mapVerifyResponse', () => {
  it('maps verification with all fields matching', () => {
    const response: HaipBookingStatusResponse = {
      confirmationNumber: 'HAIP-12345',
      externalConfirmationCode: 'OTAIP-EXT-001',
      reservationStatus: 'confirmed',
      propertyId: 'prop-001',
      propertyName: 'Telivity Grand Hotel',
      roomTypeName: 'Standard King',
      checkIn: '2026-04-07',
      checkOut: '2026-04-09',
      rooms: 1,
      guest: { firstName: 'John', lastName: 'Doe' },
      totalAmount: '449.58',
      currency: 'USD',
      verification: {
        rateMatch: true,
        roomMatch: true,
        datesMatch: true,
        guestMatch: true,
        allMatch: true,
      },
      updatedAt: '2026-04-01T10:00:00Z',
    };

    const result = mapVerifyResponse(response);

    expect(result.syncStatus).toBe('IN_SYNC');
    expect(result.rateVerified).toBe(true);
    expect(result.roomVerified).toBe(true);
    expect(result.datesVerified).toBe(true);
    expect(result.guestVerified).toBe(true);
    expect(result.status).toBe('confirmed');
  });

  it('maps MISMATCH when not all fields match', () => {
    const response: HaipBookingStatusResponse = {
      confirmationNumber: 'HAIP-12345',
      reservationStatus: 'confirmed',
      propertyId: 'prop-001',
      propertyName: 'Telivity Grand Hotel',
      roomTypeName: 'Standard King',
      checkIn: '2026-04-07',
      checkOut: '2026-04-09',
      rooms: 1,
      guest: { firstName: 'John', lastName: 'Doe' },
      totalAmount: '449.58',
      currency: 'USD',
      verification: {
        rateMatch: false,
        roomMatch: true,
        datesMatch: true,
        guestMatch: true,
        allMatch: false,
      },
      updatedAt: '2026-04-01T10:00:00Z',
    };

    const result = mapVerifyResponse(response);
    expect(result.syncStatus).toBe('MISMATCH');
    expect(result.rateVerified).toBe(false);
  });

  it('handles missing verification object', () => {
    const response: HaipBookingStatusResponse = {
      confirmationNumber: 'HAIP-12345',
      reservationStatus: 'confirmed',
      propertyId: 'prop-001',
      propertyName: 'Telivity Grand Hotel',
      roomTypeName: 'Standard King',
      checkIn: '2026-04-07',
      checkOut: '2026-04-09',
      rooms: 1,
      guest: { firstName: 'John', lastName: 'Doe' },
      totalAmount: '449.58',
      currency: 'USD',
      updatedAt: '2026-04-01T10:00:00Z',
    };

    const result = mapVerifyResponse(response);
    expect(result.syncStatus).toBe('MISMATCH');
    expect(result.rateVerified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mapModifyResponse
// ---------------------------------------------------------------------------

describe('mapModifyResponse', () => {
  it('maps modification response', () => {
    const response: HaipModifyResponse = {
      confirmationNumber: 'HAIP-12345',
      externalConfirmationCode: 'OTAIP-EXT-001',
      status: 'modified',
      propertyId: 'prop-001',
      propertyName: 'Telivity Grand Hotel',
      roomTypeName: 'Deluxe King',
      checkIn: '2026-04-07',
      checkOut: '2026-04-10',
      rooms: 1,
      guest: { firstName: 'John', lastName: 'Doe' },
      totalAmount: '649.97',
      currency: 'USD',
      modifiedAt: '2026-04-02T10:00:00Z',
    };

    const result = mapModifyResponse(response);

    expect(result.confirmation.crsConfirmation).toBe('HAIP-12345');
    expect(result.status).toBe('modified');
    expect(result.totalAmount).toBe('649.97');
    expect(result.checkOut).toBe('2026-04-10');
  });
});

// ---------------------------------------------------------------------------
// mapCancelResponse
// ---------------------------------------------------------------------------

describe('mapCancelResponse', () => {
  it('maps cancellation with fee', () => {
    const response: HaipCancelResponse = {
      confirmationNumber: 'HAIP-12345',
      status: 'cancelled',
      cancellationFee: '199.99',
      cancellationCurrency: 'USD',
      message: 'One night penalty applied',
      cancelledAt: '2026-04-03T10:00:00Z',
    };

    const result = mapCancelResponse(response);

    expect(result.confirmationNumber).toBe('HAIP-12345');
    expect(result.status).toBe('cancelled');
    expect(result.cancellationFee).toBe('199.99');
    expect(result.message).toBe('One night penalty applied');
  });

  it('maps free cancellation (no fee)', () => {
    const response: HaipCancelResponse = {
      confirmationNumber: 'HAIP-12345',
      status: 'cancelled',
      message: 'Free cancellation',
      cancelledAt: '2026-04-03T10:00:00Z',
    };

    const result = mapCancelResponse(response);

    expect(result.cancellationFee).toBeUndefined();
    expect(result.cancellationCurrency).toBeUndefined();
  });
});
