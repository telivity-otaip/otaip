export type AncillaryCategory = 'BAGGAGE' | 'SEAT' | 'MEAL' | 'LOUNGE' | 'WIFI' | 'PRIORITY' | 'OTHER';
export type RficCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';
export type PassengerType = 'ADT' | 'CHD' | 'INF';

export interface AncillarySegment { origin: string; destination: string; flightNumber: string; departureDate: string; carrier: string; }
export interface AncillaryPassenger { type: PassengerType; passengerRef: string; }
export interface AncillaryPrice { amount: string; currency: string; perPassenger: boolean; perSegment: boolean; }
export interface AncillaryOffer { ancillaryId: string; category: AncillaryCategory; rfic: RficCode; rfisc?: string; description: string; segmentRefs: string[]; passengerRefs: string[]; price: AncillaryPrice; conditions: string; available: boolean; }

export interface AncillaryShoppingInput { segments: AncillarySegment[]; passengers: AncillaryPassenger[]; pnrRef?: string; requestedCategories?: AncillaryCategory[]; }
export interface AncillaryShoppingOutput { ancillaries: AncillaryOffer[]; notSupportedByAdapter: boolean; currency: string; }
