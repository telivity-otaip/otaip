import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatDateDDMMYYYY,
  formatDateMMDDYYYY,
  mapPaxType,
  reverseMapPaxType,
  mapFareType,
  mapCabinClass,
  calculateTotalPrice,
  mapSearchRequest,
  mapSearchResponse,
  mapRepriceRequest,
  mapRepriceResponse,
  mapBookRequest,
  mapBookResponse,
  generateTransactionId,
} from '../mapper.js';
import {
  soapRequest,
  buildReadPnrBody,
  buildOrderTicketBody,
  buildCancelPnrBody,
  buildReadETicketBody,
  extractXmlValue,
  extractXmlValues,
  hasSoapFault,
  extractSoapFaultMessage,
} from '../soap-client.js';
import { TripProAdapter } from '../index.js';
import type { TripProConfig } from '../config.js';
import type { TripProItinerary, TripProFare, TripProBookResponse } from '../types.js';
import type { SearchFlightsInput, CreateBookingInput, PassengerCount } from '../../../types.js';

// ============================================================
// DATE FORMATTERS
// ============================================================

describe('formatDateDDMMYYYY', () => {
  it('converts ISO date to DD/MM/YYYY', () => {
    expect(formatDateDDMMYYYY('2026-04-15')).toBe('15/04/2026');
  });

  it('handles single-digit month and day', () => {
    expect(formatDateDDMMYYYY('2026-01-05')).toBe('05/01/2026');
  });

  it('handles leap year date', () => {
    expect(formatDateDDMMYYYY('2024-02-29')).toBe('29/02/2024');
  });

  it('handles end of year', () => {
    expect(formatDateDDMMYYYY('2026-12-31')).toBe('31/12/2026');
  });
});

describe('formatDateMMDDYYYY', () => {
  it('converts ISO date to MM/DD/YYYY', () => {
    expect(formatDateMMDDYYYY('2026-04-15')).toBe('04/15/2026');
  });

  it('handles single-digit month and day', () => {
    expect(formatDateMMDDYYYY('2026-01-05')).toBe('01/05/2026');
  });

  it('handles leap year date', () => {
    expect(formatDateMMDDYYYY('2024-02-29')).toBe('02/29/2024');
  });
});

// ============================================================
// TYPE MAPPERS
// ============================================================

describe('mapPaxType', () => {
  it('maps ADT to adult', () => expect(mapPaxType('ADT')).toBe('adult'));
  it('maps CHD to child', () => expect(mapPaxType('CHD')).toBe('child'));
  it('maps INF to infant', () => expect(mapPaxType('INF')).toBe('infant'));
  it('defaults unknown to adult', () => expect(mapPaxType('XYZ')).toBe('adult'));
});

describe('reverseMapPaxType', () => {
  it('maps adult to ADT', () => expect(reverseMapPaxType('adult')).toBe('ADT'));
  it('maps child to CHD', () => expect(reverseMapPaxType('child')).toBe('CHD'));
  it('maps infant to INF', () => expect(reverseMapPaxType('infant')).toBe('INF'));
  it('defaults unknown to ADT', () => expect(reverseMapPaxType('other')).toBe('ADT'));
});

describe('mapFareType', () => {
  it('maps PUB to published', () => expect(mapFareType('PUB')).toBe('published'));
  it('maps NET to net', () => expect(mapFareType('NET')).toBe('net'));
  it('maps JCB to negotiated', () => expect(mapFareType('JCB')).toBe('negotiated'));
  it('defaults unknown to published', () => expect(mapFareType('XXX')).toBe('published'));
});

describe('mapCabinClass', () => {
  it('maps E to economy', () => expect(mapCabinClass('E')).toBe('economy'));
  it('maps P to premium_economy', () => expect(mapCabinClass('P')).toBe('premium_economy'));
  it('maps B to business', () => expect(mapCabinClass('B')).toBe('business'));
  it('maps F to first', () => expect(mapCabinClass('F')).toBe('first'));
  it('defaults unknown to economy', () => expect(mapCabinClass('Z')).toBe('economy'));
});

// ============================================================
// MONEY HELPERS
// ============================================================

describe('calculateTotalPrice', () => {
  it('sums all fares using decimal math', () => {
    const fares: TripProFare[] = [
      makeFare({ BaseFare: 100.10, Taxes: 50.20, CCFee: 5, FullFare: 155.30 }),
      makeFare({ BaseFare: 80.05, Taxes: 40.10, CCFee: 3, FullFare: 123.15 }),
    ];
    const result = calculateTotalPrice(fares);
    expect(result.amount).toBe('278.45');
    expect(result.currency).toBe('USD');
  });

  it('handles single fare', () => {
    const fares: TripProFare[] = [
      makeFare({ BaseFare: 500, Taxes: 100, CCFee: 0, FullFare: 600 }),
    ];
    const result = calculateTotalPrice(fares);
    expect(result.amount).toBe('600');
  });

  it('handles empty fares', () => {
    const result = calculateTotalPrice([]);
    expect(result.amount).toBe('0');
    expect(result.currency).toBe('USD');
  });

  it('avoids floating point errors', () => {
    const fares: TripProFare[] = [
      makeFare({ BaseFare: 0.1, Taxes: 0.2, CCFee: 0, FullFare: 0.3 }),
    ];
    const result = calculateTotalPrice(fares);
    expect(result.amount).toBe('0.3');
  });
});

// ============================================================
// TRANSACTION ID
// ============================================================

describe('generateTransactionId', () => {
  it('generates unique IDs', () => {
    const id1 = generateTransactionId();
    const id2 = generateTransactionId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^otaip-/);
  });
});

// ============================================================
// REQUEST MAPPERS
// ============================================================

describe('mapSearchRequest', () => {
  const baseInput: SearchFlightsInput = {
    origin: 'JFK',
    destination: 'LHR',
    departureDate: '2026-06-15',
    passengers: { adults: 2 },
  };

  const config = makeConfig();

  it('maps one-way search correctly', () => {
    const result = mapSearchRequest(baseInput, config);

    expect(result.OriginDestination).toHaveLength(1);
    expect(result.OriginDestination[0].DepartureTime).toBe('15/06/2026');
    expect(result.OriginDestination[0].DepartureLocationCode).toBe('JFK');
    expect(result.OriginDestination[0].ArrivalLocationCode).toBe('LHR');
    expect(result.OriginDestination[0].CabinClass).toBe('E');
    expect(result.PaxDetails.NoOfAdults.count).toBe(2);
    expect(result.CurrencyInfo.CurrencyCode).toBe('USD');
    expect(result.OtherInfo.RequestedIP).toBe('1.2.3.4');
    expect(result.Incremental).toBe(false);
  });

  it('maps round-trip search correctly', () => {
    const result = mapSearchRequest(
      { ...baseInput, returnDate: '2026-06-22' },
      config,
    );

    expect(result.OriginDestination).toHaveLength(2);
    expect(result.OriginDestination[1].DepartureTime).toBe('22/06/2026');
    expect(result.OriginDestination[1].DepartureLocationCode).toBe('LHR');
    expect(result.OriginDestination[1].ArrivalLocationCode).toBe('JFK');
  });

  it('maps cabin class correctly', () => {
    const result = mapSearchRequest(
      { ...baseInput, cabinClass: 'business' },
      config,
    );
    expect(result.OriginDestination[0].CabinClass).toBe('B');
  });

  it('maps passengers with children and infants', () => {
    const result = mapSearchRequest(
      {
        ...baseInput,
        passengers: { adults: 1, children: 2, childAges: [8], infants: 1 },
      },
      config,
    );

    expect(result.PaxDetails.NoOfAdults.count).toBe(1);
    expect(result.PaxDetails.NoOfChildren?.count).toBe(2);
    expect(result.PaxDetails.NoOfChildren?.age).toBe(8);
    expect(result.PaxDetails.NoOfInfants?.count).toBe(1);
    expect(result.PaxDetails.NoOfInfants?.age).toBe(1);
  });

  it('maps preferred airlines', () => {
    const result = mapSearchRequest(
      { ...baseInput, preferredAirlines: ['BA', 'AA'] },
      config,
    );
    expect(result.OriginDestination[0].PreferredAirlines).toBe('BA,AA');
  });

  it('uses config currency when not specified', () => {
    const result = mapSearchRequest(baseInput, config);
    expect(result.CurrencyInfo.CurrencyCode).toBe('USD');
  });

  it('uses input currency when specified', () => {
    const result = mapSearchRequest(
      { ...baseInput, currency: 'GBP' },
      config,
    );
    expect(result.CurrencyInfo.CurrencyCode).toBe('GBP');
  });
});

describe('mapRepriceRequest', () => {
  it('maps correctly', () => {
    const result = mapRepriceRequest('ITN-123', { adults: 2, children: 1, infants: 0 });
    expect(result.ItineraryId).toBe('ITN-123');
    expect(result.AdultPaxCount).toBe(2);
    expect(result.ChildPaxCount).toBe(1);
    expect(result.InfantPaxCount).toBe(0);
  });

  it('defaults missing counts to zero', () => {
    const result = mapRepriceRequest('ITN-456', { adults: 1 });
    expect(result.ChildPaxCount).toBe(0);
    expect(result.InfantPaxCount).toBe(0);
  });
});

describe('mapBookRequest', () => {
  const input: CreateBookingInput = {
    offerId: 'ITN-789',
    passengers: [
      {
        type: 'adult',
        gender: 'M',
        title: 'MR',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-03-25',
        passportNumber: 'AB123456',
        passportExpiry: '2030-12-31',
        passportCountry: 'US',
        nationality: 'US',
      },
    ],
    contact: {
      email: 'john@example.com',
      phone: '+1234567890',
    },
  };

  it('maps booking request correctly', () => {
    const result = mapBookRequest(input);

    expect(result.ItineraryId).toBe('ITN-789');
    expect(result.BookItineraryPaxDetail).toHaveLength(1);

    const pax = result.BookItineraryPaxDetail[0];
    expect(pax.PaxType).toBe('ADT');
    expect(pax.FirstName).toBe('John');
    expect(pax.LastName).toBe('Doe');
    expect(pax.Gender).toBe('M');
    expect(pax.UserTitle).toBe('MR');
  });

  it('uses MM/DD/YYYY for date of birth (NOT DD/MM/YYYY)', () => {
    const result = mapBookRequest(input);
    expect(result.BookItineraryPaxDetail[0].DateOfBirth).toBe('03/25/1990');
  });

  it('uses MM/DD/YYYY for passport expiry', () => {
    const result = mapBookRequest(input);
    expect(result.BookItineraryPaxDetail[0].PassportExpiryDate).toBe('12/31/2030');
  });

  it('ALWAYS sets PaymentType to HOLD', () => {
    const result = mapBookRequest(input);
    expect(result.BookItineraryPaymentDetail.PaymentType).toBe('HOLD');
    expect(result.BookItineraryPaymentDetail.BookItineraryCCDetails).toEqual({});
    expect(result.BookItineraryPaymentDetail.BookItineraryBillingAddress).toEqual({});
  });

  it('defaults title to MR for male, MS for female', () => {
    const maleResult = mapBookRequest({
      ...input,
      passengers: [{ ...input.passengers[0], title: undefined }],
    });
    expect(maleResult.BookItineraryPaxDetail[0].UserTitle).toBe('MR');

    const femaleResult = mapBookRequest({
      ...input,
      passengers: [{ ...input.passengers[0], gender: 'F', title: undefined }],
    });
    expect(femaleResult.BookItineraryPaxDetail[0].UserTitle).toBe('MS');
  });

  it('maps contact info', () => {
    const result = mapBookRequest(input);
    expect(result.BookItineraryPaxContactInfo.Email).toBe('john@example.com');
    expect(result.BookItineraryPaxContactInfo.PhoneNumber).toBe('+1234567890');
    expect(result.BookItineraryPaxContactInfo.AlternatePhoneNumber).toBe('');
  });
});

// ============================================================
// RESPONSE MAPPERS
// ============================================================

describe('mapSearchResponse', () => {
  it('maps itinerary to FlightOffer correctly', () => {
    const itineraries = [makeItinerary()];
    const offers = mapSearchResponse(itineraries);

    expect(offers).toHaveLength(1);
    const offer = offers[0];

    expect(offer.offerId).toBe('ITN-001');
    expect(offer.supplier).toBe('trippro');
    expect(offer.validatingCarrier).toBe('BA');
    expect(offer.validatingCarrierName).toBe('British Airways');
    expect(offer.fareType).toBe('published');
    expect(offer.cabinClass).toBe('economy');
    expect(offer.refundable).toBe(true);
    expect(offer.changeable).toBe(true);
  });

  it('maps segments nested correctly (legs → segments)', () => {
    const offers = mapSearchResponse([makeItinerary()]);
    expect(offers[0].segments).toHaveLength(1);
    expect(offers[0].segments[0]).toHaveLength(1);

    const seg = offers[0].segments[0][0];
    expect(seg.origin).toBe('JFK');
    expect(seg.destination).toBe('LHR');
    expect(seg.marketingCarrier).toBe('BA');
    expect(seg.flightNumber).toBe('178');
    expect(typeof seg.flightNumber).toBe('string');
    expect(seg.stops).toBe(0);
  });

  it('maps money as strings, not numbers', () => {
    const offers = mapSearchResponse([makeItinerary()]);
    const fare = offers[0].fares[0];

    expect(typeof fare.baseFare.amount).toBe('string');
    expect(typeof fare.taxes.amount).toBe('string');
    expect(typeof fare.total.amount).toBe('string');
    expect(typeof offers[0].totalPrice.amount).toBe('string');
  });

  it('handles empty results', () => {
    expect(mapSearchResponse([])).toEqual([]);
  });
});

describe('mapRepriceResponse', () => {
  it('maps available repriced itinerary', () => {
    const result = mapRepriceResponse([makeItinerary()], 'ITN-001');
    expect(result.available).toBe(true);
    expect(result.supplier).toBe('trippro');
    expect(typeof result.totalPrice.amount).toBe('string');
  });

  it('handles no results (unavailable)', () => {
    const result = mapRepriceResponse([], 'ITN-001');
    expect(result.available).toBe(false);
    expect(result.totalPrice.amount).toBe('0');
  });
});

describe('mapBookResponse', () => {
  it('maps successful booking (PNR present) to held', () => {
    const response: TripProBookResponse = {
      errorsList: { empty: true },
      PNR: 'ABC123',
      ReferenceNumber: 'REF-001',
    };
    const result = mapBookResponse(response);

    expect(result.bookingId).toBe('REF-001');
    expect(result.status).toBe('held');
    expect(result.pnr).toBe('ABC123');
    expect(result.supplier).toBe('trippro');
  });

  it('maps failed booking (PNR null) to failed', () => {
    const response: TripProBookResponse = {
      errorsList: { empty: true },
      PNR: null,
      ReferenceNumber: null,
    };
    const result = mapBookResponse(response);

    expect(result.status).toBe('failed');
    expect(result.pnr).toBeUndefined();
    expect(result.bookingId).toBe('');
  });
});

// ============================================================
// SOAP CLIENT
// ============================================================

describe('SOAP body builders', () => {
  it('buildReadPnrBody builds valid XML', () => {
    const xml = buildReadPnrBody('ABC123');
    expect(xml).toContain('<PNR>ABC123</PNR>');
    expect(xml).toContain('ReadPNR');
  });

  it('buildOrderTicketBody builds valid XML', () => {
    const xml = buildOrderTicketBody('ABC123');
    expect(xml).toContain('<PNR>ABC123</PNR>');
    expect(xml).toContain('OrderTicket');
  });

  it('buildCancelPnrBody builds valid XML', () => {
    const xml = buildCancelPnrBody('ABC123');
    expect(xml).toContain('<PNR>ABC123</PNR>');
    expect(xml).toContain('CancelPNR');
  });

  it('buildReadETicketBody builds valid XML', () => {
    const xml = buildReadETicketBody('TKT-001');
    expect(xml).toContain('<TicketNumber>TKT-001</TicketNumber>');
    expect(xml).toContain('ReadETicket');
  });

  it('escapes XML special characters', () => {
    const xml = buildReadPnrBody('AB<>&"\'CD');
    expect(xml).toContain('AB&lt;&gt;&amp;&quot;&apos;CD');
    expect(xml).not.toContain('AB<>&"\'CD');
  });
});

describe('XML response helpers', () => {
  it('extractXmlValue finds element content', () => {
    const xml = '<root><PNR>ABC123</PNR></root>';
    expect(extractXmlValue(xml, 'PNR')).toBe('ABC123');
  });

  it('extractXmlValue returns null for missing element', () => {
    expect(extractXmlValue('<root></root>', 'PNR')).toBeNull();
  });

  it('extractXmlValues finds all occurrences', () => {
    const xml =
      '<root><TicketNumber>T1</TicketNumber><TicketNumber>T2</TicketNumber></root>';
    expect(extractXmlValues(xml, 'TicketNumber')).toEqual(['T1', 'T2']);
  });

  it('hasSoapFault detects faults', () => {
    expect(hasSoapFault('<soap:Fault><faultstring>err</faultstring></soap:Fault>')).toBe(true);
    expect(hasSoapFault('<soap:Body><Result>ok</Result></soap:Body>')).toBe(false);
  });

  it('extractSoapFaultMessage extracts message', () => {
    const xml = '<soap:Fault><faultstring>Something went wrong</faultstring></soap:Fault>';
    expect(extractSoapFaultMessage(xml)).toBe('Something went wrong');
  });
});

describe('soapRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends correct SOAP envelope', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<soap:Body><Result>OK</Result></soap:Body>'),
    });
    vi.stubGlobal('fetch', mockFetch);

    await soapRequest('https://api.example.com/soap', 'ReadPNR', '<Body/>', 'token123');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/soap');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('text/xml; charset=utf-8');
    expect(opts.headers['SOAPAction']).toBe('ReadPNR');
    expect(opts.body).toContain('<AccessToken>token123</AccessToken>');
    expect(opts.body).toContain('<Body/>');
  });

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));

    await expect(
      soapRequest('https://api.example.com/soap', 'ReadPNR', '<Body/>', 'token'),
    ).rejects.toThrow('SOAP request failed: 500 Internal Server Error');
  });
});

// ============================================================
// TRIPPRO ADAPTER INTEGRATION
// ============================================================

describe('TripProAdapter', () => {
  const validConfig: TripProConfig = makeConfig();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs with valid config', () => {
    const adapter = new TripProAdapter(validConfig);
    expect(adapter.supplierId).toBe('trippro');
    expect(adapter.supplierName).toBe('TripPro/Mondee');
  });

  it('throws on invalid config', () => {
    expect(() => new TripProAdapter({})).toThrow('Invalid TripPro config');
  });

  it('searchFlights calls correct URL with search headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ Results: [makeItinerary()] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new TripProAdapter(validConfig);
    const offers = await adapter.searchFlights({
      origin: 'JFK',
      destination: 'LHR',
      departureDate: '2026-06-15',
      passengers: { adults: 1 },
    });

    expect(offers).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://mas.trippro.com/resources/v2/Flights/search');
    expect(opts.headers['SearchAccessToken']).toBe('search-token-123');
    expect(opts.headers['M-IPAddress']).toBe('1.2.3.4');
    expect(opts.headers['AccessToken']).toBeUndefined();
  });

  it('priceItinerary calls correct URL with booking headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ Results: [makeItinerary()] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new TripProAdapter(validConfig);
    await adapter.priceItinerary('ITN-001', { adults: 1 });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://map.trippro.com/resources/api/v3/repriceitinerary');
    expect(opts.headers['AccessToken']).toBe('booking-token-456');
    expect(opts.headers['SearchAccessToken']).toBeUndefined();
  });

  it('createBooking calls correct URL with booking headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          errorsList: { empty: true },
          PNR: 'ABC123',
          ReferenceNumber: 'REF-001',
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new TripProAdapter(validConfig);
    const result = await adapter.createBooking({
      offerId: 'ITN-001',
      passengers: [
        {
          type: 'adult',
          gender: 'M',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01',
        },
      ],
      contact: { email: 'j@test.com', phone: '123' },
    });

    expect(result.status).toBe('held');
    expect(result.pnr).toBe('ABC123');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://map.trippro.com/resources/v2/Flights/bookItinerary');
    expect(opts.headers['AccessToken']).toBe('booking-token-456');

    const body = JSON.parse(opts.body);
    expect(body.BookItineraryPaymentDetail.PaymentType).toBe('HOLD');
  });

  it('createBooking throws on TripPro error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            errorsList: {
              empty: false,
              tperror: [
                {
                  errorCode: 'E001',
                  errorType: 'BOOKING',
                  errorText: 'Itinerary expired',
                  errorDetail: { severity: 'ERROR' },
                },
              ],
            },
            PNR: null,
            ReferenceNumber: null,
          }),
      }),
    );

    const adapter = new TripProAdapter(validConfig);
    await expect(
      adapter.createBooking({
        offerId: 'ITN-001',
        passengers: [
          {
            type: 'adult',
            gender: 'M',
            firstName: 'John',
            lastName: 'Doe',
            dateOfBirth: '1990-01-01',
          },
        ],
        contact: { email: 'j@test.com', phone: '123' },
      }),
    ).rejects.toThrow('Itinerary expired');
  });

  it('getBookingStatus uses SOAP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<soap:Body><ReadPNRResponse><PNR>ABC123</PNR><Status>Confirmed</Status></ReadPNRResponse></soap:Body>',
          ),
      }),
    );

    const adapter = new TripProAdapter(validConfig);
    const result = await adapter.getBookingStatus('ABC123');

    expect(result.status).toBe('confirmed');
    expect(result.pnr).toBe('ABC123');
  });

  it('cancelBooking uses SOAP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<soap:Body><CancelPNRResponse><Status>Cancelled</Status></CancelPNRResponse></soap:Body>',
          ),
      }),
    );

    const adapter = new TripProAdapter(validConfig);
    const result = await adapter.cancelBooking('ABC123');

    expect(result.success).toBe(true);
    expect(result.message).toContain('ABC123');
  });

  it('healthCheck returns latency', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true }),
    );

    const adapter = new TripProAdapter(validConfig);
    const result = await adapter.healthCheck();

    expect(result.healthy).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
  });
});

// ============================================================
// TEST HELPERS
// ============================================================

function makeConfig(): TripProConfig {
  return {
    searchUrl: 'http://mas.trippro.com/resources/v2/Flights/search',
    calendarSearchUrl: 'http://mas.trippro.com/resources/v3/calendarsearch',
    repriceUrl: 'https://map.trippro.com/resources/api/v3/repriceitinerary',
    bookUrl: 'https://map.trippro.com/resources/v2/Flights/bookItinerary',
    soapBaseUrl: 'https://soap.trippro.com/services',
    accessToken: 'booking-token-456',
    searchAccessToken: 'search-token-123',
    whitelistedIp: '1.2.3.4',
    defaultCurrency: 'USD',
  };
}

function makeFare(overrides: Partial<TripProFare> = {}): TripProFare {
  return {
    CurrencyCode: 'USD',
    BaseFare: 500,
    Taxes: 100,
    CCFee: 10,
    FullFare: 610,
    PaxType: 'ADT',
    FareType: 'PUB',
    IsNonRefundableFare: false,
    ExchangePenalties: null,
    RefundPenalties: null,
    ...overrides,
  };
}

function makeItinerary(overrides: Partial<TripProItinerary> = {}): TripProItinerary {
  return {
    ItineraryId: 'ITN-001',
    ValidatingCarrierCode: 'BA',
    ValidatingCarrierName: 'British Airways',
    FareType: 'PUB',
    CabinClass: 'E',
    Citypairs: [
      {
        Duration: 'PT7H30M',
        NoOfStops: 0,
        FlightSegment: [
          {
            DepartureLocationCode: 'JFK',
            ArrivalLocationCode: 'LHR',
            MarketingAirline: 'BA',
            FlightNumber: 178,
            DepartureDateTime: '2026-06-15T18:00:00',
            ArrivalDateTime: '2026-06-16T06:30:00',
            Duration: 'PT7H30M',
            BookingClass: 'Y',
            CabinClass: 'E',
            AirEquipmentType: '777',
            FareBasisCode: 'YOWUS',
            BaggageAllowance: '2PC',
            IntermediateStops: [],
          },
        ],
      },
    ],
    Fares: [makeFare()],
    ...overrides,
  };
}
