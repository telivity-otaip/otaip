import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectError } from '../../../base-adapter.js';
import type { CreateBookingInput, SearchFlightsInput } from '../../../types.js';
import { SabreAuth } from '../auth.js';
import {
  getBaseUrl,
  SABRE_CERT_BASE_URL,
  SABRE_PROD_BASE_URL,
  validateSabreConfig,
} from '../config.js';
import { SabreAdapter } from '../index.js';
import {
  mapCancelResponse,
  mapCabinClass,
  mapCreateBookingRequest,
  mapCreateBookingResponse,
  mapFulfillResponse,
  mapGetBookingResponse,
  mapPaxType,
  mapPriceResponse,
  mapSearchRequest,
  mapSearchResponse,
  reverseMapPaxType,
  toMoney,
} from '../mapper.js';
import type {
  BfmResponse,
  SabreCancelBookingResponse,
  SabreCreateBookingResponse,
  SabreFulfillTicketsResponse,
  SabreGetBookingResponse,
} from '../types.js';

// ============================================================
// TEST HELPERS
// ============================================================

function makeSabreConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    environment: 'cert',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    pcc: 'AB12',
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
    offerId: 'sabre-1-0',
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

function makeScheduleDesc(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    departure: {
      airport: 'JFK',
      time: '18:00:00',
    },
    arrival: {
      airport: 'LHR',
      time: '06:30:00',
      dateAdjustment: 1,
    },
    carrier: {
      marketing: 'BA',
      marketingFlightNumber: 178,
      operating: 'BA',
      equipment: { code: '777' },
    },
    elapsedTime: 450,
    stopCount: 0,
    eTicketable: true,
    ...overrides,
  };
}

function makeLegDesc(id: number, scheduleRefs: number[] = [1]) {
  return {
    id,
    schedules: scheduleRefs.map((ref) => ({ ref })),
    elapsedTime: 450,
  };
}

function makeBfmResponse(overrides: Partial<BfmResponse['groupedItineraryResponse']> = {}): BfmResponse {
  return {
    groupedItineraryResponse: {
      version: 'V5',
      messages: [{ severity: 'Info', text: 'OK' }],
      scheduleDescs: [makeScheduleDesc(1)],
      legDescs: [makeLegDesc(1)],
      fareComponentDescs: [
        {
          id: 1,
          fareBasisCode: 'YOWUS',
          governingCarrier: 'BA',
          segments: [{ segment: { bookingCode: 'Y', cabinCode: 'Y' } }],
        },
      ],
      baggageAllowanceDescs: [
        { id: 1, pieceCount: 2, description1: 'UP TO 50 POUNDS/23 KILOGRAMS' },
      ],
      itineraryGroups: [
        {
          groupDescription: {
            legDescriptions: [
              { departureDate: '2026-06-15', departureLocation: 'JFK', arrivalLocation: 'LHR' },
            ],
          },
          itineraries: [
            {
              id: 1,
              pricingSource: 'ADVJR1',
              legs: [{ ref: 1 }],
              pricingInformation: [
                {
                  fare: {
                    passengerInfoList: [
                      {
                        passengerInfo: {
                          passengerType: 'ADT',
                          total: 1,
                          nonRefundable: false,
                          passengerTotalFare: {
                            totalFare: 610.50,
                            totalTaxAmount: 110.50,
                            currency: 'USD',
                            baseFareAmount: 500,
                            baseFareCurrency: 'USD',
                          },
                          fareComponents: [{ ref: 1 }],
                          baggageInformation: [
                            { allowance: { ref: 1 }, provisionType: 'A' },
                          ],
                        },
                      },
                    ],
                    totalFare: {
                      totalPrice: 610.50,
                      totalTaxAmount: 110.50,
                      currency: 'USD',
                      baseFareAmount: 500,
                      baseFareCurrency: 'USD',
                    },
                    validatingCarrierCode: 'BA',
                    lastTicketDate: '2026-06-01',
                  },
                  distributionModel: 'ATPCO',
                },
              ],
            },
          ],
        },
      ],
      ...overrides,
    },
  };
}

function makeCreateBookingResponse(
  overrides: Partial<SabreCreateBookingResponse> = {},
): SabreCreateBookingResponse {
  return {
    timestamp: '2026-06-15T10:00:00Z',
    confirmationId: 'ABCDEF',
    booking: {
      bookingId: 'ABCDEF',
      isTicketed: false,
      isCancelable: true,
      flights: [
        {
          itemId: '1',
          flightNumber: 178,
          airlineCode: 'BA',
          airlineName: 'BRITISH AIRWAYS',
          fromAirportCode: 'JFK',
          toAirportCode: 'LHR',
          departureDate: '2026-06-15',
          departureTime: '18:00',
          arrivalDate: '2026-06-16',
          arrivalTime: '06:30',
          bookingClass: 'Y',
        },
      ],
      travelers: [
        {
          givenName: 'John',
          surname: 'Smith',
          birthDate: '1990-05-15',
          gender: 'M',
          passengerCode: 'ADT',
        },
      ],
      fares: [
        {
          baseFare: { amount: 500, currency: 'USD' },
          totalFare: { amount: 610.50, currency: 'USD' },
          totalTax: { amount: 110.50, currency: 'USD' },
          passengerCode: 'ADT',
        },
      ],
      creationDetails: {
        creationDate: '2026-06-15',
        purchaseDeadlineDate: '2026-06-20',
        purchaseDeadlineTime: '23:59',
      },
    },
    ...overrides,
  };
}

function makeGetBookingResponse(
  overrides: Partial<SabreGetBookingResponse> = {},
): SabreGetBookingResponse {
  return {
    timestamp: '2026-06-15T10:00:00Z',
    bookingSignature: 'abc123',
    booking: {
      bookingId: 'ABCDEF',
      isTicketed: false,
      isCancelable: true,
      flights: [
        {
          itemId: '1',
          flightNumber: 178,
          airlineCode: 'BA',
          fromAirportCode: 'JFK',
          toAirportCode: 'LHR',
          departureDate: '2026-06-15',
          departureTime: '18:00',
          arrivalDate: '2026-06-16',
          arrivalTime: '06:30',
          bookingClass: 'Y',
        },
      ],
      travelers: [
        {
          givenName: 'John',
          surname: 'Smith',
          passengerCode: 'ADT',
        },
      ],
    },
    ...overrides,
  };
}

function makeFulfillResponse(
  overrides: Partial<SabreFulfillTicketsResponse> = {},
): SabreFulfillTicketsResponse {
  return {
    timestamp: '2026-06-15T10:00:00Z',
    tickets: [
      { number: '0167489825830', date: '2026-06-15', isCommitted: true },
    ],
    ...overrides,
  };
}

// ============================================================
// CONFIG TESTS
// ============================================================

describe('SabreConfig', () => {
  it('parses valid config', () => {
    const config = validateSabreConfig(makeSabreConfig());
    expect(config.environment).toBe('cert');
    expect(config.clientId).toBe('test-client-id');
    expect(config.clientSecret).toBe('test-client-secret');
    expect(config.pcc).toBe('AB12');
    expect(config.defaultCurrency).toBe('USD');
  });

  it('throws on missing clientId', () => {
    expect(() => validateSabreConfig(makeSabreConfig({ clientId: '' }))).toThrow(
      'Invalid Sabre config',
    );
  });

  it('throws on missing clientSecret', () => {
    expect(() => validateSabreConfig(makeSabreConfig({ clientSecret: '' }))).toThrow(
      'Invalid Sabre config',
    );
  });

  it('throws on invalid environment', () => {
    expect(() => validateSabreConfig(makeSabreConfig({ environment: 'staging' }))).toThrow(
      'Invalid Sabre config',
    );
  });

  it('defaults environment to cert', () => {
    const { environment: _env, ...rest } = makeSabreConfig();
    const config = validateSabreConfig(rest);
    expect(config.environment).toBe('cert');
  });

  it('defaults currency to USD', () => {
    const { defaultCurrency: _dc, ...rest } = makeSabreConfig();
    const config = validateSabreConfig(rest);
    expect(config.defaultCurrency).toBe('USD');
  });

  it('allows optional pcc', () => {
    const { pcc: _pcc, ...rest } = makeSabreConfig();
    const config = validateSabreConfig(rest);
    expect(config.pcc).toBeUndefined();
  });

  it('returns correct base URL for cert', () => {
    expect(getBaseUrl('cert')).toBe(SABRE_CERT_BASE_URL);
  });

  it('returns correct base URL for prod', () => {
    expect(getBaseUrl('prod')).toBe(SABRE_PROD_BASE_URL);
  });
});

// ============================================================
// AUTH TESTS
// ============================================================

describe('SabreAuth', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeAuthResponse(expiresIn = 604800) {
    return {
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'T1RLAQLtest-token',
          token_type: 'bearer',
          expires_in: expiresIn,
        }),
    };
  }

  it('fetches token on first call', async () => {
    mockFetch.mockResolvedValue(makeAuthResponse());
    const auth = new SabreAuth(validateSabreConfig(makeSabreConfig()));
    const token = await auth.getToken();
    expect(token).toBe('T1RLAQLtest-token');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('caches token on subsequent calls', async () => {
    mockFetch.mockResolvedValue(makeAuthResponse());
    const auth = new SabreAuth(validateSabreConfig(makeSabreConfig()));
    await auth.getToken();
    await auth.getToken();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sends correct Authorization header', async () => {
    mockFetch.mockResolvedValue(makeAuthResponse());
    const auth = new SabreAuth(validateSabreConfig(makeSabreConfig()));
    await auth.getToken();
    const [_url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    const expected = btoa(`${btoa('test-client-id')}:${btoa('test-client-secret')}`);
    expect(headers['Authorization']).toBe(`Basic ${expected}`);
  });

  it('sends correct content type and body', async () => {
    mockFetch.mockResolvedValue(makeAuthResponse());
    const auth = new SabreAuth(validateSabreConfig(makeSabreConfig()));
    await auth.getToken();
    const [_url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(opts.body).toBe('grant_type=client_credentials');
  });

  it('calls correct token URL for cert', async () => {
    mockFetch.mockResolvedValue(makeAuthResponse());
    const auth = new SabreAuth(validateSabreConfig(makeSabreConfig()));
    await auth.getToken();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('https://api.cert.platform.sabre.com/v2/auth/token');
  });

  it('calls correct token URL for prod', async () => {
    mockFetch.mockResolvedValue(makeAuthResponse());
    const auth = new SabreAuth(
      validateSabreConfig(makeSabreConfig({ environment: 'prod' })),
    );
    await auth.getToken();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('https://api.platform.sabre.com/v2/auth/token');
  });

  it('throws on auth failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });
    const auth = new SabreAuth(validateSabreConfig(makeSabreConfig()));
    await expect(auth.getToken()).rejects.toThrow('Sabre auth failed');
  });

  it('invalidate clears cached token', async () => {
    mockFetch.mockResolvedValue(makeAuthResponse());
    const auth = new SabreAuth(validateSabreConfig(makeSabreConfig()));
    await auth.getToken();
    auth.invalidate();
    await auth.getToken();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('refreshes token near expiry', async () => {
    mockFetch.mockResolvedValue(makeAuthResponse(30));
    const auth = new SabreAuth(validateSabreConfig(makeSabreConfig()));
    await auth.getToken();
    await auth.getToken();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// MAPPER — PAX TYPE TESTS
// ============================================================

describe('mapPaxType', () => {
  it('maps ADT to adult', () => expect(mapPaxType('ADT')).toBe('adult'));
  it('maps CNN to child', () => expect(mapPaxType('CNN')).toBe('child'));
  it('maps CHD to child', () => expect(mapPaxType('CHD')).toBe('child'));
  it('maps INF to infant', () => expect(mapPaxType('INF')).toBe('infant'));
  it('maps INS to infant', () => expect(mapPaxType('INS')).toBe('infant'));
  it('defaults unknown to adult', () => expect(mapPaxType('XYZ')).toBe('adult'));
});

describe('reverseMapPaxType', () => {
  it('maps adult to ADT', () => expect(reverseMapPaxType('adult')).toBe('ADT'));
  it('maps child to CNN', () => expect(reverseMapPaxType('child')).toBe('CNN'));
  it('maps infant to INF', () => expect(reverseMapPaxType('infant')).toBe('INF'));
  it('defaults unknown to ADT', () => expect(reverseMapPaxType('xyz')).toBe('ADT'));
});

describe('mapCabinClass', () => {
  it('maps Y to economy', () => expect(mapCabinClass('Y')).toBe('economy'));
  it('maps C to business', () => expect(mapCabinClass('C')).toBe('business'));
  it('maps F to first', () => expect(mapCabinClass('F')).toBe('first'));
  it('maps S to premium_economy', () => expect(mapCabinClass('S')).toBe('premium_economy'));
  it('maps Economy to economy', () => expect(mapCabinClass('Economy')).toBe('economy'));
  it('maps Business to business', () => expect(mapCabinClass('Business')).toBe('business'));
  it('defaults unknown to economy', () => expect(mapCabinClass('Z')).toBe('economy'));
});

// ============================================================
// MAPPER — MONEY TESTS
// ============================================================

describe('toMoney', () => {
  it('converts number to string amount', () => {
    const result = toMoney(610.50, 'USD');
    expect(result.amount).toBe('610.5');
    expect(result.currency).toBe('USD');
  });

  it('avoids floating point errors', () => {
    const result = toMoney(0.1 + 0.2, 'USD');
    expect(parseFloat(result.amount)).toBeCloseTo(0.3, 10);
  });

  it('handles undefined as zero', () => {
    const result = toMoney(undefined, 'EUR');
    expect(result.amount).toBe('0');
    expect(result.currency).toBe('EUR');
  });

  it('preserves precision for large numbers', () => {
    const result = toMoney(123456.789, 'GBP');
    expect(result.amount).toBe('123456.789');
  });
});

// ============================================================
// MAPPER — SEARCH REQUEST
// ============================================================

describe('mapSearchRequest', () => {
  const config = validateSabreConfig(makeSabreConfig());

  it('builds one-way request', () => {
    const req = mapSearchRequest(makeSearchInput(), config);
    const rq = req.OTA_AirLowFareSearchRQ;
    expect(rq.OriginDestinationInformation).toHaveLength(1);
    expect(rq.OriginDestinationInformation[0].OriginLocation.LocationCode).toBe('JFK');
    expect(rq.OriginDestinationInformation[0].DestinationLocation.LocationCode).toBe('LHR');
  });

  it('builds round-trip request', () => {
    const req = mapSearchRequest(
      makeSearchInput({ returnDate: '2026-06-22' }),
      config,
    );
    expect(req.OTA_AirLowFareSearchRQ.OriginDestinationInformation).toHaveLength(2);
    const ret = req.OTA_AirLowFareSearchRQ.OriginDestinationInformation[1];
    expect(ret.OriginLocation.LocationCode).toBe('LHR');
    expect(ret.DestinationLocation.LocationCode).toBe('JFK');
  });

  it('maps passengers correctly', () => {
    const req = mapSearchRequest(
      makeSearchInput({ passengers: { adults: 2, children: 1, infants: 1 } }),
      config,
    );
    const pax = req.OTA_AirLowFareSearchRQ.TravelerInfoSummary.AirTravelerAvail[0].PassengerTypeQuantity;
    expect(pax).toHaveLength(3);
    expect(pax[0]).toEqual({ Code: 'ADT', Quantity: 2 });
    expect(pax[1]).toEqual({ Code: 'CNN', Quantity: 1 });
    expect(pax[2]).toEqual({ Code: 'INF', Quantity: 1 });
  });

  it('sets cabin class preference', () => {
    const req = mapSearchRequest(
      makeSearchInput({ cabinClass: 'business' }),
      config,
    );
    expect(req.OTA_AirLowFareSearchRQ.TravelPreferences?.CabinPref).toEqual([
      { Cabin: 'Business' },
    ]);
  });

  it('sets direct only', () => {
    const req = mapSearchRequest(
      makeSearchInput({ directOnly: true }),
      config,
    );
    expect(req.OTA_AirLowFareSearchRQ.TravelPreferences?.MaxStopsQuantity).toBe(0);
  });

  it('sets preferred airlines', () => {
    const req = mapSearchRequest(
      makeSearchInput({ preferredAirlines: ['BA', 'AA'] }),
      config,
    );
    expect(req.OTA_AirLowFareSearchRQ.TravelPreferences?.VendorPref).toEqual([
      { Code: 'BA', PreferLevel: 'Preferred' },
      { Code: 'AA', PreferLevel: 'Preferred' },
    ]);
  });

  it('sets currency from input', () => {
    const req = mapSearchRequest(
      makeSearchInput({ currency: 'GBP' }),
      config,
    );
    expect(
      req.OTA_AirLowFareSearchRQ.TravelerInfoSummary.PriceRequestInformation?.CurrencyCode,
    ).toBe('GBP');
  });

  it('defaults currency from config', () => {
    const req = mapSearchRequest(makeSearchInput(), config);
    expect(
      req.OTA_AirLowFareSearchRQ.TravelerInfoSummary.PriceRequestInformation?.CurrencyCode,
    ).toBe('USD');
  });

  it('sets POS with PCC from config', () => {
    const req = mapSearchRequest(makeSearchInput(), config);
    expect(req.OTA_AirLowFareSearchRQ.POS.Source[0].PseudoCityCode).toBe('AB12');
  });

  it('sets Version and ResponseType', () => {
    const req = mapSearchRequest(makeSearchInput(), config);
    expect(req.OTA_AirLowFareSearchRQ.Version).toBe('5');
    expect(req.OTA_AirLowFareSearchRQ.ResponseType).toBe('GIR-JSON');
  });
});

// ============================================================
// MAPPER — SEARCH RESPONSE
// ============================================================

describe('mapSearchResponse', () => {
  it('maps single itinerary', () => {
    const offers = mapSearchResponse(makeBfmResponse());
    expect(offers).toHaveLength(1);
    expect(offers[0].offerId).toBe('sabre-1-0');
    expect(offers[0].supplier).toBe('sabre');
    expect(offers[0].validatingCarrier).toBe('BA');
  });

  it('resolves segments from descriptors', () => {
    const offers = mapSearchResponse(makeBfmResponse());
    expect(offers[0].segments).toHaveLength(1);
    const seg = offers[0].segments[0][0];
    expect(seg.origin).toBe('JFK');
    expect(seg.destination).toBe('LHR');
    expect(seg.marketingCarrier).toBe('BA');
    expect(seg.flightNumber).toBe('178');
    expect(seg.equipment).toBe('777');
    expect(seg.stops).toBe(0);
  });

  it('maps fare breakdowns', () => {
    const offers = mapSearchResponse(makeBfmResponse());
    const fare = offers[0].fares[0];
    expect(fare.passengerType).toBe('adult');
    expect(fare.baseFare.amount).toBe('500');
    expect(fare.taxes.amount).toBe('110.5');
    expect(fare.total.amount).toBe('610.5');
    expect(fare.count).toBe(1);
  });

  it('maps total price', () => {
    const offers = mapSearchResponse(makeBfmResponse());
    expect(offers[0].totalPrice.amount).toBe('610.5');
    expect(offers[0].totalPrice.currency).toBe('USD');
  });

  it('maps refundable status', () => {
    const offers = mapSearchResponse(makeBfmResponse());
    expect(offers[0].refundable).toBe(true);
  });

  it('maps non-refundable', () => {
    const response = makeBfmResponse();
    const paxInfo = response.groupedItineraryResponse.itineraryGroups![0]
      .itineraries![0].pricingInformation![0].fare.passengerInfoList[0].passengerInfo!;
    paxInfo.nonRefundable = true;
    const offers = mapSearchResponse(response);
    expect(offers[0].refundable).toBe(false);
  });

  it('maps baggage allowance', () => {
    const offers = mapSearchResponse(makeBfmResponse());
    expect(offers[0].baggageAllowance).toBe('2PC');
  });

  it('maps expiration date', () => {
    const offers = mapSearchResponse(makeBfmResponse());
    expect(offers[0].expiresAt).toBe('2026-06-01');
  });

  it('returns empty array for no itinerary groups', () => {
    const offers = mapSearchResponse(makeBfmResponse({ itineraryGroups: [] }));
    expect(offers).toHaveLength(0);
  });

  it('returns empty for missing itineraries', () => {
    const offers = mapSearchResponse(
      makeBfmResponse({
        itineraryGroups: [
          {
            groupDescription: { legDescriptions: [{ departureDate: '2026-06-15' }] },
            itineraries: [],
          },
        ],
      }),
    );
    expect(offers).toHaveLength(0);
  });

  it('handles multiple pricing options per itinerary', () => {
    const response = makeBfmResponse();
    const itin = response.groupedItineraryResponse.itineraryGroups![0].itineraries![0];
    itin.pricingInformation!.push({
      ...itin.pricingInformation![0],
      fare: {
        ...itin.pricingInformation![0].fare,
        validatingCarrierCode: 'AA',
      },
    });
    const offers = mapSearchResponse(response);
    expect(offers).toHaveLength(2);
    expect(offers[0].offerId).toBe('sabre-1-0');
    expect(offers[1].offerId).toBe('sabre-1-1');
  });
});

// ============================================================
// MAPPER — PRICE RESPONSE
// ============================================================

describe('mapPriceResponse', () => {
  it('maps available itinerary', () => {
    const result = mapPriceResponse(makeBfmResponse(), 'sabre-1-0');
    expect(result.available).toBe(true);
    expect(result.totalPrice.amount).toBe('610.5');
  });

  it('detects price change', () => {
    const result = mapPriceResponse(makeBfmResponse(), 'old-offer-id');
    expect(result.priceChanged).toBe(true);
  });

  it('handles empty response as unavailable', () => {
    const result = mapPriceResponse(
      makeBfmResponse({ itineraryGroups: [] }),
      'sabre-1-0',
    );
    expect(result.available).toBe(false);
    expect(result.totalPrice.amount).toBe('0');
  });
});

// ============================================================
// MAPPER — BOOKING REQUEST
// ============================================================

describe('mapCreateBookingRequest', () => {
  it('maps passengers to travelers', () => {
    const req = mapCreateBookingRequest(makeBookingInput());
    expect(req.travelers).toHaveLength(1);
    expect(req.travelers![0].givenName).toBe('John');
    expect(req.travelers![0].surname).toBe('Smith');
    expect(req.travelers![0].passengerCode).toBe('ADT');
  });

  it('maps passport as identity document', () => {
    const req = mapCreateBookingRequest(makeBookingInput());
    const doc = req.travelers![0].identityDocuments![0];
    expect(doc.documentNumber).toBe('AB123456');
    expect(doc.documentType).toBe('PASSPORT');
    expect(doc.expiryDate).toBe('2030-05-15');
    expect(doc.issuingCountryCode).toBe('US');
  });

  it('maps contact info', () => {
    const req = mapCreateBookingRequest(makeBookingInput());
    expect(req.contactInfo?.emails).toEqual(['john@example.com']);
    expect(req.contactInfo?.phones).toEqual(['+1-555-123-4567']);
  });

  it('sets CASH payment type', () => {
    const req = mapCreateBookingRequest(makeBookingInput());
    expect(req.payment?.formsOfPayment[0].type).toBe('CASH');
  });

  it('sets flight offer from offerId', () => {
    const req = mapCreateBookingRequest(makeBookingInput());
    expect(req.flightOffer?.offerId).toBe('sabre-1-0');
  });

  it('maps child passenger code', () => {
    const input = makeBookingInput({
      passengers: [
        {
          type: 'child',
          gender: 'F',
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: '2018-03-10',
        },
      ],
    });
    const req = mapCreateBookingRequest(input);
    expect(req.travelers![0].passengerCode).toBe('CNN');
  });

  it('maps infant passenger code', () => {
    const input = makeBookingInput({
      passengers: [
        {
          type: 'infant',
          gender: 'M',
          firstName: 'Baby',
          lastName: 'Smith',
          dateOfBirth: '2025-01-15',
        },
      ],
    });
    const req = mapCreateBookingRequest(input);
    expect(req.travelers![0].passengerCode).toBe('INF');
  });

  it('omits identity documents when no passport', () => {
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
    const req = mapCreateBookingRequest(input);
    expect(req.travelers![0].identityDocuments).toBeUndefined();
  });
});

// ============================================================
// MAPPER — BOOKING RESPONSE
// ============================================================

describe('mapCreateBookingResponse', () => {
  it('maps successful booking', () => {
    const result = mapCreateBookingResponse(makeCreateBookingResponse());
    expect(result.bookingId).toBe('ABCDEF');
    expect(result.pnr).toBe('ABCDEF');
    expect(result.status).toBe('held');
    expect(result.supplier).toBe('sabre');
  });

  it('maps flight segments', () => {
    const result = mapCreateBookingResponse(makeCreateBookingResponse());
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0][0].origin).toBe('JFK');
    expect(result.segments[0][0].destination).toBe('LHR');
  });

  it('maps passengers', () => {
    const result = mapCreateBookingResponse(makeCreateBookingResponse());
    expect(result.passengers).toHaveLength(1);
    expect(result.passengers[0].firstName).toBe('John');
    expect(result.passengers[0].lastName).toBe('Smith');
  });

  it('maps total price', () => {
    const result = mapCreateBookingResponse(makeCreateBookingResponse());
    expect(result.totalPrice.amount).toBe('610.5');
    expect(result.totalPrice.currency).toBe('USD');
  });

  it('maps payment deadline', () => {
    const result = mapCreateBookingResponse(makeCreateBookingResponse());
    expect(result.paymentDeadline).toBe('2026-06-20T23:59');
  });

  it('maps failed booking with errors', () => {
    const result = mapCreateBookingResponse(
      makeCreateBookingResponse({
        errors: [{ description: 'Flight sold out', code: 'ERR001' }],
      }),
    );
    expect(result.status).toBe('failed');
  });
});

// ============================================================
// MAPPER — GET BOOKING RESPONSE
// ============================================================

describe('mapGetBookingResponse', () => {
  it('maps held booking', () => {
    const result = mapGetBookingResponse(makeGetBookingResponse(), 'ABCDEF');
    expect(result.bookingId).toBe('ABCDEF');
    expect(result.status).toBe('held');
    expect(result.pnr).toBe('ABCDEF');
  });

  it('maps ticketed booking', () => {
    const resp = makeGetBookingResponse();
    resp.booking!.isTicketed = true;
    resp.booking!.flightTickets = [
      { number: '0167489825830', date: '2026-06-15' },
    ];
    const result = mapGetBookingResponse(resp, 'ABCDEF');
    expect(result.status).toBe('ticketed');
    expect(result.ticketNumbers).toEqual(['0167489825830']);
  });

  it('maps flights to segments', () => {
    const result = mapGetBookingResponse(makeGetBookingResponse(), 'ABCDEF');
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0][0].flightNumber).toBe('178');
  });

  it('maps travelers to passengers', () => {
    const result = mapGetBookingResponse(makeGetBookingResponse(), 'ABCDEF');
    expect(result.passengers).toHaveLength(1);
    expect(result.passengers[0].firstName).toBe('John');
  });

  it('handles response with errors', () => {
    const result = mapGetBookingResponse(
      makeGetBookingResponse({
        errors: [{ description: 'PNR not found' }],
      }),
      'BADPNR',
    );
    expect(result.status).toBe('failed');
  });
});

// ============================================================
// MAPPER — CANCEL RESPONSE
// ============================================================

describe('mapCancelResponse', () => {
  it('maps successful cancellation', () => {
    const result = mapCancelResponse({ timestamp: '2026-06-15T10:00:00Z' }, 'ABCDEF');
    expect(result.success).toBe(true);
    expect(result.message).toBe('Booking ABCDEF cancelled');
  });

  it('maps failed cancellation', () => {
    const result = mapCancelResponse(
      { errors: [{ description: 'Cannot cancel ticketed booking' }] },
      'ABCDEF',
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('Cannot cancel ticketed booking');
  });

  it('joins multiple error messages', () => {
    const result = mapCancelResponse(
      {
        errors: [
          { description: 'Error 1' },
          { description: 'Error 2' },
        ],
      },
      'ABCDEF',
    );
    expect(result.message).toBe('Error 1; Error 2');
  });
});

// ============================================================
// MAPPER — FULFILL RESPONSE
// ============================================================

describe('mapFulfillResponse', () => {
  it('maps ticketed response', () => {
    const result = mapFulfillResponse(makeFulfillResponse(), 'ABCDEF');
    expect(result.status).toBe('ticketed');
    expect(result.ticketNumbers).toEqual(['0167489825830']);
    expect(result.bookingId).toBe('ABCDEF');
  });

  it('maps confirmed when no tickets', () => {
    const result = mapFulfillResponse(makeFulfillResponse({ tickets: [] }), 'ABCDEF');
    expect(result.status).toBe('confirmed');
    expect(result.ticketNumbers).toBeUndefined();
  });

  it('maps confirmed when tickets is undefined', () => {
    const result = mapFulfillResponse(makeFulfillResponse({ tickets: undefined }), 'ABCDEF');
    expect(result.status).toBe('confirmed');
  });
});

// ============================================================
// ADAPTER INTEGRATION TESTS
// ============================================================

describe('SabreAdapter', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let adapter: SabreAdapter;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/v2/auth/token')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'test-token',
              token_type: 'bearer',
              expires_in: 604800,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    adapter = new SabreAdapter(makeSabreConfig());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('constructs with valid config', () => {
    expect(adapter.supplierId).toBe('sabre');
    expect(adapter.supplierName).toBe('Sabre GDS');
  });

  it('throws on invalid config', () => {
    expect(() => new SabreAdapter({})).toThrow('Invalid Sabre config');
  });

  describe('searchFlights', () => {
    it('calls correct URL with bearer auth', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v2/auth/token')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'test-token',
                token_type: 'bearer',
                expires_in: 604800,
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeBfmResponse()),
        });
      });

      const offers = await adapter.searchFlights(makeSearchInput());
      expect(offers).toHaveLength(1);

      const searchCall = mockFetch.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('/v5/offers/shop'),
      );
      expect(searchCall).toBeDefined();
      const headers = (searchCall![1] as RequestInit).headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('handles 500 as retryable', async () => {
      let callCount = 0;
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v2/auth/token')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'test-token',
                token_type: 'bearer',
                expires_in: 604800,
              }),
          });
        }
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeBfmResponse()),
        });
      });

      const adapterWithFastRetry = new SabreAdapter({
        ...makeSabreConfig(),
        timeoutMs: 30000,
        maxRetries: 1,
        baseDelayMs: 1,
        maxDelayMs: 1,
      });

      const offers = await adapterWithFastRetry.searchFlights(makeSearchInput());
      expect(offers).toHaveLength(1);
    });
  });

  describe('createBooking', () => {
    it('calls createBooking endpoint', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v2/auth/token')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'test-token',
                token_type: 'bearer',
                expires_in: 604800,
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeCreateBookingResponse()),
        });
      });

      const result = await adapter.createBooking(makeBookingInput());
      expect(result.bookingId).toBe('ABCDEF');
      expect(result.status).toBe('held');

      const bookCall = mockFetch.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('/createBooking'),
      );
      expect(bookCall).toBeDefined();
    });

    it('throws ConnectError on booking errors', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v2/auth/token')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'test-token',
                token_type: 'bearer',
                expires_in: 604800,
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              makeCreateBookingResponse({
                errors: [{ description: 'Flight sold out' }],
              }),
            ),
        });
      });

      await expect(adapter.createBooking(makeBookingInput())).rejects.toThrow(
        ConnectError,
      );
    });
  });

  describe('getBookingStatus', () => {
    it('calls getBooking endpoint', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v2/auth/token')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'test-token',
                token_type: 'bearer',
                expires_in: 604800,
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeGetBookingResponse()),
        });
      });

      const result = await adapter.getBookingStatus('ABCDEF');
      expect(result.bookingId).toBe('ABCDEF');
      expect(result.status).toBe('held');
    });
  });

  describe('cancelBooking', () => {
    it('returns success on clean cancel', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v2/auth/token')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'test-token',
                token_type: 'bearer',
                expires_in: 604800,
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ timestamp: '2026-06-15T10:00:00Z' } as SabreCancelBookingResponse),
        });
      });

      const result = await adapter.cancelBooking('ABCDEF');
      expect(result.success).toBe(true);
    });
  });

  describe('requestTicketing', () => {
    it('returns ticketed status with ticket numbers', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v2/auth/token')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'test-token',
                token_type: 'bearer',
                expires_in: 604800,
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeFulfillResponse()),
        });
      });

      const result = await adapter.requestTicketing('ABCDEF');
      expect(result.status).toBe('ticketed');
      expect(result.ticketNumbers).toEqual(['0167489825830']);
    });
  });

  describe('healthCheck', () => {
    it('returns healthy on successful response', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v2/auth/token')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: 'test-token',
                token_type: 'bearer',
                expires_in: 604800,
              }),
          });
        }
        return Promise.resolve({ ok: true, status: 200 });
      });

      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns unhealthy on network error', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v2/auth/token')) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.reject(new Error('Network error'));
      });

      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(false);
    });
  });

  describe('401 token refresh', () => {
    it('invalidates token and retries on 401', async () => {
      let shopCallCount = 0;
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v2/auth/token')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: `token-${Date.now()}`,
                token_type: 'bearer',
                expires_in: 604800,
              }),
          });
        }
        shopCallCount++;
        if (shopCallCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeBfmResponse()),
        });
      });

      const adapterWithRetry = new SabreAdapter({
        ...makeSabreConfig(),
        maxRetries: 1,
        baseDelayMs: 1,
        maxDelayMs: 1,
      });

      const offers = await adapterWithRetry.searchFlights(makeSearchInput());
      expect(offers).toHaveLength(1);
    });
  });
});

// ============================================================
// SUPPLIER REGISTRY TEST
// ============================================================

describe('Supplier Registry', () => {
  it('registers sabre adapter', async () => {
    const { listSuppliers, createAdapter } = await import('../../../suppliers/index.js');
    expect(listSuppliers()).toContain('sabre');

    const adapter = createAdapter('sabre', makeSabreConfig());
    expect(adapter.supplierId).toBe('sabre');
  });
});
