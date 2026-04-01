/**
 * TripPro/Mondee raw API request and response types.
 * These mirror the exact shapes TripPro sends/receives — no normalization.
 */

export interface TripProSearchRequest {
  OtherInfo: {
    RequestedIP: string;
    TransactionId: string;
  };
  CurrencyInfo: {
    CurrencyCode: string;
  };
  PaxDetails: {
    NoOfAdults: { count: number };
    NoOfChildren?: { count: number; age: number };
    NoOfInfants?: { count: number; age: number };
  };
  OriginDestination: Array<{
    DepartureTime: string;
    DepartureLocationCode: string;
    ArrivalLocationCode: string;
    CabinClass: string;
    PreferredAirlines?: string;
  }>;
  Incremental: boolean;
}

export interface TripProItinerary {
  ItineraryId: string;
  ValidatingCarrierCode: string;
  ValidatingCarrierName: string;
  FareType: string;
  CabinClass: string;
  Citypairs: Array<{
    Duration: string;
    NoOfStops: number;
    FlightSegment: Array<{
      DepartureLocationCode: string;
      ArrivalLocationCode: string;
      MarketingAirline: string;
      FlightNumber: number;
      DepartureDateTime: string;
      ArrivalDateTime: string;
      Duration: string;
      BookingClass: string;
      CabinClass: string;
      AirEquipmentType: string;
      FareBasisCode: string;
      BaggageAllowance: string;
      IntermediateStops: unknown[];
    }>;
  }>;
  Fares: TripProFare[];
}

export interface TripProFare {
  CurrencyCode: string;
  BaseFare: number;
  Taxes: number;
  CCFee: number;
  FullFare: number;
  PaxType: string;
  FareType: string;
  IsNonRefundableFare: boolean;
  ExchangePenalties: unknown;
  RefundPenalties: unknown;
}

export interface TripProRepriceRequest {
  ItineraryId: string;
  AdultPaxCount: number;
  ChildPaxCount: number;
  InfantPaxCount: number;
}

export interface TripProBookRequest {
  ItineraryId: string;
  BookItineraryPaxDetail: Array<{
    PaxType: string;
    Gender: string;
    UserTitle: string;
    FirstName: string;
    MiddleName: string;
    LastName: string;
    DateOfBirth: string;
    PassportNumber: string;
    CountryOfIssue: string;
    Nationality: string;
    PassportIssueDate: string;
    PassportExpiryDate: string;
  }>;
  BookItineraryPaxContactInfo: {
    PhoneNumber: string;
    AlternatePhoneNumber: string;
    Email: string;
  };
  BookItineraryPaymentDetail: {
    PaymentType: string;
    BookItineraryCCDetails: Record<string, unknown>;
    BookItineraryBillingAddress: Record<string, unknown>;
  };
}

export interface TripProBookResponse {
  errorsList: {
    empty: boolean;
    tperror?: Array<{
      errorCode: string;
      errorType: string;
      errorText: string;
      errorDetail: { severity: string };
    }>;
  };
  PNR: string | null;
  ReferenceNumber: string | null;
}

export interface TripProSearchResponse {
  Results: TripProItinerary[];
}

export interface TripProRepriceResponse {
  Results: TripProItinerary[];
}
