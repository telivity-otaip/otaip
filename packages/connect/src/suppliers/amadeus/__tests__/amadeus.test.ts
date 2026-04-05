import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CreateBookingInput, SearchFlightsInput } from '../../../types.js';
import { validateAmadeusConfig } from '../config.js';
import {
  mapCabinClass,
  mapCreateBookingRequest,
  mapCreateBookingResponse,
  mapGetBookingResponse,
  mapPaxType,
  mapPriceResponse,
  mapSearchParams,
  mapSearchResponse,
  reverseMapCabinClass,
  reverseMapPaxType,
  toMoney,
} from '../mapper.js';
import type {
  AmadeusFlightOffer,
  AmadeusFlightOrder,
} from '../types.js';

// ============================================================
// TEST HELPERS
// ============================================================

function makeAmadeusConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    environment: 'test',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    defaultCurrency: 'USD',
    ...overrides,
  };
}

function makeSearchInput(overrides: Partial<SearchFlightsInput> = {}): SearchFlightsInput {
  return {
    origin: 'JFK',
    destination: 'LHR',
    departureDate: '2026-06-15',
    passengers: { adults: 1 },
    ...overrides,
  };
}

function makeBookingInput(overrides: Partial<CreateBookingInput> = {}): CreateBookingInput {
  return {
    offerId: 'amadeus-1',
    passengers: [
      {
        type: 'adult',
        gender: 'M',
        title: 'MR',
        firstName: 'John',
        lastName: 'Smith',
        dateOfBirth: '1990-05-15',
        passportNumber: 'AB123456',
        passportExpiry: '2030-05-15',
        passportCountry: 'US',
        nationality: 'US',
      },
    ],
    contact: {
      email: 'john@example.com',
      phone: '+1-555-123-4567',
    },
    ...overrides,
  };
}

function makeAmadeusFlightOffer(overrides: Partial<AmadeusFlightOffer> = {}): AmadeusFlightOffer {
  return {
    type: 'flight-offer',
    id: '1',
    source: 'GDS',
    lastTicketingDate: '2026-06-01',
    numberOfBookableSeats: 9,
    itineraries: [
      {
        duration: 'PT7H30M',
        segments: [
          {
            departure: { iataCode: 'JFK', terminal: '7', at: '2026-06-15T18:00:00' },
            arrival: { iataCode: 'LHR', terminal: '5', at: '2026-06-16T06:30:00' },
            carrierCode: 'BA',
            number: '178',
            aircraft: { code: '777' },
            operating: { carrierCode: 'BA' },
            duration: 'PT7H30M',
            id: '1',
            numberOfStops: 0,
          },
        ],
      },
    ],
    price: {
      currency: 'USD',
      total: '610.50',
      base: '500.00',
      grandTotal: '610.50',
    },
    pricingOptions: {
      fareType: ['PUBLISHED'],
      includedCheckedBagsOnly: true,
    },
    validatingAirlineCodes: ['BA'],
    travelerPricings: [
      {
        travelerId: '1',
        fareOption: 'STANDARD',
        travelerType: 'ADULT',
        price: {
          currency: 'USD',
          total: '610.50',
          base: '500.00',
        },
        fareDetailsBySegment: [
          {
            segmentId: '1',
            cabin: 'ECONOMY',
            fareBasis: 'YOWUS',
            class: 'Y',
            includedCheckedBags: { quantity: 2 },
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeAmadeusFlightOrder(overrides: Partial<AmadeusFlightOrder> = {}): AmadeusFlightOrder {
  return {
    type: 'flight-order',
    id: 'eJzTd9f3NjIJCQYADRUCcA==',
    associatedRecords: [
      {
        reference: 'ABCDEF',
        creationDate: '2026-06-15',
        originSystemCode: 'GDS',
      },
    ],
    flightOffers: [makeAmadeusFlightOffer()],
    travelers: [
      {
        id: '1',
        dateOfBirth: '1990-05-15',
        gender: 'MALE',
        name: {
          firstName: 'JOHN',
          lastName: 'SMITH',
        },
        documents: [
          {
            documentType: 'PASSPORT',
            number: 'AB123456',
            expiryDate: '2030-05-15',
            issuanceCountry: 'US',
            nationality: 'US',
            holder: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

// ============================================================
// CONFIG TESTS
// ============================================================

describe('AmadeusConfig', () => {
  it('parses valid config', () => {
    const config = validateAmadeusConfig(makeAmadeusConfig());
    expect(config.environment).toBe('test');
    expect(config.clientId).toBe('test-client-id');
    expect(config.clientSecret).toBe('test-client-secret');
    expect(config.defaultCurrency).toBe('USD');
  });

  it('throws on missing clientId', () => {
    expect(() => validateAmadeusConfig(makeAmadeusConfig({ clientId: '' }))).toThrow(
      'Invalid Amadeus config',
    );
  });

  it('throws on missing clientSecret', () => {
    expect(() => validateAmadeusConfig(makeAmadeusConfig({ clientSecret: '' }))).toThrow(
      'Invalid Amadeus config',
    );
  });

  it('throws on invalid environment', () => {
    expect(() => validateAmadeusConfig(makeAmadeusConfig({ environment: 'staging' }))).toThrow(
      'Invalid Amadeus config',
    );
  });

  it('defaults environment to test', () => {
    const { environment: _env, ...rest } = makeAmadeusConfig();
    const config = validateAmadeusConfig(rest);
    expect(config.environment).toBe('test');
  });

  it('defaults currency to USD', () => {
    const { defaultCurrency: _dc, ...rest } = makeAmadeusConfig();
    const config = validateAmadeusConfig(rest);
    expect(config.defaultCurrency).toBe('USD');
  });

  it('throws on invalid currency length', () => {
    expect(() => validateAmadeusConfig(makeAmadeusConfig({ defaultCurrency: 'US' }))).toThrow(
      'Invalid Amadeus config',
    );
  });

  it('accepts production environment', () => {
    const config = validateAmadeusConfig(makeAmadeusConfig({ environment: 'production' }));
    expect(config.environment).toBe('production');
  });
});

// ============================================================
// MAPPER — PAX TYPE TESTS
// ============================================================

describe('mapPaxType', () => {
  it('maps ADULT to adult', () => expect(mapPaxType('ADULT')).toBe('adult'));
  it('maps CHILD to child', () => expect(mapPaxType('CHILD')).toBe('child'));
  it('maps SEATED_INFANT to infant', () => expect(mapPaxType('SEATED_INFANT')).toBe('infant'));
  it('maps HELD_INFANT to infant', () => expect(mapPaxType('HELD_INFANT')).toBe('infant'));
  it('defaults unknown to adult', () => expect(mapPaxType('XYZ')).toBe('adult'));
});

describe('reverseMapPaxType', () => {
  it('maps adult to ADULT', () => expect(reverseMapPaxType('adult')).toBe('ADULT'));
  it('maps child to CHILD', () => expect(reverseMapPaxType('child')).toBe('CHILD'));
  it('maps infant to HELD_INFANT', () => expect(reverseMapPaxType('infant')).toBe('HELD_INFANT'));
  it('defaults unknown to ADULT', () => expect(reverseMapPaxType('xyz')).toBe('ADULT'));
});

describe('mapCabinClass', () => {
  it('maps ECONOMY to economy', () => expect(mapCabinClass('ECONOMY')).toBe('economy'));
  it('maps PREMIUM_ECONOMY to premium_economy', () => expect(mapCabinClass('PREMIUM_ECONOMY')).toBe('premium_economy'));
  it('maps BUSINESS to business', () => expect(mapCabinClass('BUSINESS')).toBe('business'));
  it('maps FIRST to first', () => expect(mapCabinClass('FIRST')).toBe('first'));
  it('defaults unknown to economy', () => expect(mapCabinClass('UNKNOWN')).toBe('economy'));
});

describe('reverseMapCabinClass', () => {
  it('maps economy to ECONOMY', () => expect(reverseMapCabinClass('economy')).toBe('ECONOMY'));
  it('maps business to BUSINESS', () => expect(reverseMapCabinClass('business')).toBe('BUSINESS'));
  it('maps first to FIRST', () => expect(reverseMapCabinClass('first')).toBe('FIRST'));
  it('maps premium_economy to PREMIUM_ECONOMY', () => expect(reverseMapCabinClass('premium_economy')).toBe('PREMIUM_ECONOMY'));
});

// ============================================================
// MAPPER — MONEY TESTS
// ============================================================

describe('toMoney', () => {
  it('converts string amount', () => {
    const result = toMoney('610.50', 'USD');
    expect(result.amount).toBe('610.5');
    expect(result.currency).toBe('USD');
  });

  it('handles undefined as zero', () => {
    const result = toMoney(undefined, 'EUR');
    expect(result.amount).toBe('0');
    expect(result.currency).toBe('EUR');
  });

  it('preserves precision', () => {
    const result = toMoney('123456.789', 'GBP');
    expect(result.amount).toBe('123456.789');
  });

  it('returns string type for amount', () => {
    const result = toMoney('100', 'USD');
    expect(typeof result.amount).toBe('string');
  });
});

// ============================================================
// MAPPER — SEARCH PARAMS
// ============================================================

describe('mapSearchParams', () => {
  it('builds one-way params', () => {
    const params = mapSearchParams(makeSearchInput(), 'USD');
    expect(params.originLocationCode).toBe('JFK');
    expect(params.destinationLocationCode).toBe('LHR');
    expect(params.departureDate).toBe('2026-06-15');
    expect(params.adults).toBe('1');
    expect(params.currencyCode).toBe('USD');
    expect(params.returnDate).toBeUndefined();
  });

  it('builds round-trip params', () => {
    const params = mapSearchParams(makeSearchInput({ returnDate: '2026-06-22' }), 'USD');
    expect(params.returnDate).toBe('2026-06-22');
  });

  it('maps passengers', () => {
    const params = mapSearchParams(
      makeSearchInput({ passengers: { adults: 2, children: 1, infants: 1 } }),
      'USD',
    );
    expect(params.adults).toBe('2');
    expect(params.children).toBe('1');
    expect(params.infants).toBe('1');
  });

  it('sets cabin class', () => {
    const params = mapSearchParams(makeSearchInput({ cabinClass: 'business' }), 'USD');
    expect(params.travelClass).toBe('BUSINESS');
  });

  it('sets direct only', () => {
    const params = mapSearchParams(makeSearchInput({ directOnly: true }), 'USD');
    expect(params.nonStop).toBe('true');
  });

  it('sets preferred airlines', () => {
    const params = mapSearchParams(
      makeSearchInput({ preferredAirlines: ['BA', 'AA'] }),
      'USD',
    );
    expect(params.includedAirlineCodes).toBe('BA,AA');
  });

  it('uses input currency over default', () => {
    const params = mapSearchParams(makeSearchInput({ currency: 'GBP' }), 'USD');
    expect(params.currencyCode).toBe('GBP');
  });

  it('uses default currency when none specified', () => {
    const params = mapSearchParams(makeSearchInput(), 'EUR');
    expect(params.currencyCode).toBe('EUR');
  });

  it('omits children/infants when zero', () => {
    const params = mapSearchParams(makeSearchInput({ passengers: { adults: 1 } }), 'USD');
    expect(params.children).toBeUndefined();
    expect(params.infants).toBeUndefined();
  });
});

// ============================================================
// MAPPER — SEARCH RESPONSE
// ============================================================

describe('mapSearchResponse', () => {
  it('maps single flight offer', () => {
    const offers = mapSearchResponse([makeAmadeusFlightOffer()]);
    expect(offers).toHaveLength(1);
    expect(offers[0].offerId).toBe('amadeus-1');
    expect(offers[0].supplier).toBe('amadeus');
    expect(offers[0].validatingCarrier).toBe('BA');
  });

  it('resolves segments', () => {
    const offers = mapSearchResponse([makeAmadeusFlightOffer()]);
    expect(offers[0].segments).toHaveLength(1);
    const seg = offers[0].segments[0][0];
    expect(seg.origin).toBe('JFK');
    expect(seg.destination).toBe('LHR');
    expect(seg.marketingCarrier).toBe('BA');
    expect(seg.operatingCarrier).toBe('BA');
    expect(seg.flightNumber).toBe('178');
    expect(seg.equipment).toBe('777');
    expect(seg.stops).toBe(0);
    expect(seg.duration).toBe('PT7H30M');
  });

  it('enriches segments with fare details', () => {
    const offers = mapSearchResponse([makeAmadeusFlightOffer()]);
    const seg = offers[0].segments[0][0];
    expect(seg.cabinClass).toBe('ECONOMY');
    expect(seg.bookingClass).toBe('Y');
    expect(seg.fareBasisCode).toBe('YOWUS');
  });

  it('maps fare breakdowns', () => {
    const offers = mapSearchResponse([makeAmadeusFlightOffer()]);
    const fare = offers[0].fares[0];
    expect(fare.passengerType).toBe('adult');
    expect(fare.baseFare.amount).toBe('500');
    expect(fare.total.amount).toBe('610.5');
    expect(fare.count).toBe(1);
  });

  it('calculates taxes as total minus base', () => {
    const offers = mapSearchResponse([makeAmadeusFlightOffer()]);
    const fare = offers[0].fares[0];
    expect(fare.taxes.amount).toBe('110.5');
  });

  it('maps total price', () => {
    const offers = mapSearchResponse([makeAmadeusFlightOffer()]);
    expect(offers[0].totalPrice.amount).toBe('610.5');
    expect(offers[0].totalPrice.currency).toBe('USD');
  });

  it('maps refundable status from fare type', () => {
    const offers = mapSearchResponse([makeAmadeusFlightOffer()]);
    expect(offers[0].refundable).toBe(true);
  });

  it('maps non-refundable', () => {
    const offer = makeAmadeusFlightOffer({
      pricingOptions: { fareType: ['PUBLISHED_NON_REFUNDABLE'] },
    });
    const offers = mapSearchResponse([offer]);
    expect(offers[0].refundable).toBe(false);
  });

  it('maps baggage allowance', () => {
    const offers = mapSearchResponse([makeAmadeusFlightOffer()]);
    expect(offers[0].baggageAllowance).toBe('2PC');
  });

  it('maps baggage by weight', () => {
    const offer = makeAmadeusFlightOffer();
    offer.travelerPricings[0].fareDetailsBySegment[0].includedCheckedBags = {
      weight: 23,
      weightUnit: 'KG',
    };
    const offers = mapSearchResponse([offer]);
    expect(offers[0].baggageAllowance).toBe('23KG');
  });

  it('maps expiration date', () => {
    const offers = mapSearchResponse([makeAmadeusFlightOffer()]);
    expect(offers[0].expiresAt).toBe('2026-06-01');
  });

  it('maps carrier name from dictionaries', () => {
    const offers = mapSearchResponse(
      [makeAmadeusFlightOffer()],
      { carriers: { BA: 'BRITISH AIRWAYS' } },
    );
    expect(offers[0].validatingCarrierName).toBe('BRITISH AIRWAYS');
  });

  it('returns empty array for empty offers', () => {
    const offers = mapSearchResponse([]);
    expect(offers).toHaveLength(0);
  });

  it('maps multiple offers', () => {
    const offer1 = makeAmadeusFlightOffer({ id: '1' });
    const offer2 = makeAmadeusFlightOffer({ id: '2' });
    const offers = mapSearchResponse([offer1, offer2]);
    expect(offers).toHaveLength(2);
    expect(offers[0].offerId).toBe('amadeus-1');
    expect(offers[1].offerId).toBe('amadeus-2');
  });

  it('maps cabin class from fare details', () => {
    const offers = mapSearchResponse([makeAmadeusFlightOffer()]);
    expect(offers[0].cabinClass).toBe('economy');
  });

  it('maps business class', () => {
    const offer = makeAmadeusFlightOffer();
    offer.travelerPricings[0].fareDetailsBySegment[0].cabin = 'BUSINESS';
    const offers = mapSearchResponse([offer]);
    expect(offers[0].cabinClass).toBe('business');
  });

  it('handles operating carrier different from marketing', () => {
    const offer = makeAmadeusFlightOffer();
    offer.itineraries[0].segments[0].operating = { carrierCode: 'AA' };
    const offers = mapSearchResponse([offer]);
    expect(offers[0].segments[0][0].operatingCarrier).toBe('AA');
    expect(offers[0].segments[0][0].marketingCarrier).toBe('BA');
  });

  it('aggregates fares by passenger type', () => {
    const offer = makeAmadeusFlightOffer();
    offer.travelerPricings.push({
      travelerId: '2',
      fareOption: 'STANDARD',
      travelerType: 'ADULT',
      price: { currency: 'USD', total: '610.50', base: '500.00' },
      fareDetailsBySegment: [
        { segmentId: '1', cabin: 'ECONOMY', class: 'Y' },
      ],
    });
    const offers = mapSearchResponse([offer]);
    expect(offers[0].fares).toHaveLength(1);
    expect(offers[0].fares[0].count).toBe(2);
  });
});

// ============================================================
// MAPPER — PRICE RESPONSE
// ============================================================

describe('mapPriceResponse', () => {
  it('maps available itinerary', () => {
    const result = mapPriceResponse([makeAmadeusFlightOffer()], 'amadeus-1');
    expect(result.available).toBe(true);
    expect(result.totalPrice.amount).toBe('610.5');
    expect(result.supplier).toBe('amadeus');
  });

  it('detects price change when original search price differs', () => {
    const result = mapPriceResponse([makeAmadeusFlightOffer()], 'amadeus-1', '550.00');
    expect(result.priceChanged).toBe(true);
  });

  it('detects no price change when prices match', () => {
    const result = mapPriceResponse([makeAmadeusFlightOffer()], 'amadeus-1', '610.50');
    expect(result.priceChanged).toBe(false);
  });

  it('handles empty response as unavailable', () => {
    const result = mapPriceResponse([], 'amadeus-1');
    expect(result.available).toBe(false);
    expect(result.totalPrice.amount).toBe('0');
  });

  it('maps fare rules', () => {
    const result = mapPriceResponse([makeAmadeusFlightOffer()], 'amadeus-1');
    expect(result.fareRules.refundable).toBe(true);
    expect(result.fareRules.changeable).toBe(true);
  });

  it('maps fare breakdowns', () => {
    const result = mapPriceResponse([makeAmadeusFlightOffer()], 'amadeus-1');
    expect(result.fares).toHaveLength(1);
    expect(result.fares[0].passengerType).toBe('adult');
  });
});

// ============================================================
// MAPPER — BOOKING REQUEST
// ============================================================

describe('mapCreateBookingRequest', () => {
  it('maps passengers to travelers', () => {
    const req = mapCreateBookingRequest(makeBookingInput(), makeAmadeusFlightOffer());
    expect(req.travelers).toHaveLength(1);
    expect(req.travelers[0].name.firstName).toBe('John');
    expect(req.travelers[0].name.lastName).toBe('Smith');
    expect(req.travelers[0].gender).toBe('MALE');
    expect(req.travelers[0].id).toBe('1');
  });

  it('maps passport as document', () => {
    const req = mapCreateBookingRequest(makeBookingInput(), makeAmadeusFlightOffer());
    const doc = req.travelers[0].documents![0];
    expect(doc.documentType).toBe('PASSPORT');
    expect(doc.number).toBe('AB123456');
    expect(doc.expiryDate).toBe('2030-05-15');
    expect(doc.issuanceCountry).toBe('US');
    expect(doc.nationality).toBe('US');
  });

  it('maps contact to first traveler', () => {
    const req = mapCreateBookingRequest(makeBookingInput(), makeAmadeusFlightOffer());
    const contact = req.travelers[0].contact!;
    expect(contact.emailAddress).toBe('john@example.com');
    expect(contact.phones[0].countryCallingCode).toBe('1');
    expect(contact.phones[0].number).toBe('5551234567');
  });

  it('does not add contact to second traveler', () => {
    const input = makeBookingInput({
      passengers: [
        {
          type: 'adult',
          gender: 'M',
          firstName: 'John',
          lastName: 'Smith',
          dateOfBirth: '1990-05-15',
        },
        {
          type: 'adult',
          gender: 'F',
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: '1992-03-10',
        },
      ],
    });
    const req = mapCreateBookingRequest(input, makeAmadeusFlightOffer());
    expect(req.travelers[0].contact).toBeDefined();
    expect(req.travelers[1].contact).toBeUndefined();
  });

  it('sets type as flight-order', () => {
    const req = mapCreateBookingRequest(makeBookingInput(), makeAmadeusFlightOffer());
    expect(req.type).toBe('flight-order');
  });

  it('includes the priced flight offer', () => {
    const offer = makeAmadeusFlightOffer();
    const req = mapCreateBookingRequest(makeBookingInput(), offer);
    expect(req.flightOffers).toHaveLength(1);
    expect(req.flightOffers[0].id).toBe('1');
  });

  it('maps female gender', () => {
    const input = makeBookingInput({
      passengers: [
        {
          type: 'adult',
          gender: 'F',
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: '1992-03-10',
        },
      ],
    });
    const req = mapCreateBookingRequest(input, makeAmadeusFlightOffer());
    expect(req.travelers[0].gender).toBe('FEMALE');
  });

  it('omits documents when no passport', () => {
    const input = makeBookingInput({
      passengers: [
        {
          type: 'adult',
          gender: 'M',
          firstName: 'John',
          lastName: 'Smith',
          dateOfBirth: '1990-05-15',
        },
      ],
    });
    const req = mapCreateBookingRequest(input, makeAmadeusFlightOffer());
    expect(req.travelers[0].documents).toBeUndefined();
  });

  it('extracts country code from phone', () => {
    const input = makeBookingInput({
      contact: { email: 'test@test.com', phone: '+44-20-7123-4567' },
    });
    const req = mapCreateBookingRequest(input, makeAmadeusFlightOffer());
    expect(req.travelers[0].contact!.phones[0].countryCallingCode).toBe('44');
  });
});

// ============================================================
// MAPPER — BOOKING RESPONSE
// ============================================================

describe('mapCreateBookingResponse', () => {
  it('maps successful booking', () => {
    const result = mapCreateBookingResponse(makeAmadeusFlightOrder());
    expect(result.bookingId).toBe('eJzTd9f3NjIJCQYADRUCcA==');
    expect(result.pnr).toBe('ABCDEF');
    expect(result.status).toBe('confirmed');
    expect(result.supplier).toBe('amadeus');
  });

  it('maps flight segments', () => {
    const result = mapCreateBookingResponse(makeAmadeusFlightOrder());
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0][0].origin).toBe('JFK');
    expect(result.segments[0][0].destination).toBe('LHR');
  });

  it('maps passengers', () => {
    const result = mapCreateBookingResponse(makeAmadeusFlightOrder());
    expect(result.passengers).toHaveLength(1);
    expect(result.passengers[0].firstName).toBe('JOHN');
    expect(result.passengers[0].lastName).toBe('SMITH');
    expect(result.passengers[0].gender).toBe('M');
  });

  it('maps total price', () => {
    const result = mapCreateBookingResponse(makeAmadeusFlightOrder());
    expect(result.totalPrice.amount).toBe('610.5');
    expect(result.totalPrice.currency).toBe('USD');
  });

  it('maps passport details', () => {
    const result = mapCreateBookingResponse(makeAmadeusFlightOrder());
    expect(result.passengers[0].passportNumber).toBe('AB123456');
    expect(result.passengers[0].passportExpiry).toBe('2030-05-15');
    expect(result.passengers[0].passportCountry).toBe('US');
    expect(result.passengers[0].nationality).toBe('US');
  });
});

// ============================================================
// MAPPER — GET BOOKING RESPONSE
// ============================================================

describe('mapGetBookingResponse', () => {
  it('maps booking status', () => {
    const result = mapGetBookingResponse(makeAmadeusFlightOrder(), 'ORDER123');
    expect(result.bookingId).toBe('ORDER123');
    expect(result.status).toBe('confirmed');
    expect(result.pnr).toBe('ABCDEF');
    expect(result.supplier).toBe('amadeus');
  });

  it('maps flight segments', () => {
    const result = mapGetBookingResponse(makeAmadeusFlightOrder(), 'ORDER123');
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0][0].flightNumber).toBe('178');
  });

  it('maps travelers to passengers', () => {
    const result = mapGetBookingResponse(makeAmadeusFlightOrder(), 'ORDER123');
    expect(result.passengers).toHaveLength(1);
    expect(result.passengers[0].firstName).toBe('JOHN');
  });

  it('maps total price', () => {
    const result = mapGetBookingResponse(makeAmadeusFlightOrder(), 'ORDER123');
    expect(result.totalPrice.amount).toBe('610.5');
  });

  it('handles missing associated records', () => {
    const order = makeAmadeusFlightOrder({ associatedRecords: undefined });
    const result = mapGetBookingResponse(order, 'ORDER123');
    expect(result.pnr).toBeUndefined();
  });
});

// ============================================================
// SUPPLIER REGISTRY TEST
// ============================================================

describe('Supplier Registry', () => {
  it('registers amadeus adapter', async () => {
    const { listSuppliers } = await import('../../../suppliers/index.js');
    expect(listSuppliers()).toContain('amadeus');
  });
});
