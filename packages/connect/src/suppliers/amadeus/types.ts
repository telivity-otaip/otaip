/**
 * Amadeus Self-Service API raw types — derived from the Amadeus documentation.
 *
 * Flight Offers Search v2 (shopping)
 * Flight Offers Price v1 (pricing)
 * Flight Orders v1 (booking lifecycle)
 *
 * These types mirror Amadeus's wire format; no normalization.
 */

// ============================================================
// SHARED TYPES
// ============================================================

export interface AmadeusLocation {
  iataCode: string;
  terminal?: string;
  at: string;
}

export interface AmadeusAircraft {
  code: string;
}

export interface AmadeusOperating {
  carrierCode: string;
}

export interface AmadeusStop {
  iataCode: string;
  duration?: string;
  arrivalAt?: string;
  departureAt?: string;
}

export interface AmadeusSegment {
  departure: AmadeusLocation;
  arrival: AmadeusLocation;
  carrierCode: string;
  number: string;
  aircraft?: AmadeusAircraft;
  operating?: AmadeusOperating;
  duration?: string;
  id?: string;
  numberOfStops?: number;
  blacklistedInEU?: boolean;
  stops?: AmadeusStop[];
  co2Emissions?: Array<{ weight: number; weightUnit: string; cabin: string }>;
}

export interface AmadeusItinerary {
  duration?: string;
  segments: AmadeusSegment[];
}

export interface AmadeusPrice {
  currency: string;
  total: string;
  base: string;
  fees?: Array<{ amount: string; type: string }>;
  grandTotal: string;
}

export interface AmadeusFareDetailsBySegment {
  segmentId: string;
  cabin: string;
  fareBasis?: string;
  class?: string;
  includedCheckedBags?: {
    weight?: number;
    weightUnit?: string;
    quantity?: number;
  };
  brandedFare?: string;
}

export interface AmadeusTravelerPricing {
  travelerId: string;
  fareOption: string;
  travelerType: string;
  price: {
    currency: string;
    total: string;
    base: string;
  };
  fareDetailsBySegment: AmadeusFareDetailsBySegment[];
}

export interface AmadeusPricingOptions {
  fareType?: string[];
  includedCheckedBagsOnly?: boolean;
}

// ============================================================
// FLIGHT OFFERS SEARCH — Response
// ============================================================

export interface AmadeusFlightOffer {
  type: string;
  id: string;
  source: string;
  instantTicketingRequired?: boolean;
  nonHomogeneous?: boolean;
  oneWay?: boolean;
  lastTicketingDate?: string;
  lastTicketingDateTime?: string;
  numberOfBookableSeats?: number;
  itineraries: AmadeusItinerary[];
  price: AmadeusPrice;
  pricingOptions?: AmadeusPricingOptions;
  validatingAirlineCodes?: string[];
  travelerPricings: AmadeusTravelerPricing[];
}

export interface AmadeusFlightSearchResponse {
  data: AmadeusFlightOffer[];
  dictionaries?: {
    carriers?: Record<string, string>;
    aircraft?: Record<string, string>;
    currencies?: Record<string, string>;
    locations?: Record<string, { cityCode: string; countryCode: string }>;
  };
}

// ============================================================
// FLIGHT OFFERS PRICE — Response
// ============================================================

export interface AmadeusFlightPriceResponse {
  data: {
    type: string;
    flightOffers: AmadeusFlightOffer[];
  };
}

// ============================================================
// FLIGHT ORDERS — Request Types
// ============================================================

export interface AmadeusTravelerName {
  firstName: string;
  lastName: string;
}

export interface AmadeusTravelerPhone {
  deviceType: string;
  countryCallingCode: string;
  number: string;
}

export interface AmadeusTravelerDocument {
  documentType: string;
  birthPlace?: string;
  issuanceLocation?: string;
  issuanceDate?: string;
  number: string;
  expiryDate?: string;
  issuanceCountry?: string;
  validityCountry?: string;
  nationality?: string;
  holder?: boolean;
}

export interface AmadeusTravelerContact {
  emailAddress: string;
  phones: AmadeusTravelerPhone[];
}

export interface AmadeusTraveler {
  id: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE';
  name: AmadeusTravelerName;
  contact?: AmadeusTravelerContact;
  documents?: AmadeusTravelerDocument[];
}

export interface AmadeusFlightOrderRequest {
  type: string;
  flightOffers: AmadeusFlightOffer[];
  travelers: AmadeusTraveler[];
  remarks?: {
    general?: Array<{ subType: string; text: string }>;
  };
}

// ============================================================
// FLIGHT ORDERS — Response
// ============================================================

export interface AmadeusAssociatedRecord {
  reference: string;
  creationDate?: string;
  originSystemCode?: string;
  flightOfferId?: string;
}

export interface AmadeusFlightOrder {
  type: string;
  id: string;
  queuingOfficeId?: string;
  associatedRecords?: AmadeusAssociatedRecord[];
  flightOffers: AmadeusFlightOffer[];
  travelers: AmadeusTraveler[];
}

export interface AmadeusFlightOrderResponse {
  data: AmadeusFlightOrder;
}

// ============================================================
// SDK RESPONSE ENVELOPE
// ============================================================

/**
 * The Amadeus Node SDK wraps all responses in this envelope.
 * `data` is the parsed JSON result, `result` is the full parsed response,
 * and `body` is the raw string body.
 */
export interface AmadeusSdkResponse<T> {
  data: T extends { data: infer D } ? D : unknown;
  result: T;
  body: string | null;
}

// ============================================================
// ERROR TYPES
// ============================================================

export interface AmadeusError {
  status?: number;
  code?: number;
  title?: string;
  detail?: string;
  source?: {
    pointer?: string;
    parameter?: string;
    example?: string;
  };
}

export interface AmadeusErrorResponse {
  errors: AmadeusError[];
}
