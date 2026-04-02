/**
 * Navitaire ↔ ConnectAdapter type mappers.
 *
 * Request mappers: ConnectAdapter standard types → Navitaire API format
 * Response mappers: Navitaire API format → ConnectAdapter standard types
 *
 * All money uses decimal.js — never raw floating point assignment.
 */

import Decimal from 'decimal.js';
import type {
  BookingResult,
  BookingStatus,
  BookingStatusResult,
  CabinClass,
  CreateBookingInput,
  FareBreakdown,
  FlightOffer,
  FlightSegment,
  MoneyAmount,
  PassengerDetail,
  PricedItinerary,
  SearchFlightsInput,
} from '../../types.js';
import type { NavitaireConfig } from './config.js';
import type {
  AddPassengersRequest,
  AddPaymentRequest,
  AvailabilityFare,
  AvailabilityJourney,
  AvailabilityRequestv3,
  AvailabilityResponse,
  BookingCommitData,
  BookingData,
  BookingPriceResponse,
  BookingSegment,
  PrimaryContactRequest,
  TripSellRequestv2,
} from './types.js';

// ============================================================
// TYPE MAPS
// ============================================================

const PAX_TYPE_MAP: Record<string, 'adult' | 'child' | 'infant'> = {
  ADT: 'adult',
  CHD: 'child',
  CNN: 'child',
  INF: 'infant',
  INFT: 'infant',
};

const REVERSE_PAX_TYPE_MAP: Record<string, string> = {
  adult: 'ADT',
  child: 'CHD',
  infant: 'INF',
};

const CABIN_MAP: Record<CabinClass, string[]> = {
  economy: ['Y', 'M', 'B', 'H', 'K', 'L', 'Q', 'T', 'V', 'W', 'G', 'S', 'N', 'O', 'E'],
  premium_economy: ['W', 'P'],
  business: ['C', 'D', 'J', 'I', 'Z'],
  first: ['F', 'A', 'R'],
};

const REVERSE_CABIN_MAP: Record<string, CabinClass> = {};
for (const [cabin, codes] of Object.entries(CABIN_MAP)) {
  for (const code of codes) {
    if (!REVERSE_CABIN_MAP[code]) {
      REVERSE_CABIN_MAP[code] = cabin as CabinClass;
    }
  }
}

const NAVITAIRE_GENDER_MAP: Record<string, 'Male' | 'Female'> = {
  M: 'Male',
  F: 'Female',
};

const REVERSE_GENDER_MAP: Record<string, 'M' | 'F'> = {
  Male: 'M',
  Female: 'F',
};

// ============================================================
// HELPERS
// ============================================================

export function mapPaxType(code: string): 'adult' | 'child' | 'infant' {
  return PAX_TYPE_MAP[code] ?? 'adult';
}

export function reverseMapPaxType(type: string): string {
  return REVERSE_PAX_TYPE_MAP[type] ?? 'ADT';
}

export function mapCabinClass(code: string): CabinClass {
  return REVERSE_CABIN_MAP[code] ?? 'economy';
}

export function toMoney(amount: number | undefined, currency: string): MoneyAmount {
  return {
    amount: new Decimal(amount ?? 0).toString(),
    currency,
  };
}

function minutesToIsoDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `PT${hours}H${mins}M`;
}

function calculateDurationMinutes(departure: string, arrival: string): number {
  const dep = new Date(departure).getTime();
  const arr = new Date(arrival).getTime();
  return Math.round((arr - dep) / 60_000);
}


// ============================================================
// SEARCH REQUEST MAPPER
// ============================================================

export function mapSearchRequest(
  input: SearchFlightsInput,
  config: NavitaireConfig,
): AvailabilityRequestv3 {
  const criteria = [
    {
      originStationCode: input.origin,
      destinationStationCode: input.destination,
      beginDate: input.departureDate,
      filters: buildFilters(input),
    },
  ];

  if (input.returnDate) {
    criteria.push({
      originStationCode: input.destination,
      destinationStationCode: input.origin,
      beginDate: input.returnDate,
      filters: buildFilters(input),
    });
  }

  const types = [
    { type: 'ADT', count: input.passengers.adults },
  ];
  if (input.passengers.children) {
    types.push({ type: 'CHD', count: input.passengers.children });
  }
  if (input.passengers.infants) {
    types.push({ type: 'INF', count: input.passengers.infants });
  }

  return {
    criteria,
    passengers: { types },
    currencyCode: input.currency ?? config.defaultCurrencyCode,
  };
}

function buildFilters(input: SearchFlightsInput): { connectionType?: 'None' | 'Direct'; carrierCode?: string } | undefined {
  const filters: {
    connectionType?: 'None' | 'Direct';
    carrierCode?: string;
  } = {};

  if (input.directOnly) {
    filters.connectionType = 'Direct';
  }

  if (input.preferredAirlines?.length) {
    filters.carrierCode = input.preferredAirlines[0];
  }

  return Object.keys(filters).length > 0 ? filters : undefined;
}

// ============================================================
// SEARCH RESPONSE MAPPER
// ============================================================

export function mapSearchResponse(
  response: AvailabilityResponse,
  currency: string,
): FlightOffer[] {
  const offers: FlightOffer[] = [];

  for (const trip of response.trips ?? []) {
    const journeys = trip.journeysAvailable ?? [];

    // Also collect journeys from dates array
    for (const dateEntry of trip.dates ?? []) {
      journeys.push(...(dateEntry.journeys ?? []));
    }

    for (const journey of journeys) {
      for (const fare of journey.fares ?? []) {
        const segments = mapJourneySegments(journey);
        const fares = mapAvailabilityFares(fare, currency);
        const totalPrice = calculateFareTotal(fare, currency);

        offers.push({
          offerId: `navitaire-${journey.journeyKey}-${fare.fareAvailabilityKey}`,
          supplier: 'navitaire',
          validatingCarrier: journey.segments[0]?.identifier.carrierCode ?? '',
          segments: [segments],
          fares,
          totalPrice,
          fareType: 'published',
          cabinClass: mapCabinClass(fare.classOfService),
          refundable: fare.classType !== 'NR',
          changeable: fare.classType !== 'NR',
          baggageAllowance: undefined,
          expiresAt: undefined,
          raw: { journeyKey: journey.journeyKey, fareAvailabilityKey: fare.fareAvailabilityKey },
        });
      }
    }
  }

  return offers;
}

function mapJourneySegments(journey: AvailabilityJourney): FlightSegment[] {
  return journey.segments.map((seg) => {
    const durationMinutes = calculateDurationMinutes(
      seg.designator.departure,
      seg.designator.arrival,
    );
    const firstLeg = seg.legs?.[0];

    return {
      origin: seg.designator.origin,
      destination: seg.designator.destination,
      marketingCarrier: seg.identifier.carrierCode,
      operatingCarrier: seg.externalIdentifier?.carrierCode ?? firstLeg?.operatingCarrier ?? seg.identifier.carrierCode,
      flightNumber: seg.identifier.identifier,
      departure: seg.designator.departure,
      arrival: seg.designator.arrival,
      duration: minutesToIsoDuration(durationMinutes),
      cabinClass: seg.cabinOfService ?? 'Y',
      bookingClass: seg.cabinOfService ?? 'Y',
      equipment: firstLeg?.equipmentType,
      stops: (seg.legs?.length ?? 1) - 1,
    };
  });
}

function mapAvailabilityFares(
  fare: AvailabilityFare,
  currency: string,
): FareBreakdown[] {
  const fareMap = new Map<string, { total: Decimal; base: Decimal; tax: Decimal; count: number }>();

  for (const pf of fare.passengerFares) {
    const paxType = mapPaxType(pf.passengerType);
    const existing = fareMap.get(paxType);

    const base = new Decimal(pf.fareAmount ?? 0);
    const taxAmount = (pf.serviceCharges ?? [])
      .filter((c) => c.type === 'Tax' || c.type === 'TaxCharge')
      .reduce((sum, c) => sum.plus(new Decimal(c.amount ?? 0)), new Decimal(0));
    const total = base.plus(taxAmount);

    if (existing) {
      existing.total = existing.total.plus(total);
      existing.base = existing.base.plus(base);
      existing.tax = existing.tax.plus(taxAmount);
      existing.count += 1;
    } else {
      fareMap.set(paxType, { total, base, tax: taxAmount, count: 1 });
    }
  }

  const fares: FareBreakdown[] = [];
  for (const [paxType, data] of fareMap) {
    fares.push({
      passengerType: paxType as 'adult' | 'child' | 'infant',
      baseFare: { amount: data.base.toString(), currency },
      taxes: { amount: data.tax.toString(), currency },
      total: { amount: data.total.toString(), currency },
      count: data.count,
    });
  }

  return fares;
}

function calculateFareTotal(fare: AvailabilityFare, currency: string): MoneyAmount {
  let total = new Decimal(0);
  for (const pf of fare.passengerFares) {
    total = total.plus(new Decimal(pf.fareAmount ?? 0));
    for (const sc of pf.serviceCharges ?? []) {
      total = total.plus(new Decimal(sc.amount ?? 0));
    }
  }
  return { amount: total.toString(), currency };
}

// ============================================================
// TRIP SELL REQUEST MAPPER
// ============================================================

export function mapTripSellRequest(
  journeyKey: string,
  fareAvailabilityKey: string,
  currency: string,
): TripSellRequestv2 {
  return {
    journeyKey,
    fareAvailabilityKey,
    currencyCode: currency,
  };
}

// ============================================================
// PASSENGERS REQUEST MAPPER
// ============================================================

export function mapPassengersRequest(
  passengers: PassengerDetail[],
  passengerKeys: string[],
): AddPassengersRequest {
  const request: AddPassengersRequest = {};

  passengers.forEach((pax, index) => {
    const key = passengerKeys[index] ?? `P${index}`;
    request[key] = {
      name: {
        first: pax.firstName,
        last: pax.lastName,
        middle: pax.middleName,
        title: pax.title,
      },
      passengerTypeCode: reverseMapPaxType(pax.type),
      info: {
        dateOfBirth: pax.dateOfBirth,
        gender: NAVITAIRE_GENDER_MAP[pax.gender] ?? 'Male',
        nationality: pax.nationality,
      },
    };
  });

  return request;
}

// ============================================================
// PRIMARY CONTACT REQUEST MAPPER
// ============================================================

export function mapPrimaryContactRequest(
  input: CreateBookingInput,
): PrimaryContactRequest {
  const firstPax = input.passengers[0];
  return {
    name: {
      first: firstPax?.firstName ?? '',
      last: firstPax?.lastName ?? '',
      title: firstPax?.title,
    },
    emailAddress: input.contact.email,
    phoneNumbers: [
      { type: 'Home', number: input.contact.phone },
    ],
  };
}

// ============================================================
// PAYMENT REQUEST MAPPER
// ============================================================

export function mapPaymentRequest(
  amount: number,
  currencyCode: string,
  paymentMethodCode: string = 'AG',
): AddPaymentRequest {
  return {
    paymentMethodCode,
    amount,
    currencyCode,
  };
}

// ============================================================
// PRICE RESPONSE MAPPER
// ============================================================

export function mapPriceResponse(
  response: BookingPriceResponse,
  originalOfferId: string,
  currency: string,
): PricedItinerary {
  const booking = response.data;
  if (!booking) {
    return {
      offerId: originalOfferId,
      supplier: 'navitaire',
      totalPrice: { amount: '0', currency },
      fares: [],
      fareRules: { refundable: false, changeable: false },
      priceChanged: false,
      available: false,
    };
  }

  const totalPrice = extractBookingTotal(booking, currency);
  const fares = extractBookingFares(booking, currency);

  return {
    offerId: originalOfferId,
    supplier: 'navitaire',
    totalPrice,
    fares,
    fareRules: {
      refundable: true,
      changeable: true,
    },
    priceChanged: false,
    available: true,
    raw: booking,
  };
}

// ============================================================
// BOOKING RESPONSE MAPPERS
// ============================================================

export function mapCreateBookingResponse(
  commitData: BookingCommitData | undefined,
  bookingData: BookingData | undefined,
  passengers: PassengerDetail[],
  currency: string,
): BookingResult {
  const recordLocator = commitData?.recordLocator
    ?? bookingData?.recordLocator
    ?? bookingData?.locators?.recordLocators?.[0]?.recordCode
    ?? '';

  const segments = extractBookingSegments(bookingData);
  const totalPrice = extractBookingTotal(bookingData, currency);

  return {
    bookingId: recordLocator,
    supplier: 'navitaire',
    status: recordLocator ? 'held' : 'failed',
    pnr: recordLocator || undefined,
    segments,
    passengers,
    totalPrice,
    raw: commitData,
  };
}

export function mapGetBookingResponse(
  data: BookingData | undefined,
  bookingId: string,
  currency: string,
): BookingStatusResult {
  if (!data) {
    return {
      bookingId,
      supplier: 'navitaire',
      status: 'failed',
      segments: [],
      passengers: [],
      totalPrice: { amount: '0', currency },
    };
  }

  const recordLocator = data.recordLocator
    ?? data.locators?.recordLocators?.[0]?.recordCode
    ?? bookingId;

  const status = deriveBookingStatus(data);
  const segments = extractBookingSegments(data);
  const passengers = extractBookingPassengers(data);
  const ticketNumbers = extractTicketNumbers(data);
  const totalPrice = extractBookingTotal(data, currency);

  return {
    bookingId,
    supplier: 'navitaire',
    status,
    pnr: recordLocator,
    ticketNumbers: ticketNumbers.length ? ticketNumbers : undefined,
    segments,
    passengers,
    totalPrice,
    raw: data,
  };
}

export function mapCancelResponse(
  success: boolean,
  bookingId: string,
  errorMessage?: string,
): { success: boolean; message: string } {
  if (!success) {
    return { success: false, message: errorMessage ?? 'Cancellation failed' };
  }
  return { success: true, message: `Booking ${bookingId} cancelled` };
}

export function mapTicketingResponse(
  data: BookingData | undefined,
  bookingId: string,
  ticketNumbers: string[],
  currency: string,
): BookingStatusResult {
  const segments = extractBookingSegments(data);
  const passengers = extractBookingPassengers(data);
  const totalPrice = extractBookingTotal(data, currency);

  return {
    bookingId,
    supplier: 'navitaire',
    status: ticketNumbers.length > 0 ? 'ticketed' : 'confirmed',
    pnr: data?.recordLocator ?? bookingId,
    ticketNumbers: ticketNumbers.length ? ticketNumbers : undefined,
    segments,
    passengers,
    totalPrice,
    raw: data,
  };
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

function deriveBookingStatus(data: BookingData): BookingStatus {
  // Check for tickets
  const tickets = extractTicketNumbers(data);
  if (tickets.length > 0) return 'ticketed';

  // Check booking info status
  const status = data.info?.status;
  if (status === 4) return 'cancelled'; // Navitaire status 4 = cancelled
  if (status === 2) return 'confirmed';

  // Check payment status
  const paidStatus = data.info?.paidStatus;
  if (paidStatus === 1) return 'confirmed';

  return 'held';
}

function extractBookingSegments(data: BookingData | undefined): FlightSegment[][] {
  if (!data?.journeys?.length) return [];

  return data.journeys.map((journey) =>
    journey.segments.map((seg) => mapBookingSegmentToFlight(seg)),
  );
}

function mapBookingSegmentToFlight(seg: BookingSegment): FlightSegment {
  const durationMinutes = calculateDurationMinutes(
    seg.designator.departure,
    seg.designator.arrival,
  );
  const firstLeg = seg.legs?.[0];

  return {
    origin: seg.designator.origin,
    destination: seg.designator.destination,
    marketingCarrier: seg.identifier.carrierCode,
    operatingCarrier: seg.externalIdentifier?.carrierCode ?? firstLeg?.operatingCarrier ?? seg.identifier.carrierCode,
    flightNumber: seg.identifier.identifier,
    departure: seg.designator.departure,
    arrival: seg.designator.arrival,
    duration: minutesToIsoDuration(durationMinutes),
    cabinClass: seg.cabinOfService ?? 'Y',
    bookingClass: seg.fares?.[0]?.classOfService ?? seg.cabinOfService ?? 'Y',
    fareBasisCode: seg.fares?.[0]?.fareBasisCode,
    equipment: firstLeg?.equipmentType,
    stops: (seg.legs?.length ?? 1) - 1,
  };
}

function extractBookingPassengers(data: BookingData | undefined): PassengerDetail[] {
  if (!data?.passengers) return [];

  return Object.values(data.passengers).map((pax) => {
    const doc = pax.travelDocuments?.[0];
    return {
      type: mapPaxType(pax.passengerTypeCode ?? 'ADT'),
      gender: REVERSE_GENDER_MAP[pax.info?.gender ?? ''] ?? 'M',
      firstName: pax.name?.first ?? '',
      middleName: pax.name?.middle,
      lastName: pax.name?.last ?? '',
      dateOfBirth: pax.info?.dateOfBirth ?? '',
      passportNumber: doc?.number,
      passportExpiry: doc?.expirationDate,
      passportCountry: doc?.issuedByCode,
      nationality: doc?.nationality ?? pax.info?.nationality,
    };
  });
}

function extractTicketNumbers(data: BookingData | undefined): string[] {
  const tickets: string[] = [];
  if (!data?.journeys) return tickets;

  for (const journey of data.journeys) {
    for (const segment of journey.segments) {
      if (!segment.passengerSegment) continue;
      for (const paxSeg of Object.values(segment.passengerSegment)) {
        for (const ticket of paxSeg.tickets ?? []) {
          if (ticket.ticketNumber) {
            tickets.push(ticket.ticketNumber);
          }
        }
      }
    }
  }

  return [...new Set(tickets)];
}

function extractBookingTotal(data: BookingData | undefined, currency: string): MoneyAmount {
  if (data?.breakdown?.totalAmount !== undefined) {
    return toMoney(data.breakdown.totalAmount, data.info?.currencyCode ?? currency);
  }

  if (data?.breakdown?.balanceDue !== undefined) {
    return toMoney(data.breakdown.balanceDue, data.info?.currencyCode ?? currency);
  }

  return { amount: '0', currency };
}

function extractBookingFares(data: BookingData | undefined, currency: string): FareBreakdown[] {
  if (!data?.breakdown?.passengerTotals) return [];

  const fares: FareBreakdown[] = [];
  const bookingCurrency = data.info?.currencyCode ?? currency;

  for (const [paxKey, totals] of Object.entries(data.breakdown.passengerTotals)) {
    const pax = data.passengers?.[paxKey];
    const paxType = mapPaxType(pax?.passengerTypeCode ?? 'ADT');
    const totalAmount = totals.services?.total ?? 0;
    const taxAmount = totals.services?.taxes ?? 0;
    const baseAmount = totalAmount - taxAmount;

    fares.push({
      passengerType: paxType,
      baseFare: toMoney(baseAmount, bookingCurrency),
      taxes: toMoney(taxAmount, bookingCurrency),
      total: toMoney(totalAmount, bookingCurrency),
      count: 1,
    });
  }

  return fares;
}

// ============================================================
// ERROR MAPPING
// ============================================================

export type NavitaireErrorCode =
  | 'AUTH_ERROR'
  | 'CONFIG_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'VALIDATION_ERROR'
  | 'SUPPLIER_ERROR'
  | 'UNKNOWN_ERROR';

export function mapNavitaireErrorCode(errorCode: string | undefined): NavitaireErrorCode {
  if (!errorCode) return 'UNKNOWN_ERROR';

  if (errorCode.includes('Credentials:Failed')) return 'AUTH_ERROR';
  if (errorCode.includes('UseOldResetPasswordFlow')) return 'CONFIG_ERROR';
  if (errorCode.includes('Credentials:RateLimited')) return 'RATE_LIMIT_ERROR';

  return 'SUPPLIER_ERROR';
}
