/**
 * HAIP Connect API wire types — raw request/response JSON shapes.
 *
 * These mirror the HAIP PMS Connect API at /api/v1/connect/*.
 * The adapter calls these endpoints and maps responses via mapper.ts.
 *
 * Source: HAIP v1.0.0 Connect API (Swagger at {baseUrl}/api/docs)
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export interface HaipAddress {
  line1: string;
  line2?: string;
  city: string;
  stateProvince?: string;
  postalCode?: string;
  countryCode: string;
}

export interface HaipCoordinates {
  latitude: number;
  longitude: number;
}

export interface HaipContact {
  phone?: string;
  email?: string;
  website?: string;
}

export interface HaipPhoto {
  url: string;
  caption?: string;
  width?: number;
  height?: number;
  category?: string;
}

// ---------------------------------------------------------------------------
// Search (POST /api/v1/connect/search)
// ---------------------------------------------------------------------------

export interface HaipSearchRequest {
  destination: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children?: number;
  currency?: string;
}

export interface HaipNightlyBreakdown {
  date: string;
  amount: string;
  currency: string;
}

export interface HaipCancellationPolicy {
  refundable: boolean;
  cancellationDeadline?: string;
  penaltyDescription?: string;
  penalties?: HaipPenalty[];
}

export interface HaipPenalty {
  hoursBeforeCheckin: number;
  penaltyType: 'percentage' | 'nights' | 'fixed';
  penaltyValue: number;
  penaltyCurrency?: string;
}

export interface HaipMandatoryFee {
  type: string;
  amount: string;
  currency: string;
  perUnit: 'per_night' | 'per_stay' | 'per_person' | 'per_person_per_night';
}

export interface HaipRate {
  rateId: string;
  roomTypeId: string;
  ratePlanName?: string;
  nightlyRate: string;
  totalRate: string;
  currency: string;
  rateType: string;
  paymentModel: string;
  cancellationPolicy: HaipCancellationPolicy;
  nightlyBreakdown?: HaipNightlyBreakdown[];
  mandatoryFees?: HaipMandatoryFee[];
  taxAmount?: string;
  mealPlan?: string;
}

export interface HaipRoomType {
  roomTypeId: string;
  code?: string;
  name: string;
  description?: string;
  maxOccupancy?: number;
  bedType?: string;
}

export interface HaipProperty {
  id: string;
  name: string;
  address: HaipAddress;
  coordinates: HaipCoordinates;
  chainCode?: string;
  chainName?: string;
  starRating?: number;
  amenities: string[];
  roomTypes: HaipRoomType[];
  rates: HaipRate[];
  photos: HaipPhoto[];
  description?: string;
  contactInfo?: HaipContact;
  /** Content completeness score 0-100 from HAIP */
  contentCompleteness?: number;
}

export interface HaipSearchResponse {
  properties: HaipProperty[];
  searchId?: string;
  totalResults: number;
}

// ---------------------------------------------------------------------------
// Property detail (GET /api/v1/connect/properties/:id)
// ---------------------------------------------------------------------------

export type HaipPropertyResponse = HaipProperty;

// ---------------------------------------------------------------------------
// Booking (POST /api/v1/connect/book)
// ---------------------------------------------------------------------------

export interface HaipGuestInfo {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  loyaltyNumber?: string;
  loyaltyProgram?: string;
}

export interface HaipBookRequest {
  propertyId: string;
  roomTypeId: string;
  rateId: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  guest: HaipGuestInfo;
  externalConfirmationCode?: string;
  specialRequests?: string;
}

export interface HaipBookResponse {
  confirmationNumber: string;
  externalConfirmationCode?: string;
  status: string;
  propertyId: string;
  propertyName: string;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  guest: HaipGuestInfo;
  totalAmount: string;
  currency: string;
  cancellationDeadline?: string;
  cancellationPolicy?: HaipCancellationPolicy;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Booking status / verify (GET /api/v1/connect/bookings/:confirmationNumber/verify)
// ---------------------------------------------------------------------------

export interface HaipVerification {
  rateMatch: boolean;
  roomMatch: boolean;
  datesMatch: boolean;
  guestMatch: boolean;
  allMatch: boolean;
}

export interface HaipBookingStatusResponse {
  confirmationNumber: string;
  externalConfirmationCode?: string;
  reservationStatus: string;
  propertyId: string;
  propertyName: string;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  guest: HaipGuestInfo;
  totalAmount: string;
  currency: string;
  cancellationDeadline?: string;
  verification?: HaipVerification;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Modify (PATCH /api/v1/connect/bookings/:confirmationNumber)
// ---------------------------------------------------------------------------

export interface HaipModifyRequest {
  checkIn?: string;
  checkOut?: string;
  rooms?: number;
  roomTypeId?: string;
  rateId?: string;
  guest?: Partial<HaipGuestInfo>;
  specialRequests?: string;
}

export interface HaipModifyResponse {
  confirmationNumber: string;
  externalConfirmationCode?: string;
  status: string;
  propertyId: string;
  propertyName: string;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  guest: HaipGuestInfo;
  totalAmount: string;
  currency: string;
  cancellationDeadline?: string;
  modifiedAt: string;
}

// ---------------------------------------------------------------------------
// Cancel (DELETE /api/v1/connect/bookings/:confirmationNumber)
// ---------------------------------------------------------------------------

export interface HaipCancelResponse {
  confirmationNumber: string;
  status: string;
  cancellationFee?: string;
  cancellationCurrency?: string;
  message?: string;
  cancelledAt: string;
}

// ---------------------------------------------------------------------------
// Health (GET /health)
// ---------------------------------------------------------------------------

export interface HaipHealthResponse {
  status: string;
  version?: string;
  uptime?: number;
}
