export { HotelbedsAdapter } from './hotelbeds-adapter.js';
export { MockHotelbedsAdapter } from './mock-hotelbeds-adapter.js';
export { hotelbedsCapabilities } from './capabilities.js';
export type { LodgingChannelCapability, LodgingChannelKind } from './capabilities.js';

export { signRequest, buildAuthHeaders } from './auth.js';
export type { HotelbedsCredentials } from './auth.js';

export {
  mapHotelToRawResult,
  mapCancellationPolicy,
  mapRate,
  mapBookingStatus,
  parseCategoryCodeStarRating,
  isRefundableRate,
  summarizeBooking,
  HOTELBEDS_SOURCE_ID,
  HOTELBEDS_CANCEL_FEE_MARKUP,
} from './field-mapper.js';
export type { BookingSummary, MapHotelOptions } from './field-mapper.js';

export type { HotelSearchParams, HotelSourceAdapter } from './lodging-source-interface.js';

export { HOTELBEDS_BASE_URLS } from './types.js';
export type {
  HotelbedsAdapterConfig,
  HotelbedsEnvironment,
  HotelbedsAvailabilityRequest,
  HotelbedsAvailabilityResponse,
  HotelbedsHotel,
  HotelbedsRoom,
  HotelbedsRate,
  HotelbedsCancellationPolicy,
  HotelbedsCheckRateRequest,
  HotelbedsCheckRateResponse,
  HotelbedsBookingRequest,
  HotelbedsBookingResponse,
  HotelbedsBooking,
  HotelbedsBookingListResponse,
  HotelbedsCancellationFlag,
  HotelbedsCancellationResponse,
  HotelbedsErrorResponse,
  HotelbedsOccupancy,
  HotelbedsPax,
  HotelbedsBookingPax,
  HotelbedsBookingRoom,
  HotelbedsPaymentData,
  HotelbedsTax,
  HotelbedsTaxes,
  HotelbedsRateBreakdown,
  HotelbedsPromotion,
  HotelbedsOffer,
  HotelbedsAuditData,
  HotelbedsVoucherEmail,
} from './types.js';
