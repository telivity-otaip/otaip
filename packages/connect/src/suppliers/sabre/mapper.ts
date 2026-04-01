/**
 * Sabre ↔ ConnectAdapter type mappers.
 *
 * Request mappers: ConnectAdapter standard types → Sabre API format
 * Response mappers: Sabre API format → ConnectAdapter standard types
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
import type { SabreConfig } from './config.js';
import type {
  BfmLeg,
  BfmOriginDestination,
  BfmPricingInfo,
  BfmRequest,
  BfmResponse,
  BfmScheduleDesc,
  SabreBooking,
  SabreBookTraveler,
  SabreCancelBookingResponse,
  SabreCreateBookingRequest,
  SabreCreateBookingResponse,
  SabreError,
  SabreFlight,
  SabreFulfillTicketsResponse,
  SabreGetBookingResponse,
  SabreTraveler,
} from './types.js';

// ============================================================
// TYPE MAPS
// ============================================================

const PAX_TYPE_MAP: Record<string, 'adult' | 'child' | 'infant'> = {
  ADT: 'adult',
  CNN: 'child',
  CHD: 'child',
  C06: 'child',
  C07: 'child',
  C08: 'child',
  C09: 'child',
  C10: 'child',
  C11: 'child',
  INF: 'infant',
  INS: 'infant',
  INY: 'infant',
};

const REVERSE_PAX_TYPE_MAP: Record<string, string> = {
  adult: 'ADT',
  child: 'CNN',
  infant: 'INF',
};

const CABIN_MAP: Record<CabinClass, string> = {
  economy: 'Economy',
  premium_economy: 'PremiumEconomy',
  business: 'Business',
  first: 'First',
};

const REVERSE_CABIN_MAP: Record<string, CabinClass> = {
  Y: 'economy',
  S: 'premium_economy',
  C: 'business',
  J: 'business',
  F: 'first',
  P: 'first',
  Economy: 'economy',
  PremiumEconomy: 'premium_economy',
  Business: 'business',
  First: 'first',
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

function formatDepartureDateTime(isoDate: string): string {
  return `${isoDate}T00:00:00`;
}

function buildSegmentDepartureIso(
  scheduleDesc: BfmScheduleDesc,
  legDepartureDate: string,
  departureDateAdjustment: number,
): string {
  const parts = legDepartureDate.split('-').map(Number);
  const year = parts[0] ?? 2026;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const baseDate = new Date(year, month - 1, day + departureDateAdjustment);
  const dateStr = baseDate.toISOString().slice(0, 10);
  return `${dateStr}T${scheduleDesc.departure.time}`;
}

function buildSegmentArrivalIso(
  scheduleDesc: BfmScheduleDesc,
  departureDateStr: string,
): string {
  const dateAdjustment = scheduleDesc.arrival.dateAdjustment ?? 0;
  const parts = departureDateStr.slice(0, 10).split('-').map(Number);
  const year = parts[0] ?? 2026;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const arrivalDate = new Date(year, month - 1, day + dateAdjustment);
  const arrDateStr = arrivalDate.toISOString().slice(0, 10);
  return `${arrDateStr}T${scheduleDesc.arrival.time}`;
}

function minutesToIsoDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `PT${hours}H${mins}M`;
}

// ============================================================
// SEARCH REQUEST MAPPER
// ============================================================

export function mapSearchRequest(
  input: SearchFlightsInput,
  config: SabreConfig,
): BfmRequest {
  const originDestinations: BfmOriginDestination[] = [
    {
      DepartureDateTime: formatDepartureDateTime(input.departureDate),
      OriginLocation: { LocationCode: input.origin },
      DestinationLocation: { LocationCode: input.destination },
    },
  ];

  if (input.returnDate) {
    originDestinations.push({
      DepartureDateTime: formatDepartureDateTime(input.returnDate),
      OriginLocation: { LocationCode: input.destination },
      DestinationLocation: { LocationCode: input.origin },
    });
  }

  const paxTypes: Array<{ Code: string; Quantity: number }> = [
    { Code: 'ADT', Quantity: input.passengers.adults },
  ];
  if (input.passengers.children) {
    paxTypes.push({ Code: 'CNN', Quantity: input.passengers.children });
  }
  if (input.passengers.infants) {
    paxTypes.push({ Code: 'INF', Quantity: input.passengers.infants });
  }

  const request: BfmRequest = {
    OTA_AirLowFareSearchRQ: {
      Version: '5',
      ResponseType: 'GIR-JSON',
      AvailableFlightsOnly: true,
      POS: {
        Source: [
          {
            PseudoCityCode: config.pcc ?? 'XXXX',
            RequestorID: {
              ID: '1',
              Type: '1',
              CompanyName: { Code: 'TN' },
            },
          },
        ],
      },
      OriginDestinationInformation: originDestinations,
      TravelerInfoSummary: {
        AirTravelerAvail: [{ PassengerTypeQuantity: paxTypes }],
        PriceRequestInformation: {
          CurrencyCode: input.currency ?? config.defaultCurrency,
        },
      },
    },
  };

  if (input.cabinClass || input.directOnly !== undefined || input.preferredAirlines?.length) {
    const travelPrefs: BfmRequest['OTA_AirLowFareSearchRQ']['TravelPreferences'] = {};

    if (input.cabinClass) {
      travelPrefs.CabinPref = [{ Cabin: CABIN_MAP[input.cabinClass] }];
    }

    if (input.directOnly) {
      travelPrefs.MaxStopsQuantity = 0;
    }

    if (input.preferredAirlines?.length) {
      travelPrefs.VendorPref = input.preferredAirlines.map((code) => ({
        Code: code,
        PreferLevel: 'Preferred',
      }));
    }

    request.OTA_AirLowFareSearchRQ.TravelPreferences = travelPrefs;
  }

  return request;
}

// ============================================================
// SEARCH RESPONSE MAPPER
// ============================================================

function resolveScheduleDesc(
  scheduleDescs: BfmScheduleDesc[],
  ref: number,
): BfmScheduleDesc | undefined {
  return scheduleDescs.find((s) => s.id === ref);
}

function resolveLeg(
  legDescs: BfmLeg[],
  ref: number,
): BfmLeg | undefined {
  return legDescs.find((l) => l.id === ref);
}

function mapScheduleToSegment(
  desc: BfmScheduleDesc,
  legDepartureDate: string,
  departureDateAdjustment: number,
  fareComponent?: { bookingCode?: string; cabinCode?: string; fareBasisCode?: string },
): FlightSegment {
  const departureIso = buildSegmentDepartureIso(desc, legDepartureDate, departureDateAdjustment);
  const arrivalIso = buildSegmentArrivalIso(desc, departureIso);

  return {
    origin: desc.departure.airport,
    destination: desc.arrival.airport,
    marketingCarrier: desc.carrier.marketing,
    operatingCarrier: desc.carrier.operating ?? desc.carrier.marketing,
    flightNumber: String(desc.carrier.marketingFlightNumber),
    departure: departureIso,
    arrival: arrivalIso,
    duration: desc.elapsedTime ? minutesToIsoDuration(desc.elapsedTime) : undefined,
    cabinClass: fareComponent?.cabinCode ?? desc.bookingDetails?.classOfService ?? 'Y',
    bookingClass: fareComponent?.bookingCode ?? desc.bookingDetails?.classOfService ?? 'Y',
    fareBasisCode: fareComponent?.fareBasisCode,
    equipment: desc.carrier.equipment?.code,
    stops: desc.stopCount ?? 0,
    stopLocations: desc.hiddenStops?.map((h) => h.airport),
  };
}

function extractFareComponentInfo(
  pricingInfo: BfmPricingInfo,
  fareComponentDescs?: Array<{ id: number; fareBasisCode?: string; segments?: Array<{ segment?: { bookingCode?: string; cabinCode?: string } }> }>,
): Map<number, { bookingCode?: string; cabinCode?: string; fareBasisCode?: string }> {
  const infoMap = new Map<number, { bookingCode?: string; cabinCode?: string; fareBasisCode?: string }>();
  if (!fareComponentDescs) return infoMap;

  for (const paxEl of pricingInfo.fare.passengerInfoList) {
    const paxInfo = paxEl.passengerInfo;
    if (!paxInfo?.fareComponents) continue;

    for (const fc of paxInfo.fareComponents) {
      const desc = fareComponentDescs.find((d) => d.id === fc.ref);
      if (!desc) continue;

      const firstSeg = desc.segments?.[0]?.segment;
      infoMap.set(fc.ref, {
        bookingCode: firstSeg?.bookingCode,
        cabinCode: firstSeg?.cabinCode,
        fareBasisCode: desc.fareBasisCode,
      });
    }
  }

  return infoMap;
}

function mapPassengerFares(
  pricingInfo: BfmPricingInfo,
  currency: string,
): FareBreakdown[] {
  const fares: FareBreakdown[] = [];

  for (const paxEl of pricingInfo.fare.passengerInfoList) {
    const paxInfo = paxEl.passengerInfo;
    if (!paxInfo?.passengerTotalFare) continue;

    const ptf = paxInfo.passengerTotalFare;
    fares.push({
      passengerType: mapPaxType(paxInfo.passengerType),
      baseFare: toMoney(ptf.baseFareAmount, ptf.baseFareCurrency ?? currency),
      taxes: toMoney(ptf.totalTaxAmount, currency),
      total: toMoney(ptf.totalFare, currency),
      count: paxInfo.total ?? 1,
    });
  }

  return fares;
}

function calculateTotalFromFares(fares: FareBreakdown[]): MoneyAmount {
  const currency = fares[0]?.total.currency ?? 'USD';
  const total = fares.reduce(
    (sum, fare) => sum.plus(new Decimal(fare.total.amount).times(fare.count)),
    new Decimal(0),
  );
  return { amount: total.toString(), currency };
}

function isNonRefundable(pricingInfo: BfmPricingInfo): boolean {
  for (const paxEl of pricingInfo.fare.passengerInfoList) {
    if (paxEl.passengerInfo?.nonRefundable) return true;
  }
  return false;
}

function extractCabinClass(pricingInfo: BfmPricingInfo, fareComponentDescs?: Array<{ id: number; segments?: Array<{ segment?: { cabinCode?: string } }> }>): CabinClass {
  if (!fareComponentDescs) return 'economy';

  for (const paxEl of pricingInfo.fare.passengerInfoList) {
    const paxInfo = paxEl.passengerInfo;
    if (!paxInfo?.fareComponents) continue;

    for (const fc of paxInfo.fareComponents) {
      const desc = fareComponentDescs.find((d) => d.id === fc.ref);
      const cabinCode = desc?.segments?.[0]?.segment?.cabinCode;
      if (cabinCode) return mapCabinClass(cabinCode);
    }
  }

  return 'economy';
}

function extractBaggageAllowance(
  pricingInfo: BfmPricingInfo,
  baggageDescs?: BfmResponse['groupedItineraryResponse']['baggageAllowanceDescs'],
): string | undefined {
  if (!baggageDescs) return undefined;

  for (const paxEl of pricingInfo.fare.passengerInfoList) {
    const paxInfo = paxEl.passengerInfo;
    if (!paxInfo?.baggageInformation) continue;

    for (const bagInfo of paxInfo.baggageInformation) {
      const ref = bagInfo.allowance?.ref;
      if (ref === undefined) continue;

      const desc = baggageDescs.find((b) => b.id === ref);
      if (!desc) continue;

      if (desc.pieceCount !== undefined) {
        return `${desc.pieceCount}PC`;
      }
      if (desc.weight !== undefined && desc.unit) {
        return `${desc.weight}${desc.unit.toUpperCase()}`;
      }
    }
  }

  return undefined;
}

export function mapSearchResponse(response: BfmResponse): FlightOffer[] {
  const gir = response.groupedItineraryResponse;
  const scheduleDescs = gir.scheduleDescs ?? [];
  const legDescs = gir.legDescs ?? [];
  const fareComponentDescs = gir.fareComponentDescs;
  const baggageDescs = gir.baggageAllowanceDescs;
  const offers: FlightOffer[] = [];

  for (const group of gir.itineraryGroups ?? []) {
    for (const itin of group.itineraries ?? []) {
      const pricingList = itin.pricingInformation ?? [];
      for (let pIdx = 0; pIdx < pricingList.length; pIdx++) {
        const pricingInfo = pricingList[pIdx]!;
        const fare = pricingInfo.fare;
        const currency = fare.totalFare?.currency ?? 'USD';

        const fareCompInfo = extractFareComponentInfo(pricingInfo, fareComponentDescs);
        const firstCompInfo = fareCompInfo.size > 0
          ? fareCompInfo.values().next().value
          : undefined;

        const segments: FlightSegment[][] = [];
        const legDepartureDate = group.groupDescription.legDescriptions[0]?.departureDate ?? '';

        for (const legRef of itin.legs ?? []) {
          const leg = resolveLeg(legDescs, legRef.ref);
          if (!leg) continue;

          const legDate = legRef.departureDate?.slice(0, 10) ?? legDepartureDate;
          const legSegments: FlightSegment[] = [];

          for (const schedRef of leg.schedules) {
            const desc = resolveScheduleDesc(scheduleDescs, schedRef.ref);
            if (!desc) continue;

            legSegments.push(
              mapScheduleToSegment(
                desc,
                legDate,
                schedRef.departureDateAdjustment ?? 0,
                firstCompInfo,
              ),
            );
          }

          segments.push(legSegments);
        }

        const fares = mapPassengerFares(pricingInfo, currency);
        const totalPrice = fare.totalFare
          ? toMoney(fare.totalFare.totalPrice, currency)
          : calculateTotalFromFares(fares);

        offers.push({
          offerId: `sabre-${itin.id}-${pIdx}`,
          supplier: 'sabre',
          validatingCarrier: fare.validatingCarrierCode ?? '',
          segments,
          fares,
          totalPrice,
          fareType: 'published',
          cabinClass: extractCabinClass(pricingInfo, fareComponentDescs),
          refundable: !isNonRefundable(pricingInfo),
          changeable: true,
          baggageAllowance: extractBaggageAllowance(pricingInfo, baggageDescs),
          expiresAt: fare.lastTicketDate ?? undefined,
          raw: itin,
        });
      }
    }
  }

  return offers;
}

// ============================================================
// PRICE ITINERARY RESPONSE MAPPER
// ============================================================

export function mapPriceResponse(
  response: BfmResponse,
  originalOfferId: string,
): PricedItinerary {
  const offers = mapSearchResponse(response);
  const offer = offers[0];

  if (!offer) {
    return {
      offerId: originalOfferId,
      supplier: 'sabre',
      totalPrice: { amount: '0', currency: 'USD' },
      fares: [],
      fareRules: { refundable: false, changeable: false },
      priceChanged: false,
      available: false,
    };
  }

  return {
    offerId: offer.offerId,
    supplier: 'sabre',
    totalPrice: offer.totalPrice,
    fares: offer.fares,
    fareRules: {
      refundable: offer.refundable,
      changeable: offer.changeable,
    },
    priceChanged: offer.offerId !== originalOfferId,
    available: true,
    raw: offer.raw,
  };
}

// ============================================================
// BOOKING REQUEST MAPPER
// ============================================================

export function mapCreateBookingRequest(
  input: CreateBookingInput,
): SabreCreateBookingRequest {
  const travelers: SabreBookTraveler[] = input.passengers.map((pax) => {
    const traveler: SabreBookTraveler = {
      givenName: pax.firstName,
      surname: pax.lastName,
      birthDate: pax.dateOfBirth,
      gender: pax.gender,
      passengerCode: reverseMapPaxType(pax.type),
      title: pax.title,
    };

    if (pax.passportNumber) {
      traveler.identityDocuments = [
        {
          documentNumber: pax.passportNumber,
          documentType: 'PASSPORT',
          expiryDate: pax.passportExpiry,
          issuingCountryCode: pax.passportCountry,
          citizenshipCountryCode: pax.nationality,
          givenName: pax.firstName,
          surname: pax.lastName,
          birthDate: pax.dateOfBirth,
          gender: pax.gender,
        },
      ];
    }

    return traveler;
  });

  return {
    flightOffer: {
      offerId: input.offerId,
      selectedOfferItems: [{ id: input.offerId }],
    },
    travelers,
    contactInfo: {
      emails: [input.contact.email],
      phones: [input.contact.phone],
    },
    payment: {
      formsOfPayment: [{ type: 'CASH' }],
    },
    receivedFrom: 'OTAIP Connect',
  };
}

// ============================================================
// BOOKING RESPONSE MAPPERS
// ============================================================

function mapSabreFlightToSegment(flight: SabreFlight): FlightSegment {
  return {
    origin: flight.fromAirportCode,
    destination: flight.toAirportCode,
    marketingCarrier: flight.airlineCode,
    operatingCarrier: flight.operatingAirlineCode ?? flight.airlineCode,
    flightNumber: String(flight.flightNumber),
    departure: `${flight.departureDate}T${flight.departureTime}`,
    arrival: `${flight.arrivalDate}T${flight.arrivalTime}`,
    duration: flight.duration ? minutesToIsoDuration(flight.duration) : undefined,
    cabinClass: flight.cabinType ?? flight.bookingClass ?? 'Y',
    bookingClass: flight.bookingClass ?? 'Y',
    equipment: flight.equipmentType,
    stops: flight.numberOfStops ?? 0,
  };
}

function mapSabreTravelerToPassenger(traveler: SabreTraveler): PassengerDetail {
  const doc = traveler.identityDocuments?.[0];

  return {
    type: mapPaxType(traveler.passengerCode ?? 'ADT'),
    gender: (traveler.gender === 'M' || traveler.gender === 'F')
      ? traveler.gender
      : 'M',
    firstName: traveler.givenName ?? '',
    middleName: traveler.middleName,
    lastName: traveler.surname ?? '',
    dateOfBirth: traveler.birthDate ?? '',
    passportNumber: doc?.documentNumber,
    passportExpiry: doc?.expiryDate,
    passportCountry: doc?.issuingCountryCode,
    nationality: doc?.citizenshipCountryCode,
  };
}

function mapSabreFlightsToSegments(flights?: SabreFlight[]): FlightSegment[][] {
  if (!flights?.length) return [];
  return [flights.map(mapSabreFlightToSegment)];
}

function mapSabreTravelersToPassengers(travelers?: SabreTraveler[]): PassengerDetail[] {
  return (travelers ?? []).map(mapSabreTravelerToPassenger);
}

function deriveBookingStatus(booking?: SabreBooking, errors?: SabreError[]): BookingStatus {
  if (errors?.length) return 'failed';
  if (booking?.isTicketed) return 'ticketed';
  if (booking?.isCancelable === false && !booking?.isTicketed) return 'cancelled';
  return 'held';
}

function extractTotalPrice(booking?: SabreBooking): MoneyAmount {
  const fare = booking?.fares?.[0];
  if (fare?.totalFare) {
    return toMoney(fare.totalFare.amount, fare.totalFare.currency ?? 'USD');
  }
  return { amount: '0', currency: 'USD' };
}

export function mapCreateBookingResponse(
  response: SabreCreateBookingResponse,
): BookingResult {
  const booking = response.booking;

  return {
    bookingId: response.confirmationId ?? booking?.bookingId ?? '',
    supplier: 'sabre',
    status: deriveBookingStatus(booking, response.errors),
    pnr: response.confirmationId ?? booking?.bookingId,
    paymentDeadline: booking?.creationDetails?.purchaseDeadlineDate
      ? `${booking.creationDetails.purchaseDeadlineDate}T${booking.creationDetails.purchaseDeadlineTime ?? '23:59'}`
      : undefined,
    segments: mapSabreFlightsToSegments(booking?.flights),
    passengers: mapSabreTravelersToPassengers(booking?.travelers),
    totalPrice: extractTotalPrice(booking),
    raw: response,
  };
}

export function mapGetBookingResponse(
  response: SabreGetBookingResponse,
  bookingId: string,
): BookingStatusResult {
  const booking = response.booking;
  const flights = booking?.flights ?? response.flights;
  const travelers = booking?.travelers ?? response.travelers;
  const tickets = booking?.flightTickets ?? response.flightTickets;
  const isTicketed = booking?.isTicketed ?? response.isTicketed;

  let status: BookingStatus = 'held';
  if (response.errors?.length) status = 'failed';
  else if (isTicketed) status = 'ticketed';

  const ticketNumbers = tickets
    ?.map((t) => t.number)
    .filter((n): n is string => !!n);

  return {
    bookingId,
    supplier: 'sabre',
    status,
    pnr: booking?.bookingId ?? response.bookingId ?? bookingId,
    ticketNumbers: ticketNumbers?.length ? ticketNumbers : undefined,
    segments: mapSabreFlightsToSegments(flights),
    passengers: mapSabreTravelersToPassengers(travelers),
    totalPrice: extractTotalPrice(booking),
    raw: response,
  };
}

export function mapCancelResponse(
  response: SabreCancelBookingResponse,
  bookingId: string,
): { success: boolean; message: string } {
  if (response.errors?.length) {
    const errorMessages = response.errors
      .map((e) => e.description ?? e.message ?? e.code ?? 'Unknown error')
      .join('; ');
    return { success: false, message: errorMessages };
  }

  return { success: true, message: `Booking ${bookingId} cancelled` };
}

export function mapFulfillResponse(
  response: SabreFulfillTicketsResponse,
  bookingId: string,
): BookingStatusResult {
  const ticketNumbers = response.tickets
    ?.map((t) => t.number)
    .filter((n): n is string => !!n);

  return {
    bookingId,
    supplier: 'sabre',
    status: ticketNumbers?.length ? 'ticketed' : 'confirmed',
    pnr: bookingId,
    ticketNumbers: ticketNumbers?.length ? ticketNumbers : undefined,
    segments: [],
    passengers: [],
    totalPrice: { amount: '0', currency: 'USD' },
    raw: response,
  };
}
