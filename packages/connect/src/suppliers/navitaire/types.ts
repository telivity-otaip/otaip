/**
 * Navitaire raw API types — derived from the Digital API v4.7 OpenAPI spec.
 *
 * Only types needed by the ConnectAdapter methods are defined here.
 * These types mirror Navitaire's wire format; no normalization.
 */

// ============================================================
// AUTHENTICATION
// ============================================================

export interface NavitaireTokenRequest {
  domainCode: string;
  username: string;
  password: string;
}

export interface NavitaireTokenResponse {
  token: string;
  idleTimeoutInMinutes?: number;
  roleCode?: string;
}

// ============================================================
// AVAILABILITY SEARCH (v4)
// ============================================================

export interface AvailabilityRequestv3 {
  criteria: AvailabilityCriteria[];
  codes?: AvailabilityCodes;
  passengers: AvailabilityPassengerCriteria;
  currencyCode?: string;
}

export interface AvailabilityCriteria {
  originStationCode: string;
  destinationStationCode: string;
  beginDate: string; // ISO date YYYY-MM-DD
  endDate?: string;
  filters?: AvailabilityFilters;
}

export interface AvailabilityFilters {
  connectionType?: 'None' | 'Direct' | 'Through' | 'Online' | 'Interline';
  carrierCode?: string;
  maxConnections?: number;
  productClasses?: string[];
}

export interface AvailabilityCodes {
  currencyCode?: string;
  promotionCode?: string;
}

export interface AvailabilityPassengerCriteria {
  types: AvailabilityPassengerType[];
}

export interface AvailabilityPassengerType {
  type: string; // 'ADT', 'CHD', 'INF'
  count: number;
  dateOfBirth?: string;
}

export interface AvailabilityResponse {
  trips?: AvailabilityTrip[];
  currencyCode?: string;
  errors?: NavitaireError[];
}

export interface AvailabilityTrip {
  originStationCode: string;
  destinationStationCode: string;
  journeysAvailable?: AvailabilityJourney[];
  dates?: AvailabilityDate[];
}

export interface AvailabilityDate {
  date: string;
  journeys?: AvailabilityJourney[];
}

export interface AvailabilityJourney {
  journeyKey: string;
  designator: JourneyDesignator;
  segments: AvailabilitySegment[];
  fares?: AvailabilityFare[];
  stops: number;
  notForGeneralUser?: boolean;
}

export interface JourneyDesignator {
  origin: string;
  destination: string;
  departure: string; // ISO datetime
  arrival: string; // ISO datetime
}

export interface AvailabilitySegment {
  segmentKey: string;
  designator: SegmentDesignator;
  identifier: SegmentIdentifier;
  legs?: SegmentLeg[];
  cabinOfService?: string;
  externalIdentifier?: ExternalIdentifier;
  international?: boolean;
}

export interface SegmentDesignator {
  origin: string;
  destination: string;
  departure: string; // ISO datetime
  arrival: string; // ISO datetime
}

export interface SegmentIdentifier {
  identifier: string; // flight number
  carrierCode: string; // marketing carrier
  opSuffix?: string;
}

export interface ExternalIdentifier {
  identifier?: string; // operating flight number
  carrierCode?: string; // operating carrier
}

export interface SegmentLeg {
  legKey: string;
  operatingCarrier?: string;
  operatingFlightNumber?: string;
  equipmentType?: string;
  departureTime?: string;
  arrivalTime?: string;
  origin?: string;
  destination?: string;
}

export interface AvailabilityFare {
  fareKey?: string;
  fareAvailabilityKey: string;
  productClass: string;
  classOfService: string;
  classType?: string;
  fareStatus?: string;
  fareApplicationType?: string;
  passengerFares: PassengerFare[];
  travelClassCode?: string;
  ruleTariff?: string;
  ruleNumber?: string;
  isAllotmentMarketFare?: boolean;
  isSumOfSector?: boolean;
}

export interface PassengerFare {
  passengerType: string;
  fareAmount: number;
  fareDiscountCode?: string;
  serviceCharges?: ServiceCharge[];
}

export interface ServiceCharge {
  amount: number;
  code: string;
  type: string;
  currencyCode: string;
  ticketCode?: string;
  chargeType?: string;
  collectType?: string;
}

// ============================================================
// TRIP SELL (v4)
// ============================================================

export interface TripSellRequestv2 {
  journeyKey: string;
  fareAvailabilityKey: string;
  passengers?: TripSellPassenger[];
  currencyCode?: string;
}

export interface TripSellPassenger {
  passengerTypeCode: string;
}

export interface TripSellResponse {
  data?: BookingData;
  errors?: NavitaireError[];
}

// ============================================================
// BOOKING PRICE (v1)
// ============================================================

export interface BookingPriceRequest {
  currencyCode?: string;
  priceItinerary?: boolean;
}

export interface BookingPriceResponse {
  data?: BookingData;
  errors?: NavitaireError[];
}

// ============================================================
// PASSENGERS (v1)
// ============================================================

export interface AddPassengersRequest {
  [passengerKey: string]: PassengerRequest;
}

export interface PassengerRequest {
  name: PassengerName;
  passengerTypeCode?: string;
  info?: PassengerInfo;
}

export interface PassengerName {
  first: string;
  last: string;
  middle?: string;
  title?: string;
  suffix?: string;
}

export interface PassengerInfo {
  dateOfBirth?: string;
  gender?: 'Male' | 'Female' | 'Unspecified';
  nationality?: string;
  residentCountry?: string;
}

// ============================================================
// CONTACT (v1)
// ============================================================

export interface PrimaryContactRequest {
  name: PassengerName;
  emailAddress?: string;
  phoneNumbers?: ContactPhoneNumber[];
  address?: ContactAddress;
}

export interface ContactPhoneNumber {
  type: string;
  number: string;
}

export interface ContactAddress {
  lineOne?: string;
  lineTwo?: string;
  city?: string;
  provinceState?: string;
  postalCode?: string;
  countryCode?: string;
}

// ============================================================
// PAYMENT (v5)
// ============================================================

export interface AddPaymentRequest {
  paymentMethodCode: string;
  amount: number;
  currencyCode: string;
  paymentFields?: Record<string, string>;
  installments?: number;
}

// ============================================================
// BOOKING COMMIT (v3)
// ============================================================

export interface BookingCommitRequest {
  comments?: BookingComment[];
  restrictionOverride?: boolean;
}

export interface BookingComment {
  type: string;
  text: string;
}

export interface BookingCommitResponse {
  data?: BookingCommitData;
  errors?: NavitaireError[];
}

export interface BookingCommitData {
  recordLocator?: string;
  bookingKey?: string;
  booking?: BookingData;
}

// ============================================================
// BOOKING DATA (shared response shape)
// ============================================================

export interface BookingData {
  recordLocator?: string;
  bookingKey?: string;
  locators?: BookingLocators;
  info?: BookingInfo;
  journeys?: BookingJourney[];
  passengers?: Record<string, BookingPassenger>;
  contacts?: Record<string, BookingContact>;
  payments?: BookingPayment[];
  breakdown?: BookingBreakdown;
  typeOfSale?: TypeOfSale;
}

export interface BookingLocators {
  recordLocators?: RecordLocator[];
  numericRecordLocator?: string;
}

export interface RecordLocator {
  owningSystemCode?: string;
  recordCode?: string;
  interactionPurpose?: string;
}

export interface BookingInfo {
  status?: number;
  paidStatus?: number;
  bookedDate?: string;
  createdDate?: string;
  modifiedDate?: string;
  currencyCode?: string;
  systemCode?: string;
}

export interface BookingJourney {
  journeyKey: string;
  designator: JourneyDesignator;
  segments: BookingSegment[];
  stops: number;
  notForGeneralUser?: boolean;
  flightType?: string;
  move?: JourneyMove;
}

export interface JourneyMove {
  status?: string;
  dateUtc?: string;
}

export interface BookingSegment {
  segmentKey: string;
  designator: SegmentDesignator;
  identifier: SegmentIdentifier;
  passengerSegment?: Record<string, PassengerSegmentInfo>;
  legs?: BookingLeg[];
  externalIdentifier?: ExternalIdentifier;
  cabinOfService?: string;
  international?: boolean;
  isChangeOfGauge?: boolean;
  fares?: BookingSegmentFare[];
}

export interface PassengerSegmentInfo {
  seats?: SeatInfo[];
  ssrs?: SsrInfo[];
  tickets?: TicketInfo[];
  boardingSequence?: string;
  liftStatus?: string;
}

export interface SeatInfo {
  unitKey?: string;
  unitDesignator?: string;
}

export interface SsrInfo {
  ssrKey?: string;
  ssrCode?: string;
  ssrNumber?: number;
}

export interface TicketInfo {
  ticketNumber?: string;
  ticketIndicator?: string;
}

export interface BookingLeg {
  legKey: string;
  operatingCarrier?: string;
  operatingFlightNumber?: string;
  equipmentType?: string;
  designator?: SegmentDesignator;
}

export interface BookingSegmentFare {
  fareKey?: string;
  classOfService?: string;
  classType?: string;
  productClass?: string;
  fareBasisCode?: string;
  passengerFares?: Record<string, BookingPassengerFare>;
}

export interface BookingPassengerFare {
  fareAmount?: number;
  fareDiscountCode?: string;
  serviceCharges?: ServiceCharge[];
}

export interface BookingPassenger {
  passengerKey: string;
  passengerTypeCode?: string;
  name?: PassengerName;
  info?: PassengerInfo;
  travelDocuments?: TravelDocument[];
  passengerAlternateKey?: string;
}

export interface TravelDocument {
  documentTypeCode?: string;
  number?: string;
  issuedByCode?: string;
  expirationDate?: string;
  nationality?: string;
  gender?: 'Male' | 'Female' | 'Unspecified';
  name?: PassengerName;
  dateOfBirth?: string;
}

export interface BookingContact {
  name?: PassengerName;
  emailAddress?: string;
  phoneNumbers?: ContactPhoneNumber[];
  address?: ContactAddress;
}

export interface BookingPayment {
  paymentKey?: string;
  code?: string;
  approvalDate?: string;
  status?: number;
  amount?: number;
  currencyCode?: string;
  paymentFields?: Record<string, string>;
  authorizationCode?: string;
  authorizationStatus?: number;
}

export interface BookingBreakdown {
  balanceDue?: number;
  totalAmount?: number;
  totalToCollect?: number;
  totalCharged?: number;
  passengerTotals?: Record<string, PassengerTotalBreakdown>;
  journeyTotals?: JourneyTotalBreakdown[];
}

export interface PassengerTotalBreakdown {
  services?: BreakdownServices;
}

export interface BreakdownServices {
  total?: number;
  taxes?: number;
  charges?: number;
}

export interface JourneyTotalBreakdown {
  totalAmount?: number;
  totalTax?: number;
}

export interface TypeOfSale {
  promotionCode?: string;
  fareTypes?: string[];
}

// ============================================================
// E-TICKETS
// ============================================================

export interface ETicketValidationResponse {
  valid?: boolean;
  validationMessages?: ETicketValidationMessage[];
  errors?: NavitaireError[];
}

export interface ETicketValidationMessage {
  code?: string;
  message?: string;
  severity?: string;
}

export interface ETicketIssueResponse {
  data?: {
    confirmationNumber?: string;
    tickets?: ETicketResult[];
  };
  errors?: NavitaireError[];
}

export interface ETicketResult {
  ticketNumber?: string;
  passengerKey?: string;
  journeyKey?: string;
  status?: string;
}

// ============================================================
// BOOKING RETRIEVE
// ============================================================

export interface BookingRetrieveResponse {
  data?: BookingData;
  errors?: NavitaireError[];
}

// ============================================================
// ERRORS
// ============================================================

export interface NavitaireError {
  code?: string;
  message?: string;
  type?: string;
  details?: NavitaireErrorDetails;
}

export interface NavitaireErrorDetails {
  errorNumber?: string;
  sessionException?: string;
  fieldName?: string;
}

// ============================================================
// HEALTH
// ============================================================

export interface NavitaireHealthResponse {
  status?: string;
  version?: string;
}
