import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HOTELBEDS_CANCEL_FEE_MARKUP,
  HOTELBEDS_SOURCE_ID,
  isRefundableRate,
  mapBookingStatus,
  mapCancellationPolicy,
  mapHotelToRawResult,
  mapRate,
  parseCategoryCodeStarRating,
  summarizeBooking,
} from '../field-mapper.js';
import type { HotelbedsHotel, HotelbedsRate } from '../types.js';

describe('parseCategoryCodeStarRating', () => {
  it('extracts leading digit from "4EST"', () => {
    expect(parseCategoryCodeStarRating('4EST')).toBe(4);
  });

  it('extracts leading digit from "5LUJ"', () => {
    expect(parseCategoryCodeStarRating('5LUJ')).toBe(5);
  });

  it('returns undefined for non-numeric prefix', () => {
    expect(parseCategoryCodeStarRating('LUJ')).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(parseCategoryCodeStarRating(undefined)).toBeUndefined();
  });
});

describe('mapCancellationPolicy', () => {
  it('returns non-refundable empty policy when no policies given', () => {
    expect(mapCancellationPolicy(undefined, '2026-06-15', 'USD')).toEqual({
      refundable: false,
      deadlines: [],
      freeCancel24hrBooking: false,
    });
  });

  it('translates Hotelbeds amount/from into hours-before-checkin and applies the cancel-fee markup', () => {
    const checkIn = '2026-06-15T15:00:00Z';
    const result = mapCancellationPolicy(
      [{ amount: '305.00', from: '2026-06-13T15:00:00Z' }],
      checkIn,
      'USD',
    );
    expect(result.refundable).toBe(true);
    expect(result.deadlines).toHaveLength(1);
    expect(result.deadlines[0]).toMatchObject({
      hoursBeforeCheckin: 48,
      penaltyType: 'fixed',
      penaltyValue: Number((305 * HOTELBEDS_CANCEL_FEE_MARKUP).toFixed(2)),
      netPenaltyValue: 305,
      penaltyCurrency: 'USD',
    });
  });

  it('uses the documented HOTELBEDS_CANCEL_FEE_MARKUP constant (DQ13 = 1.25)', () => {
    expect(HOTELBEDS_CANCEL_FEE_MARKUP).toBe(1.25);
  });

  it('clamps to 0 hours when penalty already in effect', () => {
    const checkIn = '2026-06-15T15:00:00Z';
    const result = mapCancellationPolicy(
      [{ amount: '305.00', from: '2026-06-16T00:00:00Z' }],
      checkIn,
      'USD',
    );
    expect(result.deadlines[0]?.hoursBeforeCheckin).toBe(0);
  });
});

describe('isRefundableRate', () => {
  it('marks NRF as non-refundable regardless of policies', () => {
    const rate: HotelbedsRate = {
      rateKey: 'k',
      rateType: 'BOOKABLE',
      rateClass: 'NRF',
      net: '100',
      cancellationPolicies: [{ amount: '50', from: '2026-06-13T00:00:00Z' }],
    };
    expect(isRefundableRate(rate)).toBe(false);
  });

  it('marks NOR with policies as refundable', () => {
    const rate: HotelbedsRate = {
      rateKey: 'k',
      rateType: 'BOOKABLE',
      rateClass: 'NOR',
      net: '100',
      cancellationPolicies: [{ amount: '50', from: '2026-06-13T00:00:00Z' }],
    };
    expect(isRefundableRate(rate)).toBe(true);
  });

  it('marks NOR with no policies as non-refundable (no deadlines = nothing to recover)', () => {
    const rate: HotelbedsRate = {
      rateKey: 'k',
      rateType: 'BOOKABLE',
      rateClass: 'NOR',
      net: '100',
    };
    expect(isRefundableRate(rate)).toBe(false);
  });
});

describe('mapRate', () => {
  const baseRate: HotelbedsRate = {
    rateKey: 'rk-1',
    rateType: 'BOOKABLE',
    rateClass: 'NOR',
    net: '610.00',
    boardCode: 'BB',
    paymentType: 'AT_WEB',
    cancellationPolicies: [{ amount: '305.00', from: '2026-06-13T15:00:00Z' }],
  };

  it('divides net across nights for nightlyRate', () => {
    const out = mapRate(baseRate, 'STD.ST', 'USD', '2026-06-15', '2026-06-17');
    expect(out.totalRate).toBe('610.00');
    expect(out.nightlyRate).toBe('305.00');
  });

  it('passes through boardCode as mealPlan', () => {
    const out = mapRate(baseRate, 'STD.ST', 'USD', '2026-06-15', '2026-06-17');
    expect(out.mealPlan).toBe('BB');
  });

  it('uses pay_at_property when paymentType=AT_HOTEL', () => {
    const out = mapRate(
      { ...baseRate, paymentType: 'AT_HOTEL' },
      'STD.ST',
      'USD',
      '2026-06-15',
      '2026-06-17',
    );
    expect(out.paymentModel).toBe('pay_at_property');
  });

  it('treats NRF rates as non-refundable with empty deadlines', () => {
    const out = mapRate(
      { ...baseRate, rateClass: 'NRF' },
      'STD.ST',
      'USD',
      '2026-06-15',
      '2026-06-17',
    );
    expect(out.cancellationPolicy.refundable).toBe(false);
    expect(out.cancellationPolicy.deadlines).toHaveLength(0);
  });

  it('attaches non-included taxes as mandatoryFees AND folds them into the price (DQ11)', () => {
    const out = mapRate(
      {
        ...baseRate,
        taxes: {
          allIncluded: false,
          taxes: [
            { included: false, type: 'TAX', amount: '25.00', currency: 'USD' },
            { included: true, type: 'VAT', amount: '50.00', currency: 'USD' },
          ],
        },
      },
      'STD.ST',
      'USD',
      '2026-06-15',
      '2026-06-17',
    );
    // included=true taxes are dropped — already in net.
    // included=false taxes appear in mandatoryFees AND fold into totalRate.
    expect(out.mandatoryFees).toHaveLength(1);
    expect(out.mandatoryFees?.[0]?.amount).toBe('25.00');
    expect(out.totalRate).toBe('635.00'); // 610 + 25
    expect(out.nightlyRate).toBe('317.50'); // 635 / 2 nights
  });

  it('does not double-count fees when allIncluded=true', () => {
    const out = mapRate(
      {
        ...baseRate,
        taxes: {
          allIncluded: true,
          taxes: [{ included: true, type: 'TAX', amount: '25.00', currency: 'USD' }],
        },
      },
      'STD.ST',
      'USD',
      '2026-06-15',
      '2026-06-17',
    );
    expect(out.totalRate).toBe('610.00');
    expect(out.mandatoryFees).toBeUndefined();
  });

  it('keeps cross-currency fees on mandatoryFees but does not fold them', () => {
    const out = mapRate(
      {
        ...baseRate,
        taxes: {
          allIncluded: false,
          taxes: [{ included: false, type: 'TAX', amount: '20.00', currency: 'EUR' }],
        },
      },
      'STD.ST',
      'USD',
      '2026-06-15',
      '2026-06-17',
    );
    expect(out.mandatoryFees).toHaveLength(1);
    expect(out.mandatoryFees?.[0]?.currency).toBe('EUR');
    expect(out.totalRate).toBe('610.00'); // EUR fee NOT folded into USD total
  });
});

describe('mapHotelToRawResult', () => {
  const hotel: HotelbedsHotel = {
    code: 12345,
    name: 'Mock Bedbank Resort Orlando',
    categoryCode: '4EST',
    countryCode: 'US',
    stateCode: 'FL',
    postalCode: '32830',
    city: 'Orlando',
    address: { content: '1500 Mock Resort Blvd' },
    latitude: '28.3852',
    longitude: '-81.5639',
    currency: 'USD',
    chainCode: 'MOK',
    rooms: [
      {
        code: 'STD.ST',
        name: 'STANDARD ROOM',
        rates: [
          {
            rateKey: 'rk-1',
            rateType: 'BOOKABLE',
            rateClass: 'NOR',
            net: '610.00',
            cancellationPolicies: [{ amount: '305.00', from: '2026-06-13T15:00:00Z' }],
          },
        ],
      },
    ],
  };

  it('maps source identifier with hotelbeds sourceId and string property id', () => {
    const result = mapHotelToRawResult(hotel, { checkIn: '2026-06-15', checkOut: '2026-06-17' });
    expect(result.source.sourceId).toBe(HOTELBEDS_SOURCE_ID);
    expect(result.source.sourcePropertyId).toBe('12345');
  });

  it('maps coordinates from string to number', () => {
    const result = mapHotelToRawResult(hotel, { checkIn: '2026-06-15', checkOut: '2026-06-17' });
    expect(result.coordinates.latitude).toBeCloseTo(28.3852);
    expect(result.coordinates.longitude).toBeCloseTo(-81.5639);
  });

  it('extracts star rating from categoryCode', () => {
    const result = mapHotelToRawResult(hotel, { checkIn: '2026-06-15', checkOut: '2026-06-17' });
    expect(result.starRating).toBe(4);
  });

  it('flattens rooms × rates into one rates array', () => {
    const result = mapHotelToRawResult(hotel, { checkIn: '2026-06-15', checkOut: '2026-06-17' });
    expect(result.rates).toHaveLength(1);
    expect(result.rates[0]?.rateId).toBe('rk-1');
  });

  it('stamps response latency on the source', () => {
    const result = mapHotelToRawResult(hotel, {
      checkIn: '2026-06-15',
      checkOut: '2026-06-17',
      responseLatencyMs: 42,
    });
    expect(result.source.responseLatencyMs).toBe(42);
  });
});

describe('mapBookingStatus', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('maps CONFIRMED → confirmed', () => {
    expect(mapBookingStatus('CONFIRMED')).toBe('confirmed');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('maps CANCELLED → cancelled', () => {
    expect(mapBookingStatus('CANCELLED')).toBe('cancelled');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('maps ON_REQUEST → pending (DQ14)', () => {
    expect(mapBookingStatus('ON_REQUEST')).toBe('pending');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('maps PENDING → pending', () => {
    expect(mapBookingStatus('PENDING')).toBe('pending');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns and defaults unknown to pending', () => {
    expect(mapBookingStatus('SOMETHING_NEW')).toBe('pending');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown booking status "SOMETHING_NEW"'),
    );
  });
});

describe('summarizeBooking', () => {
  it('summarizes a confirmed booking', () => {
    const summary = summarizeBooking({
      reference: 'HB-1',
      status: 'CONFIRMED',
      creationDate: '2026-04-18T12:00:00Z',
      totalNet: '610.00',
      currency: 'USD',
      hotel: { code: 12345, name: 'Mock' },
      clientReference: 'trip-9',
    });
    expect(summary).toMatchObject({
      reference: 'HB-1',
      status: 'confirmed',
      totalCharged: { amount: '610.00', currency: 'USD' },
      hotelCode: '12345',
      clientReference: 'trip-9',
    });
  });
});
