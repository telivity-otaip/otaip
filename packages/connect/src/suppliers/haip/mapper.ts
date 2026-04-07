/**
 * HAIP Connect API <-> OTAIP hotel type mappers.
 *
 * Maps HAIP wire types to OTAIP-compatible hotel result types.
 * All money uses decimal.js — never raw floating-point assignment.
 *
 * Output types are structurally compatible with hotel-common.ts types
 * from @otaip/agents-lodging (TypeScript structural typing).
 */

import Decimal from 'decimal.js';
import type {
  HaipBookResponse,
  HaipBookingStatusResponse,
  HaipCancelResponse,
  HaipCancellationPolicy,
  HaipMandatoryFee,
  HaipModifyResponse,
  HaipPenalty,
  HaipProperty,
  HaipRate,
  HaipSearchResponse,
} from './types.js';

// ---------------------------------------------------------------------------
// OTAIP-compatible output types (structurally matches hotel-common.ts)
// ---------------------------------------------------------------------------

export interface HaipHotelSource {
  sourceId: string;
  sourcePropertyId: string;
  responseLatencyMs?: number;
  qualityScore?: number;
}

export interface HaipHotelAddress {
  line1: string;
  line2?: string;
  city: string;
  stateProvince?: string;
  postalCode?: string;
  countryCode: string;
}

export interface HaipGeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface HaipHotelContact {
  phone?: string;
  email?: string;
  website?: string;
}

export interface HaipHotelPhoto {
  url: string;
  caption?: string;
  width?: number;
  height?: number;
  category?: string;
}

export interface HaipRawRoomType {
  roomTypeId: string;
  code?: string;
  description: string;
  maxOccupancy?: number;
  bedTypeRaw?: string;
}

export interface HaipNightlyBreakdownEntry {
  date: string;
  amount: string;
  currency: string;
}

export interface HaipCancellationDeadline {
  hoursBeforeCheckin: number;
  penaltyType: 'percentage' | 'nights' | 'fixed';
  penaltyValue: number;
  penaltyCurrency?: string;
}

export interface HaipMappedCancellationPolicy {
  refundable: boolean;
  deadlines: HaipCancellationDeadline[];
  freeCancel24hrBooking: boolean;
}

export interface HaipMappedMandatoryFee {
  type: string;
  amount: string;
  currency: string;
  perUnit: 'per_night' | 'per_stay' | 'per_person' | 'per_person_per_night';
}

export type HaipPaymentModel = 'prepaid' | 'pay_at_property' | 'virtual_card';
export type HaipRateType =
  | 'bar'
  | 'corporate'
  | 'consortium'
  | 'opaque'
  | 'package'
  | 'government'
  | 'aaa'
  | 'member';

export interface HaipRawRate {
  rateId: string;
  roomTypeId: string;
  nightlyRate: string;
  totalRate: string;
  currency: string;
  rateType: HaipRateType;
  paymentModel: HaipPaymentModel;
  cancellationPolicy: HaipMappedCancellationPolicy;
  mealPlan?: string;
  mandatoryFees?: HaipMappedMandatoryFee[];
  taxAmount?: string;
  nightlyBreakdown?: HaipNightlyBreakdownEntry[];
}

/** Structurally compatible with RawHotelResult from hotel-common.ts */
export interface HaipHotelResult {
  source: HaipHotelSource;
  propertyName: string;
  address: HaipHotelAddress;
  coordinates: HaipGeoCoordinates;
  chainCode?: string;
  chainName?: string;
  starRating?: number;
  amenities: string[];
  roomTypes: HaipRawRoomType[];
  rates: HaipRawRate[];
  photos: HaipHotelPhoto[];
  description?: string;
  contactInfo?: HaipHotelContact;
}

/** 3-layer hotel confirmation */
export interface HaipConfirmation {
  crsConfirmation: string;
  pmsConfirmation?: string;
  channelConfirmation?: string;
  source: HaipHotelSource;
}

export interface HaipBookingResult {
  confirmation: HaipConfirmation;
  status: string;
  propertyId: string;
  propertyName: string;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  totalAmount: string;
  currency: string;
  freeCancellationUntil?: string;
  createdAt: string;
}

export interface HaipVerificationResult {
  confirmationNumber: string;
  status: string;
  rateVerified: boolean;
  roomVerified: boolean;
  datesVerified: boolean;
  guestVerified: boolean;
  syncStatus: 'IN_SYNC' | 'MISMATCH';
  totalAmount: string;
  currency: string;
  updatedAt: string;
}

export interface HaipModificationResult {
  confirmation: HaipConfirmation;
  status: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  totalAmount: string;
  currency: string;
  modifiedAt: string;
}

export interface HaipCancellationResult {
  confirmationNumber: string;
  status: string;
  cancellationFee?: string;
  cancellationCurrency?: string;
  message?: string;
  cancelledAt: string;
}

// ---------------------------------------------------------------------------
// Type maps
// ---------------------------------------------------------------------------

const VALID_RATE_TYPES = new Set<HaipRateType>([
  'bar',
  'corporate',
  'consortium',
  'opaque',
  'package',
  'government',
  'aaa',
  'member',
]);

const VALID_PAYMENT_MODELS = new Set<HaipPaymentModel>([
  'prepaid',
  'pay_at_property',
  'virtual_card',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toDecimalString(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '0';
  return new Decimal(value).toString();
}

function mapRateType(raw: string): HaipRateType {
  const lower = raw.toLowerCase();
  return VALID_RATE_TYPES.has(lower as HaipRateType) ? (lower as HaipRateType) : 'bar';
}

function mapPaymentModel(raw: string): HaipPaymentModel {
  const lower = raw.toLowerCase().replace(/[\s-]/g, '_');
  return VALID_PAYMENT_MODELS.has(lower as HaipPaymentModel)
    ? (lower as HaipPaymentModel)
    : 'pay_at_property';
}

function mapCancellationPolicy(raw: HaipCancellationPolicy): HaipMappedCancellationPolicy {
  const deadlines: HaipCancellationDeadline[] = (raw.penalties ?? []).map((p: HaipPenalty) => ({
    hoursBeforeCheckin: p.hoursBeforeCheckin,
    penaltyType: p.penaltyType,
    penaltyValue: p.penaltyValue,
    penaltyCurrency: p.penaltyCurrency,
  }));

  return {
    refundable: raw.refundable,
    deadlines,
    freeCancel24hrBooking: raw.refundable,
  };
}

function mapMandatoryFees(fees?: HaipMandatoryFee[]): HaipMappedMandatoryFee[] | undefined {
  if (!fees || fees.length === 0) return undefined;
  return fees.map((f) => ({
    type: f.type,
    amount: toDecimalString(f.amount),
    currency: f.currency,
    perUnit: f.perUnit,
  }));
}

function mapRate(raw: HaipRate): HaipRawRate {
  const result: HaipRawRate = {
    rateId: raw.rateId,
    roomTypeId: raw.roomTypeId,
    nightlyRate: toDecimalString(raw.nightlyRate),
    totalRate: toDecimalString(raw.totalRate),
    currency: raw.currency,
    rateType: mapRateType(raw.rateType),
    paymentModel: mapPaymentModel(raw.paymentModel),
    cancellationPolicy: mapCancellationPolicy(raw.cancellationPolicy),
    mealPlan: raw.mealPlan,
    mandatoryFees: mapMandatoryFees(raw.mandatoryFees),
    taxAmount: raw.taxAmount ? toDecimalString(raw.taxAmount) : undefined,
  };

  if (raw.nightlyBreakdown && raw.nightlyBreakdown.length > 0) {
    result.nightlyBreakdown = raw.nightlyBreakdown.map((nb) => ({
      date: nb.date,
      amount: toDecimalString(nb.amount),
      currency: nb.currency,
    }));
  }

  return result;
}

function mapProperty(prop: HaipProperty): HaipHotelResult {
  return {
    source: {
      sourceId: 'haip',
      sourcePropertyId: prop.id,
      qualityScore: prop.contentCompleteness,
    },
    propertyName: prop.name,
    address: {
      line1: prop.address.line1,
      line2: prop.address.line2,
      city: prop.address.city,
      stateProvince: prop.address.stateProvince,
      postalCode: prop.address.postalCode,
      countryCode: prop.address.countryCode,
    },
    coordinates: {
      latitude: prop.coordinates.latitude,
      longitude: prop.coordinates.longitude,
    },
    chainCode: prop.chainCode,
    chainName: prop.chainName,
    starRating: prop.starRating,
    amenities: prop.amenities ?? [],
    roomTypes: (prop.roomTypes ?? []).map((rt) => ({
      roomTypeId: rt.roomTypeId,
      code: rt.code,
      description: rt.name || rt.description || '',
      maxOccupancy: rt.maxOccupancy,
      bedTypeRaw: rt.bedType,
    })),
    rates: (prop.rates ?? []).map(mapRate),
    photos: (prop.photos ?? []).map((p) => ({
      url: p.url,
      caption: p.caption,
      width: p.width,
      height: p.height,
      category: p.category,
    })),
    description: prop.description,
    contactInfo: prop.contactInfo
      ? {
          phone: prop.contactInfo.phone,
          email: prop.contactInfo.email,
          website: prop.contactInfo.website,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Public mapping functions
// ---------------------------------------------------------------------------

export function mapSearchResults(response: HaipSearchResponse): HaipHotelResult[] {
  return (response.properties ?? []).map(mapProperty);
}

export function mapPropertyDetail(response: HaipProperty): HaipHotelResult {
  return mapProperty(response);
}

export function mapBookingResponse(
  response: HaipBookResponse,
  externalRef?: string,
): HaipBookingResult {
  return {
    confirmation: {
      crsConfirmation: response.confirmationNumber,
      pmsConfirmation: response.confirmationNumber,
      channelConfirmation: response.externalConfirmationCode ?? externalRef,
      source: {
        sourceId: 'haip',
        sourcePropertyId: response.propertyId,
      },
    },
    status: response.status,
    propertyId: response.propertyId,
    propertyName: response.propertyName,
    roomTypeName: response.roomTypeName,
    checkIn: response.checkIn,
    checkOut: response.checkOut,
    rooms: response.rooms,
    totalAmount: toDecimalString(response.totalAmount),
    currency: response.currency,
    freeCancellationUntil: response.cancellationDeadline,
    createdAt: response.createdAt,
  };
}

export function mapVerifyResponse(
  response: HaipBookingStatusResponse,
): HaipVerificationResult {
  const v = response.verification;
  const allMatch = v?.allMatch ?? false;

  return {
    confirmationNumber: response.confirmationNumber,
    status: response.reservationStatus,
    rateVerified: v?.rateMatch ?? false,
    roomVerified: v?.roomMatch ?? false,
    datesVerified: v?.datesMatch ?? false,
    guestVerified: v?.guestMatch ?? false,
    syncStatus: allMatch ? 'IN_SYNC' : 'MISMATCH',
    totalAmount: toDecimalString(response.totalAmount),
    currency: response.currency,
    updatedAt: response.updatedAt,
  };
}

export function mapModifyResponse(response: HaipModifyResponse): HaipModificationResult {
  return {
    confirmation: {
      crsConfirmation: response.confirmationNumber,
      pmsConfirmation: response.confirmationNumber,
      channelConfirmation: response.externalConfirmationCode,
      source: {
        sourceId: 'haip',
        sourcePropertyId: response.propertyId,
      },
    },
    status: response.status,
    propertyName: response.propertyName,
    checkIn: response.checkIn,
    checkOut: response.checkOut,
    rooms: response.rooms,
    totalAmount: toDecimalString(response.totalAmount),
    currency: response.currency,
    modifiedAt: response.modifiedAt,
  };
}

export function mapCancelResponse(response: HaipCancelResponse): HaipCancellationResult {
  return {
    confirmationNumber: response.confirmationNumber,
    status: response.status,
    cancellationFee: response.cancellationFee
      ? toDecimalString(response.cancellationFee)
      : undefined,
    cancellationCurrency: response.cancellationCurrency,
    message: response.message,
    cancelledAt: response.cancelledAt,
  };
}
