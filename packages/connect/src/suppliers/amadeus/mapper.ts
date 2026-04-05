/**
 * Amadeus <-> ConnectAdapter type mappers.
 *
 * Request mappers: ConnectAdapter standard types -> Amadeus SDK format
 * Response mappers: Amadeus SDK format -> ConnectAdapter standard types
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
  FareRules,
  FlightOffer,
  FlightSegment,
  MoneyAmount,
  PassengerCount,
  PassengerDetail,
  PricedItinerary,
  SearchFlightsInput,
} from '../../types.js';
import type {
  AmadeusFlightOffer,
  AmadeusFlightOrder,
  AmadeusFlightOrderRequest,
  AmadeusSegment,
  AmadeusTraveler,
  AmadeusTravelerPricing,
} from './types.js';

// ============================================================
// TYPE MAPS
// ============================================================

const PAX_TYPE_MAP: Record<string, 'adult' | 'child' | 'infant'> = {
  ADULT: 'adult',
  CHILD: 'child',
  SEATED_INFANT: 'infant',
  HELD_INFANT: 'infant',
};

const REVERSE_PAX_TYPE_MAP: Record<string, string> = {
  adult: 'ADULT',
  child: 'CHILD',
  infant: 'HELD_INFANT',
};

const CABIN_MAP: Record<string, CabinClass> = {
  ECONOMY: 'economy',
  PREMIUM_ECONOMY: 'premium_economy',
  BUSINESS: 'business',
  FIRST: 'first',
};

const REVERSE_CABIN_MAP: Record<CabinClass, string> = {
  economy: 'ECONOMY',
  premium_economy: 'PREMIUM_ECONOMY',
  business: 'BUSINESS',
  first: 'FIRST',
};

// ============================================================
// HELPERS
// ============================================================

export function mapPaxType(code: string): 'adult' | 'child' | 'infant' {
  return PAX_TYPE_MAP[code] ?? 'adult';
}

export function reverseMapPaxType(type: string): string {
  return REVERSE_PAX_TYPE_MAP[type] ?? 'ADULT';
}

export function mapCabinClass(cabin: string): CabinClass {
  return CABIN_MAP[cabin] ?? 'economy';
}

export function reverseMapCabinClass(cabin: CabinClass): string {
  return REVERSE_CABIN_MAP[cabin] ?? 'ECONOMY';
}

export function toMoney(amount: string | undefined, currency: string): MoneyAmount {
  return {
    amount: new Decimal(amount ?? '0').toString(),
    currency,
  };
}

// ============================================================
// SEARCH REQUEST MAPPER
// ============================================================

export function mapSearchParams(
  input: SearchFlightsInput,
  defaultCurrency: string,
): Record<string, string> {
  const params: Record<string, string> = {
    originLocationCode: input.origin,
    destinationLocationCode: input.destination,
    departureDate: input.departureDate,
    adults: String(input.passengers.adults),
    currencyCode: input.currency ?? defaultCurrency,
  };

  if (input.returnDate) {
    params['returnDate'] = input.returnDate;
  }

  if (input.passengers.children) {
    params['children'] = String(input.passengers.children);
  }

  if (input.passengers.infants) {
    params['infants'] = String(input.passengers.infants);
  }

  if (input.cabinClass) {
    params['travelClass'] = reverseMapCabinClass(input.cabinClass);
  }

  if (input.directOnly) {
    params['nonStop'] = 'true';
  }

  if (input.preferredAirlines?.length) {
    params['includedAirlineCodes'] = input.preferredAirlines.join(',');
  }

  return params;
}

// ============================================================
// SEARCH RESPONSE MAPPER
// ============================================================

function mapAmadeusSegment(seg: AmadeusSegment): FlightSegment {
  return {
    origin: seg.departure.iataCode,
    destination: seg.arrival.iataCode,
    marketingCarrier: seg.carrierCode,
    operatingCarrier: seg.operating?.carrierCode ?? seg.carrierCode,
    flightNumber: seg.number,
    departure: seg.departure.at,
    arrival: seg.arrival.at,
    duration: seg.duration,
    cabinClass: '',
    bookingClass: '',
    stops: seg.numberOfStops ?? 0,
    stopLocations: seg.stops?.map((s) => s.iataCode),
    equipment: seg.aircraft?.code,
  };
}

function enrichSegmentWithFareDetails(
  segment: FlightSegment,
  travelerPricings: AmadeusTravelerPricing[],
  segmentId: string,
): FlightSegment {
  const fareDetail = travelerPricings[0]?.fareDetailsBySegment.find(
    (fd) => fd.segmentId === segmentId,
  );

  if (!fareDetail) return segment;

  return {
    ...segment,
    cabinClass: fareDetail.cabin,
    bookingClass: fareDetail.class ?? fareDetail.cabin,
    fareBasisCode: fareDetail.fareBasis,
  };
}

function extractBaggageAllowance(
  travelerPricings: AmadeusTravelerPricing[],
): string | undefined {
  const firstPricing = travelerPricings[0];
  if (!firstPricing) return undefined;

  const firstDetail = firstPricing.fareDetailsBySegment[0];
  const bags = firstDetail?.includedCheckedBags;
  if (!bags) return undefined;

  if (bags.quantity !== undefined) {
    return `${bags.quantity}PC`;
  }
  if (bags.weight !== undefined && bags.weightUnit) {
    return `${bags.weight}${bags.weightUnit.toUpperCase()}`;
  }
  return undefined;
}

function extractCabinFromOffer(offer: AmadeusFlightOffer): CabinClass {
  const firstPricing = offer.travelerPricings[0];
  const firstDetail = firstPricing?.fareDetailsBySegment[0];
  if (firstDetail?.cabin) {
    return mapCabinClass(firstDetail.cabin);
  }
  return 'economy';
}

function mapTravelerPricingsToFares(
  travelerPricings: AmadeusTravelerPricing[],
): FareBreakdown[] {
  const fareMap = new Map<
    string,
    { type: 'adult' | 'child' | 'infant'; base: Decimal; total: Decimal; currency: string; count: number }
  >();

  for (const tp of travelerPricings) {
    const paxType = mapPaxType(tp.travelerType);
    const key = paxType;
    const existing = fareMap.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      fareMap.set(key, {
        type: paxType,
        base: new Decimal(tp.price.base),
        total: new Decimal(tp.price.total),
        currency: tp.price.currency,
        count: 1,
      });
    }
  }

  return Array.from(fareMap.values()).map((entry) => ({
    passengerType: entry.type,
    baseFare: { amount: entry.base.toString(), currency: entry.currency },
    taxes: { amount: entry.total.minus(entry.base).toString(), currency: entry.currency },
    total: { amount: entry.total.toString(), currency: entry.currency },
    count: entry.count,
  }));
}

function isRefundable(offer: AmadeusFlightOffer): boolean {
  const fareTypes = offer.pricingOptions?.fareType;
  if (!fareTypes) return false;
  return !fareTypes.includes('PUBLISHED_NON_REFUNDABLE');
}

export function mapSearchResponse(
  offers: AmadeusFlightOffer[],
  dictionaries?: { carriers?: Record<string, string> },
): FlightOffer[] {
  return offers.map((offer) => {
    const segments: FlightSegment[][] = offer.itineraries.map((itin) =>
      itin.segments.map((seg) => {
        const base = mapAmadeusSegment(seg);
        return enrichSegmentWithFareDetails(base, offer.travelerPricings, seg.id ?? '');
      }),
    );

    const fares = mapTravelerPricingsToFares(offer.travelerPricings);
    const validatingCarrier = offer.validatingAirlineCodes?.[0] ?? '';

    return {
      offerId: `amadeus-${offer.id}`,
      supplier: 'amadeus',
      validatingCarrier,
      validatingCarrierName: dictionaries?.carriers?.[validatingCarrier],
      segments,
      fares,
      totalPrice: toMoney(offer.price.grandTotal, offer.price.currency),
      fareType: 'published' as const,
      cabinClass: extractCabinFromOffer(offer),
      refundable: isRefundable(offer),
      changeable: true,
      baggageAllowance: extractBaggageAllowance(offer.travelerPricings),
      expiresAt: offer.lastTicketingDate ?? offer.lastTicketingDateTime,
      raw: offer,
    };
  });
}

// ============================================================
// PRICE RESPONSE MAPPER
// ============================================================

export function mapPriceResponse(
  pricedOffers: AmadeusFlightOffer[],
  originalOfferId: string,
): PricedItinerary {
  const offer = pricedOffers[0];

  if (!offer) {
    return {
      offerId: originalOfferId,
      supplier: 'amadeus',
      totalPrice: { amount: '0', currency: 'USD' },
      fares: [],
      fareRules: { refundable: false, changeable: false },
      priceChanged: false,
      available: false,
    };
  }

  const fares = mapTravelerPricingsToFares(offer.travelerPricings);
  const newOfferId = `amadeus-${offer.id}`;

  const fareRules: FareRules = {
    refundable: isRefundable(offer),
    changeable: true,
  };

  return {
    offerId: newOfferId,
    supplier: 'amadeus',
    totalPrice: toMoney(offer.price.grandTotal, offer.price.currency),
    fares,
    fareRules,
    priceChanged: newOfferId !== originalOfferId,
    available: true,
    raw: offer,
  };
}

// ============================================================
// BOOKING REQUEST MAPPER
// ============================================================

export function mapCreateBookingRequest(
  input: CreateBookingInput,
  pricedOffer: AmadeusFlightOffer,
): AmadeusFlightOrderRequest {
  const travelers: AmadeusTraveler[] = input.passengers.map((pax, idx) => {
    const traveler: AmadeusTraveler = {
      id: String(idx + 1),
      dateOfBirth: pax.dateOfBirth,
      gender: pax.gender === 'M' ? 'MALE' : 'FEMALE',
      name: {
        firstName: pax.firstName,
        lastName: pax.lastName,
      },
    };

    if (idx === 0) {
      traveler.contact = {
        emailAddress: input.contact.email,
        phones: [
          {
            deviceType: 'MOBILE',
            countryCallingCode: extractCountryCode(input.contact.phone),
            number: extractPhoneNumber(input.contact.phone),
          },
        ],
      };
    }

    if (pax.passportNumber) {
      traveler.documents = [
        {
          documentType: 'PASSPORT',
          number: pax.passportNumber,
          expiryDate: pax.passportExpiry,
          issuanceCountry: pax.passportCountry,
          nationality: pax.nationality ?? pax.passportCountry,
          holder: true,
        },
      ];
    }

    return traveler;
  });

  return {
    type: 'flight-order',
    flightOffers: [pricedOffer],
    travelers,
  };
}

function extractCountryCode(phone: string): string {
  const match = phone.match(/^\+(\d{1,3})/);
  return match?.[1] ?? '1';
}

function extractPhoneNumber(phone: string): string {
  return phone.replace(/^\+\d{1,3}[-\s]?/, '').replace(/[-\s]/g, '');
}

// ============================================================
// BOOKING RESPONSE MAPPERS
// ============================================================

function mapAmadeusOrderSegments(order: AmadeusFlightOrder): FlightSegment[][] {
  const firstOffer = order.flightOffers?.[0];
  if (!firstOffer) return [];

  return firstOffer.itineraries.map((itin) =>
    itin.segments.map((seg) => mapAmadeusSegment(seg)),
  );
}

function mapAmadeusTravelersToPassengers(
  travelers: AmadeusTraveler[],
): PassengerDetail[] {
  return travelers.map((t) => {
    const doc = t.documents?.[0];
    const travelerType = findTravelerType(t.id);

    return {
      type: travelerType,
      gender: t.gender === 'MALE' ? ('M' as const) : ('F' as const),
      firstName: t.name.firstName,
      lastName: t.name.lastName,
      dateOfBirth: t.dateOfBirth,
      passportNumber: doc?.number,
      passportExpiry: doc?.expiryDate,
      passportCountry: doc?.issuanceCountry,
      nationality: doc?.nationality,
    };
  });
}

function findTravelerType(_travelerId: string): 'adult' | 'child' | 'infant' {
  return 'adult';
}

function deriveBookingStatus(order: AmadeusFlightOrder): BookingStatus {
  const records = order.associatedRecords;
  if (!records?.length) return 'confirmed';
  return 'confirmed';
}

export function mapCreateBookingResponse(
  order: AmadeusFlightOrder,
): BookingResult {
  const pnr = order.associatedRecords?.[0]?.reference;
  const offer = order.flightOffers[0];

  return {
    bookingId: order.id,
    supplier: 'amadeus',
    status: deriveBookingStatus(order),
    pnr,
    segments: mapAmadeusOrderSegments(order),
    passengers: mapAmadeusTravelersToPassengers(order.travelers),
    totalPrice: offer
      ? toMoney(offer.price.grandTotal, offer.price.currency)
      : { amount: '0', currency: 'USD' },
    raw: order,
  };
}

export function mapGetBookingResponse(
  order: AmadeusFlightOrder,
  bookingId: string,
): BookingStatusResult {
  const pnr = order.associatedRecords?.[0]?.reference;
  const offer = order.flightOffers[0];

  return {
    bookingId,
    supplier: 'amadeus',
    status: deriveBookingStatus(order),
    pnr,
    segments: mapAmadeusOrderSegments(order),
    passengers: mapAmadeusTravelersToPassengers(order.travelers),
    totalPrice: offer
      ? toMoney(offer.price.grandTotal, offer.price.currency)
      : { amount: '0', currency: 'USD' },
    raw: order,
  };
}

// ============================================================
// PASSENGER COUNT HELPER
// ============================================================

export function mapPassengerCount(
  passengers: PassengerCount,
): { adults: number; children: number; infants: number } {
  return {
    adults: passengers.adults,
    children: passengers.children ?? 0,
    infants: passengers.infants ?? 0,
  };
}
