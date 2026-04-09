import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectError } from '../../../base-adapter.js';
import type { CreateBookingInput, SearchFlightsInput } from '../../../types.js';
import { NavitaireAuth } from '../auth.js';
import { validateNavitaireConfig } from '../config.js';
import { NavitaireAdapter } from '../index.js';
import {
  mapCabinClass,
  mapCancelResponse,
  mapCreateBookingResponse,
  mapGetBookingResponse,
  mapNavitaireErrorCode,
  mapPassengersRequest,
  mapPaymentRequest,
  mapPaxType,
  mapPriceResponse,
  mapPrimaryContactRequest,
  mapSearchRequest,
  mapSearchResponse,
  mapTicketingResponse,
  mapTripSellRequest,
  reverseMapPaxType,
  toMoney,
} from '../mapper.js';
import { NavitaireSessionManager } from '../session.js';
import type {
  AvailabilityResponse,
  BookingCommitData,
  BookingData,
  BookingPriceResponse,
} from '../types.js';

// ============================================================
// TEST HELPERS
// ============================================================

function makeNavitaireConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    environment: 'test',
    baseUrl: 'https://dotrezapi.test.1n.navitaire.com',
    credentials: {
      domain: 'EXT',
      username: 'testuser',
      password: 'testpass',
    },
    defaultCurrencyCode: 'USD',
    sessionTimeoutMs: 1_200_000,
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
    offerId: 'navitaire-JK001-FA001',
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

function makeAvailabilityResponse(
  overrides: Partial<AvailabilityResponse> = {},
): AvailabilityResponse {
  return {
    trips: [
      {
        originStationCode: 'JFK',
        destinationStationCode: 'LHR',
        journeysAvailable: [
          {
            journeyKey: 'JK001',
            designator: {
              origin: 'JFK',
              destination: 'LHR',
              departure: '2026-06-15T18:00:00',
              arrival: '2026-06-16T06:30:00',
            },
            segments: [
              {
                segmentKey: 'SEG001',
                designator: {
                  origin: 'JFK',
                  destination: 'LHR',
                  departure: '2026-06-15T18:00:00',
                  arrival: '2026-06-16T06:30:00',
                },
                identifier: {
                  identifier: '178',
                  carrierCode: 'BA',
                },
                externalIdentifier: {
                  identifier: '178',
                  carrierCode: 'BA',
                },
                legs: [
                  {
                    legKey: 'LEG001',
                    operatingCarrier: 'BA',
                    operatingFlightNumber: '178',
                    equipmentType: '777',
                  },
                ],
                cabinOfService: 'Y',
              },
            ],
            fares: [
              {
                fareAvailabilityKey: 'FA001',
                productClass: 'EC',
                classOfService: 'Y',
                classType: 'R',
                passengerFares: [
                  {
                    passengerType: 'ADT',
                    fareAmount: 500,
                    serviceCharges: [
                      { amount: 80, code: 'TAX1', type: 'Tax', currencyCode: 'USD' },
                      { amount: 30.5, code: 'TAX2', type: 'Tax', currencyCode: 'USD' },
                    ],
                  },
                ],
              },
            ],
            stops: 0,
          },
        ],
      },
    ],
    currencyCode: 'USD',
    ...overrides,
  };
}

function makeBookingData(overrides: Partial<BookingData> = {}): BookingData {
  return {
    recordLocator: 'ABC123',
    locators: {
      recordLocators: [{ recordCode: 'ABC123', owningSystemCode: 'NSK' }],
    },
    info: {
      status: 1,
      paidStatus: 0,
      currencyCode: 'USD',
      bookedDate: '2026-06-15T10:00:00Z',
      createdDate: '2026-06-15T10:00:00Z',
    },
    journeys: [
      {
        journeyKey: 'JK001',
        designator: {
          origin: 'JFK',
          destination: 'LHR',
          departure: '2026-06-15T18:00:00',
          arrival: '2026-06-16T06:30:00',
        },
        segments: [
          {
            segmentKey: 'SEG001',
            designator: {
              origin: 'JFK',
              destination: 'LHR',
              departure: '2026-06-15T18:00:00',
              arrival: '2026-06-16T06:30:00',
            },
            identifier: {
              identifier: '178',
              carrierCode: 'BA',
            },
            externalIdentifier: {
              identifier: '178',
              carrierCode: 'BA',
            },
            legs: [
              {
                legKey: 'LEG001',
                operatingCarrier: 'BA',
                operatingFlightNumber: '178',
                equipmentType: '777',
              },
            ],
            cabinOfService: 'Y',
          },
        ],
        stops: 0,
      },
    ],
    passengers: {
      P0: {
        passengerKey: 'P0',
        passengerTypeCode: 'ADT',
        name: { first: 'John', last: 'Smith', title: 'MR' },
        info: { dateOfBirth: '1990-05-15', gender: 'Male', nationality: 'US' },
      },
    },
    breakdown: {
      totalAmount: 610.5,
      balanceDue: 610.5,
      passengerTotals: {
        P0: {
          services: { total: 610.5, taxes: 110.5, charges: 0 },
        },
      },
    },
    ...overrides,
  };
}

// ============================================================
// CONFIG TESTS
// ============================================================

describe('NavitaireConfig', () => {
  it('validates a valid config', () => {
    const config = validateNavitaireConfig(makeNavitaireConfig());
    expect(config.environment).toBe('test');
    expect(config.baseUrl).toBe('https://dotrezapi.test.1n.navitaire.com');
    expect(config.credentials.domain).toBe('EXT');
    expect(config.credentials.username).toBe('testuser');
    expect(config.credentials.password).toBe('testpass');
    expect(config.defaultCurrencyCode).toBe('USD');
    expect(config.sessionTimeoutMs).toBe(1_200_000);
  });

  it('rejects missing baseUrl', () => {
    expect(() => validateNavitaireConfig(makeNavitaireConfig({ baseUrl: undefined }))).toThrow(
      'Invalid Navitaire config',
    );
  });

  it('rejects invalid baseUrl', () => {
    expect(() => validateNavitaireConfig(makeNavitaireConfig({ baseUrl: 'not-a-url' }))).toThrow(
      'Invalid Navitaire config',
    );
  });

  it('rejects missing credentials', () => {
    expect(() => validateNavitaireConfig(makeNavitaireConfig({ credentials: undefined }))).toThrow(
      'Invalid Navitaire config',
    );
  });

  it('rejects empty username', () => {
    expect(() =>
      validateNavitaireConfig(
        makeNavitaireConfig({ credentials: { domain: 'EXT', username: '', password: 'pass' } }),
      ),
    ).toThrow('Invalid Navitaire config');
  });

  it('uses default currency code when not provided', () => {
    const raw = makeNavitaireConfig();
    delete (raw as Record<string, unknown>).defaultCurrencyCode;
    const config = validateNavitaireConfig(raw);
    expect(config.defaultCurrencyCode).toBe('USD');
  });

  it('uses default session timeout when not provided', () => {
    const raw = makeNavitaireConfig();
    delete (raw as Record<string, unknown>).sessionTimeoutMs;
    const config = validateNavitaireConfig(raw);
    expect(config.sessionTimeoutMs).toBe(1_200_000);
  });

  it('uses default environment when not provided', () => {
    const raw = makeNavitaireConfig();
    delete (raw as Record<string, unknown>).environment;
    const config = validateNavitaireConfig(raw);
    expect(config.environment).toBe('test');
  });

  it('rejects invalid environment', () => {
    expect(() => validateNavitaireConfig(makeNavitaireConfig({ environment: 'staging' }))).toThrow(
      'Invalid Navitaire config',
    );
  });

  it('rejects invalid currency code length', () => {
    expect(() =>
      validateNavitaireConfig(makeNavitaireConfig({ defaultCurrencyCode: 'USDD' })),
    ).toThrow('Invalid Navitaire config');
  });
});

// ============================================================
// AUTH TESTS
// ============================================================

describe('NavitaireAuth', () => {
  const mockConfig = validateNavitaireConfig(makeNavitaireConfig());

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a token on first call', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: 'jwt-token-123', idleTimeoutInMinutes: 20 }), {
        status: 200,
      }),
    );

    const auth = new NavitaireAuth(mockConfig);
    const token = await auth.getToken();

    expect(token).toBe('jwt-token-123');
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://dotrezapi.test.1n.navitaire.com/api/auth/v1/token/user',
    );
  });

  it('returns cached token on subsequent calls', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: 'jwt-token-123', idleTimeoutInMinutes: 20 }), {
        status: 200,
      }),
    );

    const auth = new NavitaireAuth(mockConfig);
    const token1 = await auth.getToken();
    const token2 = await auth.getToken();

    expect(token1).toBe('jwt-token-123');
    expect(token2).toBe('jwt-token-123');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('sends correct credentials in request body', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: 'jwt-token-123', idleTimeoutInMinutes: 20 }), {
        status: 200,
      }),
    );

    const auth = new NavitaireAuth(mockConfig);
    await auth.getToken();

    const callInit = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(callInit.body as string) as Record<string, unknown>;
    expect(body.domainCode).toBe('EXT');
    expect(body.username).toBe('testuser');
    expect(body.password).toBe('testpass');
  });

  it('throws on auth failure', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    const auth = new NavitaireAuth(mockConfig);
    await expect(auth.getToken()).rejects.toThrow('Navitaire auth failed: 401');
  });

  it('invalidate clears cached token', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'token-1', idleTimeoutInMinutes: 20 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'token-2', idleTimeoutInMinutes: 20 }), {
          status: 200,
        }),
      );

    const auth = new NavitaireAuth(mockConfig);
    const token1 = await auth.getToken();
    expect(token1).toBe('token-1');

    auth.invalidate();
    const token2 = await auth.getToken();
    expect(token2).toBe('token-2');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('refreshes token when close to expiry', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'token-1', idleTimeoutInMinutes: 0.5 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'token-refreshed', idleTimeoutInMinutes: 20 }), {
          status: 200,
        }),
      );

    const auth = new NavitaireAuth(mockConfig);
    await auth.getToken(); // creates token with 30s expiry

    // Advance time to force refresh window
    vi.useFakeTimers();
    vi.advanceTimersByTime(25_000); // 25s of 30s expiry

    // Next call should trigger refresh (PUT)
    const token = await auth.getToken();
    expect(token).toBe('token-refreshed');
    vi.useRealTimers();
  });
});

// ============================================================
// SESSION TESTS
// ============================================================

describe('NavitaireSessionManager', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provides token to operation', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: 'session-token', idleTimeoutInMinutes: 20 }), {
        status: 200,
      }),
    );

    const config = validateNavitaireConfig(makeNavitaireConfig());
    const auth = new NavitaireAuth(config);
    const session = new NavitaireSessionManager(auth);

    const result = await session.withSession(async (token) => {
      return `got-${token}`;
    });

    expect(result).toBe('got-session-token');
  });

  it('enforces sequential execution', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ token: 'session-token', idleTimeoutInMinutes: 20 }), {
        status: 200,
      }),
    );

    const config = validateNavitaireConfig(makeNavitaireConfig());
    const auth = new NavitaireAuth(config);
    const session = new NavitaireSessionManager(auth);

    const executionOrder: number[] = [];

    const op1 = session.withSession(async () => {
      await new Promise((r) => setTimeout(r, 50));
      executionOrder.push(1);
      return 1;
    });

    const op2 = session.withSession(async () => {
      executionOrder.push(2);
      return 2;
    });

    await Promise.all([op1, op2]);
    expect(executionOrder).toEqual([1, 2]);
  });

  it('tracks booking state during stateful flow', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ token: 'session-token', idleTimeoutInMinutes: 20 }), {
        status: 200,
      }),
    );

    const config = validateNavitaireConfig(makeNavitaireConfig());
    const auth = new NavitaireAuth(config);
    const session = new NavitaireSessionManager(auth);

    expect(session.bookingInState).toBe(false);

    let duringFlow = false;
    await session.withStatefulFlow(async () => {
      duringFlow = session.bookingInState;
      return 'done';
    });

    expect(duringFlow).toBe(true);
    expect(session.bookingInState).toBe(false);
  });

  it('clears booking state on error', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ token: 'session-token', idleTimeoutInMinutes: 20 }), {
        status: 200,
      }),
    );

    const config = validateNavitaireConfig(makeNavitaireConfig());
    const auth = new NavitaireAuth(config);
    const session = new NavitaireSessionManager(auth);

    try {
      await session.withStatefulFlow(async () => {
        throw new Error('step failed');
      });
    } catch {
      // expected
    }

    expect(session.bookingInState).toBe(false);
  });

  it('releases lock on error so next operation proceeds', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ token: 'session-token', idleTimeoutInMinutes: 20 }), {
        status: 200,
      }),
    );

    const config = validateNavitaireConfig(makeNavitaireConfig());
    const auth = new NavitaireAuth(config);
    const session = new NavitaireSessionManager(auth);

    try {
      await session.withSession(async () => {
        throw new Error('fail');
      });
    } catch {
      // expected
    }

    const result = await session.withSession(async () => 'recovered');
    expect(result).toBe('recovered');
  });
});

// ============================================================
// MAPPER — PAX TYPE
// ============================================================

describe('Mapper — mapPaxType', () => {
  it('maps ADT to adult', () => expect(mapPaxType('ADT')).toBe('adult'));
  it('maps CHD to child', () => expect(mapPaxType('CHD')).toBe('child'));
  it('maps CNN to child', () => expect(mapPaxType('CNN')).toBe('child'));
  it('maps INF to infant', () => expect(mapPaxType('INF')).toBe('infant'));
  it('maps INFT to infant', () => expect(mapPaxType('INFT')).toBe('infant'));
  it('defaults unknown to adult', () => expect(mapPaxType('XYZ')).toBe('adult'));
});

describe('Mapper — reverseMapPaxType', () => {
  it('maps adult to ADT', () => expect(reverseMapPaxType('adult')).toBe('ADT'));
  it('maps child to CHD', () => expect(reverseMapPaxType('child')).toBe('CHD'));
  it('maps infant to INF', () => expect(reverseMapPaxType('infant')).toBe('INF'));
  it('defaults unknown to ADT', () => expect(reverseMapPaxType('senior')).toBe('ADT'));
});

// ============================================================
// MAPPER — CABIN CLASS
// ============================================================

describe('Mapper — mapCabinClass', () => {
  it('maps Y to economy', () => expect(mapCabinClass('Y')).toBe('economy'));
  it('maps C to business', () => expect(mapCabinClass('C')).toBe('business'));
  it('maps J to business', () => expect(mapCabinClass('J')).toBe('business'));
  it('maps F to first', () => expect(mapCabinClass('F')).toBe('first'));
  it('defaults unknown to economy', () => expect(mapCabinClass('X')).toBe('economy'));
});

// ============================================================
// MAPPER — toMoney
// ============================================================

describe('Mapper — toMoney', () => {
  it('converts number to money', () => {
    const m = toMoney(610.5, 'USD');
    expect(m.amount).toBe('610.5');
    expect(m.currency).toBe('USD');
  });

  it('handles undefined as zero', () => {
    const m = toMoney(undefined, 'EUR');
    expect(m.amount).toBe('0');
    expect(m.currency).toBe('EUR');
  });

  it('preserves decimal precision', () => {
    const m = toMoney(123.456, 'GBP');
    expect(m.amount).toBe('123.456');
  });
});

// ============================================================
// MAPPER — SEARCH REQUEST
// ============================================================

describe('Mapper — mapSearchRequest', () => {
  const config = validateNavitaireConfig(makeNavitaireConfig());

  it('builds one-way search request', () => {
    const req = mapSearchRequest(makeSearchInput(), config);
    expect(req.criteria).toHaveLength(1);
    expect(req.criteria[0]?.originStationCode).toBe('JFK');
    expect(req.criteria[0]?.destinationStationCode).toBe('LHR');
    expect(req.criteria[0]?.beginDate).toBe('2026-06-15');
    expect(req.passengers.types).toHaveLength(1);
    expect(req.passengers.types[0]?.type).toBe('ADT');
    expect(req.passengers.types[0]?.count).toBe(1);
  });

  it('builds round-trip search request', () => {
    const req = mapSearchRequest(makeSearchInput({ returnDate: '2026-06-25' }), config);
    expect(req.criteria).toHaveLength(2);
    expect(req.criteria[1]?.originStationCode).toBe('LHR');
    expect(req.criteria[1]?.destinationStationCode).toBe('JFK');
    expect(req.criteria[1]?.beginDate).toBe('2026-06-25');
  });

  it('includes children and infants', () => {
    const req = mapSearchRequest(
      makeSearchInput({ passengers: { adults: 2, children: 1, infants: 1 } }),
      config,
    );
    expect(req.passengers.types).toHaveLength(3);
    expect(req.passengers.types[1]?.type).toBe('CHD');
    expect(req.passengers.types[1]?.count).toBe(1);
    expect(req.passengers.types[2]?.type).toBe('INF');
    expect(req.passengers.types[2]?.count).toBe(1);
  });

  it('uses input currency over config default', () => {
    const req = mapSearchRequest(makeSearchInput({ currency: 'GBP' }), config);
    expect(req.currencyCode).toBe('GBP');
  });

  it('falls back to config default currency', () => {
    const req = mapSearchRequest(makeSearchInput(), config);
    expect(req.currencyCode).toBe('USD');
  });

  it('sets direct filter when directOnly is true', () => {
    const req = mapSearchRequest(makeSearchInput({ directOnly: true }), config);
    expect(req.criteria[0]?.filters?.connectionType).toBe('Direct');
  });

  it('sets carrier filter for preferred airlines', () => {
    const req = mapSearchRequest(makeSearchInput({ preferredAirlines: ['BA'] }), config);
    expect(req.criteria[0]?.filters?.carrierCode).toBe('BA');
  });
});

// ============================================================
// MAPPER — SEARCH RESPONSE
// ============================================================

describe('Mapper — mapSearchResponse', () => {
  it('maps availability to flight offers', () => {
    const offers = mapSearchResponse(makeAvailabilityResponse(), 'USD');
    expect(offers).toHaveLength(1);
    expect(offers[0]?.supplier).toBe('navitaire');
    expect(offers[0]?.validatingCarrier).toBe('BA');
  });

  it('maps segments correctly', () => {
    const offers = mapSearchResponse(makeAvailabilityResponse(), 'USD');
    const segments = offers[0]?.segments[0];
    expect(segments).toHaveLength(1);
    expect(segments?.[0]?.origin).toBe('JFK');
    expect(segments?.[0]?.destination).toBe('LHR');
    expect(segments?.[0]?.flightNumber).toBe('178');
    expect(segments?.[0]?.marketingCarrier).toBe('BA');
    expect(segments?.[0]?.equipment).toBe('777');
  });

  it('calculates fare breakdown', () => {
    const offers = mapSearchResponse(makeAvailabilityResponse(), 'USD');
    expect(offers[0]?.fares).toHaveLength(1);
    expect(offers[0]?.fares[0]?.passengerType).toBe('adult');
    expect(offers[0]?.fares[0]?.baseFare.amount).toBe('500');
    expect(offers[0]?.fares[0]?.taxes.amount).toBe('110.5');
  });

  it('calculates total price from fares and charges', () => {
    const offers = mapSearchResponse(makeAvailabilityResponse(), 'USD');
    expect(offers[0]?.totalPrice.amount).toBe('610.5');
    expect(offers[0]?.totalPrice.currency).toBe('USD');
  });

  it('sets offer ID with journey and fare keys', () => {
    const offers = mapSearchResponse(makeAvailabilityResponse(), 'USD');
    expect(offers[0]?.offerId).toBe('navitaire-JK001-FA001');
  });

  it('maps cabin class from class of service', () => {
    const offers = mapSearchResponse(makeAvailabilityResponse(), 'USD');
    expect(offers[0]?.cabinClass).toBe('economy');
  });

  it('returns empty array for empty response', () => {
    const offers = mapSearchResponse({ trips: [] }, 'USD');
    expect(offers).toEqual([]);
  });

  it('returns empty array for undefined trips', () => {
    const offers = mapSearchResponse({}, 'USD');
    expect(offers).toEqual([]);
  });

  it('maps journeys from dates array', () => {
    const response: AvailabilityResponse = {
      trips: [
        {
          originStationCode: 'JFK',
          destinationStationCode: 'LHR',
          dates: [
            {
              date: '2026-06-15',
              journeys: makeAvailabilityResponse().trips![0]!.journeysAvailable,
            },
          ],
        },
      ],
    };
    const offers = mapSearchResponse(response, 'USD');
    expect(offers).toHaveLength(1);
  });

  it('handles refundable classType', () => {
    const response = makeAvailabilityResponse();
    response.trips![0]!.journeysAvailable![0]!.fares![0]!.classType = 'R';
    const offers = mapSearchResponse(response, 'USD');
    expect(offers[0]?.refundable).toBe(true);
  });

  it('handles non-refundable classType', () => {
    const response = makeAvailabilityResponse();
    response.trips![0]!.journeysAvailable![0]!.fares![0]!.classType = 'NR';
    const offers = mapSearchResponse(response, 'USD');
    expect(offers[0]?.refundable).toBe(false);
  });
});

// ============================================================
// MAPPER — TRIP SELL REQUEST
// ============================================================

describe('Mapper — mapTripSellRequest', () => {
  it('builds sell request with journey and fare keys', () => {
    const req = mapTripSellRequest('JK001', 'FA001', 'USD');
    expect(req.journeyKey).toBe('JK001');
    expect(req.fareAvailabilityKey).toBe('FA001');
    expect(req.currencyCode).toBe('USD');
  });
});

// ============================================================
// MAPPER — PASSENGERS REQUEST
// ============================================================

describe('Mapper — mapPassengersRequest', () => {
  it('maps passengers with correct keys', () => {
    const input = makeBookingInput();
    const req = mapPassengersRequest(input.passengers, ['P0']);
    expect(req.P0).toBeDefined();
    expect(req.P0?.name.first).toBe('John');
    expect(req.P0?.name.last).toBe('Smith');
    expect(req.P0?.name.title).toBe('MR');
    expect(req.P0?.passengerTypeCode).toBe('ADT');
  });

  it('maps gender correctly', () => {
    const input = makeBookingInput();
    const req = mapPassengersRequest(input.passengers, ['P0']);
    expect(req.P0?.info?.gender).toBe('Male');
  });

  it('maps date of birth', () => {
    const input = makeBookingInput();
    const req = mapPassengersRequest(input.passengers, ['P0']);
    expect(req.P0?.info?.dateOfBirth).toBe('1990-05-15');
  });

  it('generates fallback keys when none provided', () => {
    const input = makeBookingInput();
    const req = mapPassengersRequest(input.passengers, []);
    expect(req.P0).toBeDefined();
  });

  it('maps child passenger type', () => {
    const input = makeBookingInput({
      passengers: [{ ...makeBookingInput().passengers[0]!, type: 'child' }],
    });
    const req = mapPassengersRequest(input.passengers, ['P0']);
    expect(req.P0?.passengerTypeCode).toBe('CHD');
  });
});

// ============================================================
// MAPPER — PRIMARY CONTACT
// ============================================================

describe('Mapper — mapPrimaryContactRequest', () => {
  it('maps contact from booking input', () => {
    const req = mapPrimaryContactRequest(makeBookingInput());
    expect(req.emailAddress).toBe('john@example.com');
    expect(req.phoneNumbers?.[0]?.number).toBe('+1-555-123-4567');
    expect(req.name.first).toBe('John');
    expect(req.name.last).toBe('Smith');
  });
});

// ============================================================
// MAPPER — PAYMENT REQUEST
// ============================================================

describe('Mapper — mapPaymentRequest', () => {
  it('creates payment request with amount and currency', () => {
    const req = mapPaymentRequest(610.5, 'USD');
    expect(req.amount).toBe(610.5);
    expect(req.currencyCode).toBe('USD');
    expect(req.paymentMethodCode).toBe('AG');
  });

  it('accepts custom payment method code', () => {
    const req = mapPaymentRequest(100, 'EUR', 'VI');
    expect(req.paymentMethodCode).toBe('VI');
  });
});

// ============================================================
// MAPPER — PRICE RESPONSE
// ============================================================

describe('Mapper — mapPriceResponse', () => {
  it('maps priced booking state', () => {
    const response: BookingPriceResponse = {
      data: makeBookingData(),
    };
    const result = mapPriceResponse(response, 'navitaire-JK001-FA001', 'USD');
    expect(result.available).toBe(true);
    expect(result.totalPrice.amount).toBe('610.5');
    expect(result.supplier).toBe('navitaire');
  });

  it('returns unavailable for empty response', () => {
    const result = mapPriceResponse({}, 'offer-1', 'USD');
    expect(result.available).toBe(false);
    expect(result.totalPrice.amount).toBe('0');
  });

  it('extracts fare breakdown from passenger totals', () => {
    const response: BookingPriceResponse = {
      data: makeBookingData(),
    };
    const result = mapPriceResponse(response, 'offer-1', 'USD');
    expect(result.fares).toHaveLength(1);
    expect(result.fares[0]?.passengerType).toBe('adult');
    expect(result.fares[0]?.taxes.amount).toBe('110.5');
  });
});

// ============================================================
// MAPPER — BOOKING RESPONSE
// ============================================================

describe('Mapper — mapCreateBookingResponse', () => {
  it('maps successful commit with record locator', () => {
    const commitData: BookingCommitData = {
      recordLocator: 'ABC123',
      booking: makeBookingData(),
    };
    const result = mapCreateBookingResponse(
      commitData,
      makeBookingData(),
      makeBookingInput().passengers,
      'USD',
    );
    expect(result.bookingId).toBe('ABC123');
    expect(result.pnr).toBe('ABC123');
    expect(result.status).toBe('held');
    expect(result.supplier).toBe('navitaire');
  });

  it('falls back to booking data record locator', () => {
    const result = mapCreateBookingResponse(
      undefined,
      makeBookingData(),
      makeBookingInput().passengers,
      'USD',
    );
    expect(result.bookingId).toBe('ABC123');
  });

  it('uses locators array as fallback', () => {
    const data = makeBookingData({ recordLocator: undefined });
    const result = mapCreateBookingResponse(undefined, data, [], 'USD');
    expect(result.bookingId).toBe('ABC123');
  });

  it('returns failed status when no PNR', () => {
    const result = mapCreateBookingResponse(undefined, undefined, [], 'USD');
    expect(result.status).toBe('failed');
    expect(result.bookingId).toBe('');
  });

  it('maps segments from booking data', () => {
    const result = mapCreateBookingResponse(
      { recordLocator: 'ABC123' },
      makeBookingData(),
      [],
      'USD',
    );
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]?.[0]?.origin).toBe('JFK');
  });
});

// ============================================================
// MAPPER — GET BOOKING RESPONSE
// ============================================================

describe('Mapper — mapGetBookingResponse', () => {
  it('maps retrieved booking', () => {
    const result = mapGetBookingResponse(makeBookingData(), 'ABC123', 'USD');
    expect(result.bookingId).toBe('ABC123');
    expect(result.status).toBe('held');
    expect(result.pnr).toBe('ABC123');
    expect(result.totalPrice.amount).toBe('610.5');
  });

  it('extracts passengers from booking data', () => {
    const result = mapGetBookingResponse(makeBookingData(), 'ABC123', 'USD');
    expect(result.passengers).toHaveLength(1);
    expect(result.passengers[0]?.firstName).toBe('John');
    expect(result.passengers[0]?.lastName).toBe('Smith');
    expect(result.passengers[0]?.type).toBe('adult');
  });

  it('detects ticketed status from ticket numbers', () => {
    const data = makeBookingData();
    data.journeys![0]!.segments[0]!.passengerSegment = {
      P0: {
        tickets: [{ ticketNumber: '0741234567890' }],
      },
    };
    const result = mapGetBookingResponse(data, 'ABC123', 'USD');
    expect(result.status).toBe('ticketed');
    expect(result.ticketNumbers).toEqual(['0741234567890']);
  });

  it('detects cancelled status', () => {
    const data = makeBookingData({ info: { status: 4, currencyCode: 'USD' } });
    const result = mapGetBookingResponse(data, 'ABC123', 'USD');
    expect(result.status).toBe('cancelled');
  });

  it('returns failed for undefined data', () => {
    const result = mapGetBookingResponse(undefined, 'ABC123', 'USD');
    expect(result.status).toBe('failed');
    expect(result.segments).toEqual([]);
    expect(result.passengers).toEqual([]);
  });
});

// ============================================================
// MAPPER — CANCEL RESPONSE
// ============================================================

describe('Mapper — mapCancelResponse', () => {
  it('maps successful cancellation', () => {
    const result = mapCancelResponse(true, 'ABC123');
    expect(result.success).toBe(true);
    expect(result.message).toBe('Booking ABC123 cancelled');
  });

  it('maps failed cancellation with error', () => {
    const result = mapCancelResponse(false, 'ABC123', 'Journey not found');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Journey not found');
  });

  it('uses default error message when none provided', () => {
    const result = mapCancelResponse(false, 'ABC123');
    expect(result.message).toBe('Cancellation failed');
  });
});

// ============================================================
// MAPPER — TICKETING RESPONSE
// ============================================================

describe('Mapper — mapTicketingResponse', () => {
  it('maps ticketed response with ticket numbers', () => {
    const result = mapTicketingResponse(makeBookingData(), 'ABC123', ['0741234567890'], 'USD');
    expect(result.status).toBe('ticketed');
    expect(result.ticketNumbers).toEqual(['0741234567890']);
  });

  it('maps confirmed when no tickets issued', () => {
    const result = mapTicketingResponse(makeBookingData(), 'ABC123', [], 'USD');
    expect(result.status).toBe('confirmed');
    expect(result.ticketNumbers).toBeUndefined();
  });
});

// ============================================================
// MAPPER — ERROR CODES
// ============================================================

describe('Mapper — mapNavitaireErrorCode', () => {
  it('maps credential failure', () => {
    expect(mapNavitaireErrorCode('nsk-server:Credentials:Failed')).toBe('AUTH_ERROR');
  });

  it('maps rate limit', () => {
    expect(mapNavitaireErrorCode('nsk-server:Credentials:RateLimited')).toBe('RATE_LIMIT_ERROR');
  });

  it('maps config error', () => {
    expect(mapNavitaireErrorCode('nsk-server:UseOldResetPasswordFlow')).toBe('CONFIG_ERROR');
  });

  it('maps unknown error code to SUPPLIER_ERROR', () => {
    expect(mapNavitaireErrorCode('nsk-server:SomeOther')).toBe('SUPPLIER_ERROR');
  });

  it('maps undefined to UNKNOWN_ERROR', () => {
    expect(mapNavitaireErrorCode(undefined)).toBe('UNKNOWN_ERROR');
  });
});

// ============================================================
// ADAPTER INTEGRATION TESTS
// ============================================================

describe('NavitaireAdapter', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockAuthThenApi(apiResponse: unknown, apiStatus = 200) {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'test-jwt', idleTimeoutInMinutes: 20 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(apiResponse), { status: apiStatus }));
  }

  function mockAuthThenMultipleApis(...responses: Array<{ body: unknown; status?: number }>) {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: 'test-jwt', idleTimeoutInMinutes: 20 }), {
        status: 200,
      }),
    );
    for (const r of responses) {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(r.body), { status: r.status ?? 200 }),
      );
    }
  }

  it('constructs with valid config', () => {
    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    expect(adapter.supplierId).toBe('navitaire');
    expect(adapter.supplierName).toBe('Navitaire (New Skies / dotREZ)');
  });

  it('throws on invalid config', () => {
    expect(() => new NavitaireAdapter({})).toThrow('Invalid Navitaire config');
  });

  // --- searchFlights ---

  it('searchFlights calls availability endpoint', async () => {
    mockAuthThenApi(makeAvailabilityResponse());
    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    const offers = await adapter.searchFlights(makeSearchInput());

    expect(offers).toHaveLength(1);
    expect(offers[0]?.supplier).toBe('navitaire');
    expect(mockFetch.mock.calls[1]?.[0]).toContain('/api/nsk/v4/availability/search');
  });

  it('searchFlights includes Bearer token', async () => {
    mockAuthThenApi(makeAvailabilityResponse());
    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    await adapter.searchFlights(makeSearchInput());

    const headers = mockFetch.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-jwt');
  });

  it('searchFlights retries on 401 with fresh token', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'token-1', idleTimeoutInMinutes: 20 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'token-2', idleTimeoutInMinutes: 20 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeAvailabilityResponse()), { status: 200 }),
      );

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    const offers = await adapter.searchFlights(makeSearchInput());

    expect(offers).toHaveLength(1);
  });

  it('searchFlights throws on 400 validation error', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'test-jwt', idleTimeoutInMinutes: 20 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errors: [{ code: 'nsk-server:Validation', message: 'Invalid origin' }],
          }),
          { status: 400 },
        ),
      );

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    await expect(adapter.searchFlights(makeSearchInput())).rejects.toThrow(ConnectError);
  });

  // --- priceItinerary ---

  it('priceItinerary calls sell then price', async () => {
    mockAuthThenMultipleApis(
      { body: { data: makeBookingData() } }, // sell
      { body: { data: makeBookingData() } }, // price
    );

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    const result = await adapter.priceItinerary('navitaire-JK001-FA001', { adults: 1 });

    expect(result.available).toBe(true);
    expect(result.supplier).toBe('navitaire');
    expect(mockFetch.mock.calls[1]?.[0]).toContain('/api/nsk/v4/trip/sell');
    expect(mockFetch.mock.calls[2]?.[0]).toContain('/api/nsk/v1/booking/price');
  });

  it('priceItinerary throws on invalid offer ID', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: 'test-jwt', idleTimeoutInMinutes: 20 }), {
        status: 200,
      }),
    );

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    await expect(adapter.priceItinerary('invalid-offer', { adults: 1 })).rejects.toThrow(
      'Invalid Navitaire offer ID',
    );
  });

  // --- createBooking ---

  it('createBooking executes 5-step stateful flow', async () => {
    mockAuthThenMultipleApis(
      { body: { data: { passengers: { P0: {} } } } }, // sell
      { body: {} }, // passengers
      { body: {} }, // contact
      { body: makeBookingData() }, // get state
      { body: {} }, // payment
      { body: { data: { recordLocator: 'XYZ789', booking: makeBookingData() } } }, // commit
    );

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    const result = await adapter.createBooking(makeBookingInput());

    expect(result.bookingId).toBe('XYZ789');
    expect(result.status).toBe('held');

    // Verify endpoint order
    const urls = mockFetch.mock.calls.map((c: [string]) => c[0]) as string[];
    expect(urls[1]).toContain('/api/nsk/v4/trip/sell');
    expect(urls[2]).toContain('/api/nsk/v1/trip/passengers');
    expect(urls[3]).toContain('/api/nsk/v1/booking/contacts/primary');
    expect(urls[4]).toContain('/api/nsk/v1/booking');
    expect(urls[5]).toContain('/api/nsk/v5/booking/payments');
    expect(urls[6]).toContain('/api/nsk/v3/booking');
  });

  it('createBooking retrieves PNR when not in commit response', async () => {
    mockAuthThenMultipleApis(
      { body: { data: { passengers: { P0: {} } } } }, // sell
      { body: {} }, // passengers
      { body: {} }, // contact
      { body: makeBookingData() }, // get state
      { body: {} }, // payment
      { body: { data: {} } }, // commit (no PNR)
      { body: makeBookingData() }, // retrieve
    );

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    const result = await adapter.createBooking(makeBookingInput());

    expect(result.bookingId).toBe('ABC123');
  });

  // --- getBookingStatus ---

  it('getBookingStatus retrieves by record locator', async () => {
    mockAuthThenApi({ data: makeBookingData() });

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    const result = await adapter.getBookingStatus('ABC123');

    expect(result.bookingId).toBe('ABC123');
    expect(result.status).toBe('held');
    expect(mockFetch.mock.calls[1]?.[0]).toContain(
      '/api/nsk/v1/booking/retrieve/byRecordLocator/ABC123',
    );
  });

  // --- requestTicketing ---

  it('requestTicketing validates then issues tickets', async () => {
    mockAuthThenMultipleApis(
      { body: { data: makeBookingData() } }, // retrieve
      { body: { valid: true } }, // validate
      { body: { data: { tickets: [{ ticketNumber: '0741234567890' }] } } }, // issue
    );

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    const result = await adapter.requestTicketing('ABC123');

    expect(result.status).toBe('ticketed');
    expect(result.ticketNumbers).toEqual(['0741234567890']);
  });

  it('requestTicketing throws when validation fails', async () => {
    mockAuthThenMultipleApis(
      { body: { data: makeBookingData() } },
      { body: { valid: false, validationMessages: [{ message: 'Payment required' }] } },
    );

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    await expect(adapter.requestTicketing('ABC123')).rejects.toThrow('Ticketing validation failed');
  });

  // --- cancelBooking ---

  it('cancelBooking retrieves, deletes journeys, and commits', async () => {
    mockAuthThenMultipleApis(
      { body: { data: makeBookingData() } }, // retrieve
      { body: {} }, // delete journey
      { body: { data: {} } }, // commit
    );

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    const result = await adapter.cancelBooking('ABC123');

    expect(result.success).toBe(true);
    expect(result.message).toBe('Booking ABC123 cancelled');
  });

  it('cancelBooking fails when no journeys found', async () => {
    const emptyBooking = makeBookingData({ journeys: [] });
    mockAuthThenApi({ data: emptyBooking });

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    const result = await adapter.cancelBooking('ABC123');

    expect(result.success).toBe(false);
    expect(result.message).toContain('No journeys found');
  });

  // --- healthCheck ---

  it('healthCheck returns healthy on success', async () => {
    mockAuthThenApi({ status: 'Healthy' });

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    const result = await adapter.healthCheck();

    expect(result.healthy).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('healthCheck returns unhealthy on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    const result = await adapter.healthCheck();

    expect(result.healthy).toBe(false);
  });

  // --- error handling ---

  it('handles 500 errors as retryable', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'test-jwt', idleTimeoutInMinutes: 20 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeAvailabilityResponse()), { status: 200 }),
      );

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    const offers = await adapter.searchFlights(makeSearchInput());
    expect(offers).toHaveLength(1);
  });

  it('handles 429 rate limit as retryable', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'test-jwt', idleTimeoutInMinutes: 20 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response('Rate Limited', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeAvailabilityResponse()), { status: 200 }),
      );

    const adapter = new NavitaireAdapter(makeNavitaireConfig());
    const offers = await adapter.searchFlights(makeSearchInput());
    expect(offers).toHaveLength(1);
  });

  // --- supplier registry ---

  it('is registered in supplier registry', async () => {
    const { listSuppliers, createAdapter } = await import('../../../suppliers/index.js');
    expect(listSuppliers()).toContain('navitaire');

    const adapter = createAdapter('navitaire', makeNavitaireConfig());
    expect(adapter.supplierId).toBe('navitaire');
  });
});
