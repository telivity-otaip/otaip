export type PricingSource = 'GDS' | 'NDC' | 'DIRECT';
export type OfferStatus = 'ACTIVE' | 'EXPIRED' | 'USED';
export type OfferOperation =
  | 'buildOffer'
  | 'getOffer'
  | 'validateOffer'
  | 'markUsed'
  | 'expireOffer'
  | 'cleanExpired';

export interface FlightSegment {
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureDate: string;
  cabin: string;
}
export interface TaxItem {
  code: string;
  amount: string;
  currency: string;
}
export interface AncillaryItem {
  ancillaryId: string;
  amount: string;
  currency: string;
  description: string;
}
export interface FareInfo {
  basis: string;
  cabin: string;
  nuc: string;
  roe: string;
  baseAmount: string;
  currency: string;
}

export interface Offer {
  offerId: string;
  segments: FlightSegment[];
  fare: { basis: string; cabin: string; baseAmount: string; currency: string };
  taxes: TaxItem[];
  ancillaries: AncillaryItem[];
  subtotal: string;
  ancillaryTotal: string;
  totalAmount: string;
  currency: string;
  passengerCount: number;
  perPassengerTotal: string;
  pricingSource: PricingSource;
  createdAt: string;
  expiresAt: string;
  status: OfferStatus;
}

export interface BuildOfferInput {
  segments: FlightSegment[];
  fare: FareInfo;
  taxes: TaxItem[];
  ancillaries?: AncillaryItem[];
  passengerCount: number;
  pricingSource: PricingSource;
  ttlMinutes?: number;
}

export interface OfferBuilderInput {
  operation: OfferOperation;
  buildInput?: BuildOfferInput;
  offerId?: string;
  currentTime?: string;
}
export interface OfferBuilderOutput {
  offer?: Offer;
  valid?: boolean;
  reason?: string;
  cleanedCount?: number;
  message?: string;
}
