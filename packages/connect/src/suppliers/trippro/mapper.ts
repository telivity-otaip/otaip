/**
 * TripPro ↔ standard interface mapping functions.
 *
 * Critical rules:
 * - Search dates: DD/MM/YYYY
 * - Booking DOB: MM/DD/YYYY
 * - Response dates: ISO 8601
 * - Money: always decimal.js strings, NEVER floats
 * - PaymentType: always HOLD
 */

import Decimal from 'decimal.js';
import type {
  SearchFlightsInput,
  PassengerCount,
  CreateBookingInput,
  FlightOffer,
  FlightSegment,
  FareBreakdown,
  MoneyAmount,
  PricedItinerary,
  BookingResult,
  CabinClass,
} from '../../types.js';
import type {
  TripProSearchRequest,
  TripProItinerary,
  TripProFare,
  TripProRepriceRequest,
  TripProBookRequest,
  TripProBookResponse,
} from './types.js';
import type { TripProConfig } from './config.js';

// ============================================================
// DATE FORMATTERS
// ============================================================

/** Convert ISO date (YYYY-MM-DD) to DD/MM/YYYY for search requests. */
export function formatDateDDMMYYYY(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/** Convert ISO date (YYYY-MM-DD) to MM/DD/YYYY for booking DOB. */
export function formatDateMMDDYYYY(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${month}/${day}/${year}`;
}

// ============================================================
// TYPE MAPPERS
// ============================================================

const PAX_TYPE_MAP: Record<string, 'adult' | 'child' | 'infant'> = {
  ADT: 'adult',
  CHD: 'child',
  INF: 'infant',
};

const REVERSE_PAX_TYPE_MAP: Record<string, string> = {
  adult: 'ADT',
  child: 'CHD',
  infant: 'INF',
};

const FARE_TYPE_MAP: Record<string, FlightOffer['fareType']> = {
  PUB: 'published',
  NET: 'net',
  JCB: 'negotiated',
};

const CABIN_CLASS_MAP: Record<string, CabinClass> = {
  E: 'economy',
  P: 'premium_economy',
  B: 'business',
  F: 'first',
};

const REVERSE_CABIN_MAP: Record<CabinClass, string> = {
  economy: 'E',
  premium_economy: 'P',
  business: 'B',
  first: 'F',
};

export function mapPaxType(tripProType: string): 'adult' | 'child' | 'infant' {
  return PAX_TYPE_MAP[tripProType] ?? 'adult';
}

export function reverseMapPaxType(type: string): string {
  return REVERSE_PAX_TYPE_MAP[type] ?? 'ADT';
}

export function mapFareType(tripProType: string): FlightOffer['fareType'] {
  return FARE_TYPE_MAP[tripProType] ?? 'published';
}

export function mapCabinClass(tripProClass: string): CabinClass {
  return CABIN_CLASS_MAP[tripProClass] ?? 'economy';
}

// ============================================================
// MONEY HELPERS
// ============================================================

export function calculateTotalPrice(fares: TripProFare[]): MoneyAmount {
  const currency = fares[0]?.CurrencyCode ?? 'USD';
  const total = fares.reduce((sum, fare) => sum.plus(new Decimal(fare.FullFare)), new Decimal(0));
  return { amount: total.toString(), currency };
}

// ============================================================
// TRANSACTION ID
// ============================================================

export function generateTransactionId(): string {
  return `otaip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================
// REQUEST MAPPERS
// ============================================================

export function mapSearchRequest(
  input: SearchFlightsInput,
  config: TripProConfig,
): TripProSearchRequest {
  const originDestination: TripProSearchRequest['OriginDestination'] = [
    {
      DepartureTime: formatDateDDMMYYYY(input.departureDate),
      DepartureLocationCode: input.origin,
      ArrivalLocationCode: input.destination,
      CabinClass: REVERSE_CABIN_MAP[input.cabinClass ?? 'economy'],
      ...(input.preferredAirlines && {
        PreferredAirlines: input.preferredAirlines.join(','),
      }),
    },
  ];

  if (input.returnDate) {
    originDestination.push({
      DepartureTime: formatDateDDMMYYYY(input.returnDate),
      DepartureLocationCode: input.destination,
      ArrivalLocationCode: input.origin,
      CabinClass: REVERSE_CABIN_MAP[input.cabinClass ?? 'economy'],
    });
  }

  return {
    OtherInfo: {
      RequestedIP: config.whitelistedIp,
      TransactionId: generateTransactionId(),
    },
    CurrencyInfo: {
      CurrencyCode: input.currency ?? config.defaultCurrency,
    },
    PaxDetails: {
      NoOfAdults: { count: input.passengers.adults },
      ...(input.passengers.children && {
        NoOfChildren: {
          count: input.passengers.children,
          age: input.passengers.childAges?.[0] ?? 10,
        },
      }),
      ...(input.passengers.infants && {
        NoOfInfants: { count: input.passengers.infants, age: 1 },
      }),
    },
    OriginDestination: originDestination,
    Incremental: false,
  };
}

export function mapRepriceRequest(
  offerId: string,
  passengers: PassengerCount,
): TripProRepriceRequest {
  return {
    ItineraryId: offerId,
    AdultPaxCount: passengers.adults,
    ChildPaxCount: passengers.children ?? 0,
    InfantPaxCount: passengers.infants ?? 0,
  };
}

export function mapBookRequest(input: CreateBookingInput): TripProBookRequest {
  return {
    ItineraryId: input.offerId,
    BookItineraryPaxDetail: input.passengers.map((pax) => ({
      PaxType: reverseMapPaxType(pax.type),
      Gender: pax.gender,
      UserTitle: pax.title ?? (pax.gender === 'M' ? 'MR' : 'MS'),
      FirstName: pax.firstName,
      MiddleName: pax.middleName ?? '',
      LastName: pax.lastName,
      DateOfBirth: formatDateMMDDYYYY(pax.dateOfBirth),
      PassportNumber: pax.passportNumber ?? '',
      CountryOfIssue: pax.passportCountry ?? '',
      Nationality: pax.nationality ?? '',
      PassportIssueDate: '',
      PassportExpiryDate: pax.passportExpiry ? formatDateMMDDYYYY(pax.passportExpiry) : '',
    })),
    BookItineraryPaxContactInfo: {
      PhoneNumber: input.contact.phone,
      AlternatePhoneNumber: input.contact.alternatePhone ?? '',
      Email: input.contact.email,
    },
    BookItineraryPaymentDetail: {
      PaymentType: 'HOLD',
      BookItineraryCCDetails: {},
      BookItineraryBillingAddress: {},
    },
  };
}

// ============================================================
// RESPONSE MAPPERS
// ============================================================

function mapSegment(
  seg: TripProItinerary['Citypairs'][number]['FlightSegment'][number],
  legStops: number,
): FlightSegment {
  return {
    origin: seg.DepartureLocationCode,
    destination: seg.ArrivalLocationCode,
    marketingCarrier: seg.MarketingAirline,
    flightNumber: String(seg.FlightNumber),
    departure: seg.DepartureDateTime,
    arrival: seg.ArrivalDateTime,
    duration: seg.Duration,
    cabinClass: seg.CabinClass,
    bookingClass: seg.BookingClass,
    fareBasisCode: seg.FareBasisCode,
    equipment: seg.AirEquipmentType,
    stops: legStops,
  };
}

function mapFare(fare: TripProFare): FareBreakdown {
  return {
    passengerType: mapPaxType(fare.PaxType),
    baseFare: {
      amount: new Decimal(fare.BaseFare).toString(),
      currency: fare.CurrencyCode,
    },
    taxes: {
      amount: new Decimal(fare.Taxes).toString(),
      currency: fare.CurrencyCode,
    },
    fees: fare.CCFee
      ? { amount: new Decimal(fare.CCFee).toString(), currency: fare.CurrencyCode }
      : undefined,
    total: {
      amount: new Decimal(fare.FullFare).toString(),
      currency: fare.CurrencyCode,
    },
    count: 1,
  };
}

export function mapSearchResponse(results: TripProItinerary[]): FlightOffer[] {
  return results.map((itinerary) => ({
    offerId: itinerary.ItineraryId,
    supplier: 'trippro',
    validatingCarrier: itinerary.ValidatingCarrierCode,
    validatingCarrierName: itinerary.ValidatingCarrierName,
    segments: itinerary.Citypairs.map((leg) =>
      leg.FlightSegment.map((seg) => mapSegment(seg, leg.NoOfStops)),
    ),
    fares: itinerary.Fares.map(mapFare),
    totalPrice: calculateTotalPrice(itinerary.Fares),
    fareType: mapFareType(itinerary.FareType),
    cabinClass: mapCabinClass(itinerary.CabinClass),
    refundable: !itinerary.Fares[0]?.IsNonRefundableFare,
    changeable: true,
    baggageAllowance: itinerary.Citypairs[0]?.FlightSegment[0]?.BaggageAllowance,
    raw: itinerary,
  }));
}

export function mapRepriceResponse(
  results: TripProItinerary[],
  originalOfferId: string,
): PricedItinerary {
  const itinerary = results[0];
  if (!itinerary) {
    return {
      offerId: originalOfferId,
      supplier: 'trippro',
      totalPrice: { amount: '0', currency: 'USD' },
      fares: [],
      fareRules: { refundable: false, changeable: false },
      priceChanged: false,
      available: false,
    };
  }

  const totalPrice = calculateTotalPrice(itinerary.Fares);
  const refundable = !itinerary.Fares[0]?.IsNonRefundableFare;

  return {
    offerId: itinerary.ItineraryId,
    supplier: 'trippro',
    totalPrice,
    fares: itinerary.Fares.map(mapFare),
    fareRules: {
      refundable,
      changeable: true,
    },
    priceChanged: itinerary.ItineraryId !== originalOfferId,
    available: true,
    raw: itinerary,
  };
}

export function mapBookResponse(response: TripProBookResponse): BookingResult {
  return {
    bookingId: response.ReferenceNumber ?? '',
    supplier: 'trippro',
    status: response.PNR ? 'held' : 'failed',
    pnr: response.PNR ?? undefined,
    paymentLink: undefined,
    paymentDeadline: undefined,
    segments: [],
    passengers: [],
    totalPrice: { amount: '0', currency: 'USD' },
    raw: response,
  };
}
