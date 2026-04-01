/**
 * Sabre raw API types — derived from the OpenAPI specifications.
 *
 * Bargain Finder Max v5 (flight search)
 * Booking Management API Beta v1 (booking lifecycle)
 *
 * These types mirror Sabre's wire format; no normalization.
 */

// ============================================================
// BARGAIN FINDER MAX v5 — Request Types
// ============================================================

export interface BfmRequest {
  OTA_AirLowFareSearchRQ: {
    Version: string;
    ResponseType: string;
    AvailableFlightsOnly?: boolean;
    POS: BfmPOS;
    OriginDestinationInformation: BfmOriginDestination[];
    TravelerInfoSummary: BfmTravelerInfoSummary;
    TravelPreferences?: BfmTravelPreferences;
    TPA_Extensions?: BfmRequestExtensions;
  };
}

export interface BfmPOS {
  Source: Array<{
    PseudoCityCode?: string;
    RequestorID: {
      ID: string;
      Type: string;
      CompanyName?: {
        Code: string;
      };
    };
  }>;
}

export interface BfmOriginDestination {
  DepartureDateTime: string;
  OriginLocation: {
    LocationCode: string;
    LocationType?: string;
  };
  DestinationLocation: {
    LocationCode: string;
    LocationType?: string;
  };
  TPA_Extensions?: {
    Flight?: BfmFlightRef[];
    CabinPref?: {
      Cabin: string;
      PreferLevel?: string;
    };
  };
}

export interface BfmFlightRef {
  Number: number;
  DepartureDateTime: string;
  ArrivalDateTime?: string;
  OriginLocation: { LocationCode: string };
  DestinationLocation: { LocationCode: string };
  Airline: { Marketing: string; Operating?: string };
  ClassOfService?: string;
  Type?: string;
}

export interface BfmTravelerInfoSummary {
  AirTravelerAvail: Array<{
    PassengerTypeQuantity: Array<{
      Code: string;
      Quantity: number;
    }>;
  }>;
  PriceRequestInformation?: {
    CurrencyCode?: string;
    NegotiatedFareCode?: Array<{ Code: string }>;
  };
}

export interface BfmTravelPreferences {
  CabinPref?: Array<{
    Cabin: string;
    PreferLevel?: string;
  }>;
  MaxStopsQuantity?: number;
  VendorPref?: Array<{
    Code: string;
    PreferLevel?: string;
    Type?: string;
  }>;
  ValidInterlineTicket?: boolean;
}

export interface BfmRequestExtensions {
  IntelliSellTransaction?: {
    RequestType: { Name: string };
  };
  NumTrips?: {
    Number: number;
  };
}

// ============================================================
// BARGAIN FINDER MAX v5 — Response Types (GIR format)
// ============================================================

export interface BfmResponse {
  groupedItineraryResponse: {
    version: string;
    messages: BfmMessage[];
    scheduleDescs?: BfmScheduleDesc[];
    legDescs?: BfmLeg[];
    fareComponentDescs?: BfmFareComponent[];
    baggageAllowanceDescs?: BfmBaggageAllowance[];
    validatingCarrierDescs?: BfmValidatingCarrier[];
    itineraryGroups?: BfmItineraryGroup[];
    statistics?: BfmStatistics;
  };
}

export interface BfmMessage {
  severity?: string;
  code?: string;
  text?: string;
  type?: string;
}

export interface BfmScheduleDesc {
  id: number;
  departure: {
    airport: string;
    city?: string;
    time: string;
    terminal?: string;
    dateAdjustment?: number;
  };
  arrival: {
    airport: string;
    city?: string;
    time: string;
    terminal?: string;
    dateAdjustment?: number;
  };
  carrier: {
    marketing: string;
    marketingFlightNumber: number;
    operating?: string;
    operatingFlightNumber?: number;
    equipment?: {
      code: string;
      typeForFirstLeg?: string;
      typeForLastLeg?: string;
    };
    disclosure?: string;
  };
  elapsedTime?: number;
  stopCount?: number;
  eTicketable?: boolean;
  hiddenStops?: Array<{
    airport: string;
    arrivalTime?: string;
    departureTime?: string;
    elapsedTime?: number;
  }>;
  totalMilesFlown?: number;
  bookingDetails?: {
    classOfService?: string;
    mealCodeList?: string;
  };
}

export interface BfmLeg {
  id: number;
  schedules: Array<{
    ref: number;
    departureDateAdjustment?: number;
  }>;
  elapsedTime?: number;
}

export interface BfmFareComponent {
  id: number;
  fareBasisCode?: string;
  governingCarrier?: string;
  fareAmount?: number;
  fareCurrency?: string;
  farePassengerType?: string;
  fareDirectionality?: string;
  segments?: Array<{
    segment?: {
      bookingCode?: string;
      cabinCode?: string;
      mealCode?: string;
      seatsAvailable?: number;
      availabilityBreak?: boolean;
    };
  }>;
}

export interface BfmBaggageAllowance {
  id: number;
  pieceCount?: number;
  weight?: number;
  unit?: string;
  description1?: string;
  description2?: string;
}

export interface BfmValidatingCarrier {
  id: number;
  settlementMethod?: string;
  newVcxProcess?: boolean;
  default?: BfmValidatingCarrierInfo;
  alternates?: BfmValidatingCarrierInfo[];
}

export interface BfmValidatingCarrierInfo {
  code: string;
}

export interface BfmItineraryGroup {
  groupDescription: {
    legDescriptions: Array<{
      departureDate: string;
      departureLocation?: string;
      arrivalLocation?: string;
    }>;
  };
  itineraries?: BfmItinerary[];
}

export interface BfmItinerary {
  id: number;
  pricingSource: string;
  legs?: Array<{
    ref: number;
    departureDate?: string;
  }>;
  pricingInformation?: BfmPricingInfo[];
}

export interface BfmPricingInfo {
  fare: BfmFare;
  distributionModel?: 'ATPCO' | 'NDC' | 'API';
  revalidated?: boolean;
  brand?: string;
  pseudoCityCode?: string;
}

export interface BfmFare {
  passengerInfoList: BfmPassengerInfoElement[];
  totalFare?: BfmTotalFare;
  validatingCarrierCode?: string;
  validatingCarriers?: Array<{ ref: number }>;
  lastTicketDate?: string;
  lastTicketTime?: string;
  governingCarriers?: string;
  eTicketable?: boolean;
}

export interface BfmPassengerInfoElement {
  passengerInfo?: BfmPassengerInfo;
}

export interface BfmPassengerInfo {
  passengerType: string;
  passengerNumber?: number;
  total?: number;
  nonRefundable?: boolean;
  passengerTotalFare?: BfmPassengerTotalFare;
  fareComponents?: Array<{ ref: number }>;
  baggageInformation?: Array<{
    allowance?: { ref: number };
    segment?: Array<{ id: number }>;
    provisionType?: string;
  }>;
  taxes?: Array<{ ref: number }>;
  taxSummaries?: Array<{ ref: number }>;
  penaltiesInfo?: BfmPenaltiesInfo;
}

export interface BfmPassengerTotalFare {
  totalFare: number;
  totalTaxAmount: number;
  currency: string;
  baseFareAmount?: number;
  baseFareCurrency?: string;
  equivalentAmount?: number;
  equivalentCurrency?: string;
  constructionAmount?: number;
  constructionCurrency?: string;
}

export interface BfmTotalFare {
  totalPrice: number;
  totalTaxAmount: number;
  currency: string;
  baseFareAmount?: number;
  baseFareCurrency?: string;
  equivalentAmount?: number;
  equivalentCurrency?: string;
  constructionAmount?: number;
  constructionCurrency?: string;
}

export interface BfmPenaltiesInfo {
  penalties?: Array<{
    applicability?: string;
    refundable?: boolean;
    changeable?: boolean;
    amount?: number;
    currency?: string;
    cat16Info?: boolean;
  }>;
}

export interface BfmStatistics {
  itineraryCount?: number;
}

// ============================================================
// BOOKING MANAGEMENT API v1 — Request Types
// ============================================================

export interface SabreCreateBookingRequest {
  flightDetails?: SabreFlightToBook[];
  flightOffer?: SabreFlightOffer;
  travelers?: SabreBookTraveler[];
  contactInfo?: SabreBookContactInfo;
  payment?: SabrePayment;
  receivedFrom?: string;
  targetPcc?: string;
  errorHandlingPolicy?: string[];
}

export interface SabreFlightOffer {
  offerId: string;
  selectedOfferItems?: Array<{ id: string }>;
}

export interface SabreFlightToBook {
  flightNumber: number;
  airlineCode: string;
  fromAirportCode: string;
  toAirportCode: string;
  departureDate: string;
  departureTime: string;
  bookingClass: string;
  flightStatusCode: string;
  arrivalDate?: string;
  arrivalTime?: string;
  isMarriageGroup?: boolean;
}

export interface SabreBookTraveler {
  givenName: string;
  surname: string;
  birthDate?: string;
  gender?: 'M' | 'F' | 'U';
  passengerCode?: string;
  title?: string;
  identityDocuments?: SabreIdentityDocument[];
  emails?: string[];
  phones?: Array<{
    number: string;
    type?: string;
  }>;
}

export interface SabreIdentityDocument {
  documentNumber: string;
  documentType: string;
  expiryDate?: string;
  issuingCountryCode?: string;
  residenceCountryCode?: string;
  givenName?: string;
  surname?: string;
  birthDate?: string;
  gender?: 'M' | 'F' | 'U';
  citizenshipCountryCode?: string;
}

export interface SabreBookContactInfo {
  emails?: string[];
  phones?: string[];
}

export interface SabrePayment {
  formsOfPayment: SabreFormOfPayment[];
}

export interface SabreFormOfPayment {
  type: 'CASH' | 'CHECK' | 'PAYMENTCARD' | 'MISCELLANEOUS';
}

// ============================================================
// BOOKING MANAGEMENT API v1 — Response Types
// ============================================================

export interface SabreCreateBookingResponse {
  timestamp?: string;
  confirmationId?: string;
  booking?: SabreBooking;
  errors?: SabreError[];
}

export interface SabreGetBookingRequest {
  confirmationId: string;
  bookingSource?: string;
  targetPcc?: string;
  returnOnly?: string[];
}

export interface SabreGetBookingResponse {
  timestamp?: string;
  bookingSignature?: string;
  bookingId?: string;
  booking?: SabreBooking;
  startDate?: string;
  endDate?: string;
  isCancelable?: boolean;
  isTicketed?: boolean;
  contactInfo?: SabreContactInfo;
  travelers?: SabreTraveler[];
  flights?: SabreFlight[];
  flightTickets?: SabreFlightTicket[];
  fares?: SabreFareInfo[];
  fareRules?: SabreFareRule[];
  creationDetails?: SabreCreationDetails;
  errors?: SabreError[];
}

export interface SabreBooking {
  bookingId?: string;
  startDate?: string;
  endDate?: string;
  isCancelable?: boolean;
  isTicketed?: boolean;
  contactInfo?: SabreContactInfo;
  travelers?: SabreTraveler[];
  flights?: SabreFlight[];
  flightTickets?: SabreFlightTicket[];
  fares?: SabreFareInfo[];
  fareRules?: SabreFareRule[];
  creationDetails?: SabreCreationDetails;
}

export interface SabreContactInfo {
  emails?: string[];
  phones?: string[];
}

export interface SabreTraveler {
  givenName?: string;
  middleName?: string;
  surname?: string;
  birthDate?: string;
  gender?: string;
  passengerCode?: string;
  identityDocuments?: Array<{
    documentNumber?: string;
    documentType?: string;
    expiryDate?: string;
    issuingCountryCode?: string;
    citizenshipCountryCode?: string;
  }>;
  nameAssociationId?: string;
}

export interface SabreFlight {
  itemId?: string;
  flightNumber: number;
  airlineCode: string;
  airlineName?: string;
  operatingFlightNumber?: number;
  operatingAirlineCode?: string;
  operatingAirlineName?: string;
  fromAirportCode: string;
  toAirportCode: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  bookingClass?: string;
  cabinType?: string;
  duration?: number;
  numberOfStops?: number;
  equipmentType?: string;
  confirmationId?: string;
  statusCode?: string;
}

export interface SabreFlightTicket {
  number?: string;
  date?: string;
  type?: string;
  status?: string;
  travelerIndex?: number;
  flightCoupons?: Array<{
    itemId?: string;
    couponNumber?: number;
    couponStatus?: string;
  }>;
}

export interface SabreFareInfo {
  baseFare?: { amount?: number; currency?: string };
  totalFare?: { amount?: number; currency?: string };
  totalTax?: { amount?: number; currency?: string };
  passengerCode?: string;
  lastDateToPurchase?: string;
}

export interface SabreFareRule {
  category?: string;
  isRefundable?: boolean;
  penalties?: Array<{
    type?: string;
    amount?: { amount?: number; currency?: string };
    applicability?: string;
  }>;
}

export interface SabreCreationDetails {
  creationDate?: string;
  creationTime?: string;
  purchaseDeadlineDate?: string;
  purchaseDeadlineTime?: string;
  agencyIataNumber?: string;
  userWorkPcc?: string;
}

export interface SabreError {
  category?: string;
  type?: string;
  description?: string;
  code?: string;
  message?: string;
}

// ============================================================
// CANCEL BOOKING
// ============================================================

export interface SabreCancelBookingRequest {
  confirmationId: string;
  cancelAll?: boolean;
  retrieveBooking?: boolean;
  receivedFrom?: string;
  targetPcc?: string;
  flightTicketOperation?: string;
}

export interface SabreCancelBookingResponse {
  timestamp?: string;
  booking?: SabreBooking;
  errors?: SabreError[];
  voidedTickets?: string[];
  refundedTickets?: string[];
}

// ============================================================
// FULFILL FLIGHT TICKETS
// ============================================================

export interface SabreFulfillTicketsRequest {
  confirmationId: string;
  fulfillments: SabreFulfillment[];
  formsOfPayment?: SabreFulfillFormOfPayment[];
  receivedFrom?: string;
  targetPcc?: string;
  acceptPriceChanges?: boolean;
  acceptNegotiatedFare?: boolean;
}

export interface SabreFulfillment {
  flightTicketType?: string;
  travelerIndices?: number[];
  flightIndices?: string[];
}

export interface SabreFulfillFormOfPayment {
  type: 'CASH' | 'CHECK' | 'PAYMENTCARD' | 'MISCELLANEOUS';
}

export interface SabreFulfillTicketsResponse {
  timestamp?: string;
  tickets?: SabreFulfillTicket[];
  errors?: SabreError[];
  warnings?: Array<{
    type?: string;
    description?: string;
  }>;
}

export interface SabreFulfillTicket {
  number?: string;
  date?: string;
  isCommitted?: boolean;
  type?: string;
}

// ============================================================
// AUTH
// ============================================================

export interface SabreAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}
