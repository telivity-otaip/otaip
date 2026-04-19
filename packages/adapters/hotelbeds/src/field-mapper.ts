/**
 * Field mapping: Hotelbeds APItude wire types → OTAIP canonical lodging types.
 *
 * The mapper is intentionally pure: every function takes Hotelbeds JSON and
 * returns OTAIP types. No I/O, no side effects.
 *
 * Where Hotelbeds field semantics depend on a domain decision the OTAIP
 * lodging knowledge base hasn't resolved, the mapper records the
 * unanswered question with `// TODO: DOMAIN_QUESTION:` rather than
 * inventing behavior. The receiving agent is responsible for either
 * asking the right party or wiring up a follow-up before relying on the
 * field downstream.
 */

import Decimal from 'decimal.js';
import type {
  CancellationDeadline,
  CancellationPolicy,
  GeoCoordinates,
  HotelAddress,
  HotelBookingStatus,
  HotelSource,
  MandatoryFee,
  MonetaryAmount,
  PaymentModel,
  RawHotelResult,
  RawRate,
  RawRoomType,
} from '@otaip/agents-lodging';

import type {
  HotelbedsBooking,
  HotelbedsCancellationPolicy,
  HotelbedsHotel,
  HotelbedsRate,
  HotelbedsRoom,
} from './types.js';

export const HOTELBEDS_SOURCE_ID = 'hotelbeds';

/**
 * Platform markup applied to bedbank cancellation `amount` to derive the
 * traveler-facing cancel fee. Hotelbeds returns a NET (cost-to-us) penalty;
 * the traveler sees this multiplied. The net value is preserved on
 * `CancellationDeadline.netPenaltyValue` so settlement can reconcile margin.
 *
 * Decision recorded in DQ13 from the lodging product owner. This constant
 * is exported so callers can read it for explainability — do not redefine
 * it elsewhere; change the source of truth here if the markup ever moves.
 */
export const HOTELBEDS_CANCEL_FEE_MARKUP = 1.25;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Hotelbeds returns category codes like "3EST", "4LUJ", "5LUX". The leading
 * digit IS the star rating in the cases we've seen, but the suffix encodes
 * tier metadata (EST = standard, LUJ = luxury) we don't have a canonical
 * mapping for yet.
 *
 * TODO: DOMAIN_QUESTION: do we keep the suffix tier (EST/LUJ/LUX) anywhere?
 * For now the leading digit is exposed as `starRating` and the suffix is
 * dropped. Confirm with the Lodging KB before relying on this for filtering.
 */
export function parseCategoryCodeStarRating(categoryCode: string | undefined): number | undefined {
  if (!categoryCode) return undefined;
  const match = /^(\d)/.exec(categoryCode);
  if (!match) return undefined;
  const stars = parseInt(match[1] ?? '', 10);
  return Number.isFinite(stars) ? stars : undefined;
}

/** Hotelbeds latitude/longitude are stringified decimals. Coerce safely. */
function parseCoordinates(hotel: HotelbedsHotel): GeoCoordinates {
  const lat = hotel.latitude ? Number(hotel.latitude) : NaN;
  const lon = hotel.longitude ? Number(hotel.longitude) : NaN;
  return {
    latitude: Number.isFinite(lat) ? lat : 0,
    longitude: Number.isFinite(lon) ? lon : 0,
  };
}

/**
 * Hotelbeds returns address as either a free-text string OR an object with
 * a `content` field. There's no separate street/number breakdown for many
 * hotels — `line1` ends up being whatever Hotelbeds gave us.
 */
function parseAddress(hotel: HotelbedsHotel): HotelAddress {
  const rawAddress = hotel.address;
  let line1 = '';
  if (typeof rawAddress === 'string') {
    line1 = rawAddress;
  } else if (rawAddress && typeof rawAddress === 'object') {
    line1 = rawAddress.content ?? [rawAddress.street, rawAddress.number].filter(Boolean).join(' ');
  }

  const cityValue = typeof hotel.city === 'string' ? hotel.city : (hotel.city?.content ?? '');

  // Hotelbeds country is a 3-letter ISO 3166-1 alpha-3 sometimes, alpha-2 elsewhere.
  // TODO: DOMAIN_QUESTION: confirm whether downstream agents normalize this or
  // expect alpha-2. For now we pass it through and let the dedup agent normalize.
  const country = (hotel.countryCode ?? '').toUpperCase();

  return {
    line1: line1.trim(),
    city: cityValue.trim(),
    ...(hotel.stateCode ? { stateProvince: hotel.stateCode } : {}),
    ...(hotel.postalCode ? { postalCode: hotel.postalCode } : {}),
    countryCode: country,
  };
}

/**
 * Map Hotelbeds rateType + paymentType → OTAIP PaymentModel.
 *
 * Hotelbeds:
 *   paymentType "AT_HOTEL" — guest pays property at checkout (post-pay).
 *   paymentType "AT_WEB"   — guest pays at booking via the booking channel.
 *
 * OTAIP: prepaid | pay_at_property | virtual_card. VCN issuance is a
 * settlement-layer concern, not a Hotelbeds attribute, so we never emit
 * `virtual_card` from this mapper.
 */
function paymentModelFromRate(rate: HotelbedsRate): PaymentModel {
  if (rate.paymentType === 'AT_HOTEL') return 'pay_at_property';
  return 'prepaid';
}

/**
 * Convert a Hotelbeds cancellation-policies array into OTAIP
 * CancellationPolicy. Hotelbeds gives `{ amount, from }` pairs in absolute
 * datetime; OTAIP wants `hoursBeforeCheckin` so we need the check-in date
 * to translate.
 *
 * `freeCancel24hrBooking` is the California 24-hour rule — that's a
 * jurisdictional matter, not something Hotelbeds signals, so we leave it
 * `false` here. The hotel-modification agent applies the rule based on the
 * property's address.
 *
 * Per DQ13: Hotelbeds' `amount` is NET (the bedbank's charge to us). The
 * traveler-facing penalty is marked up by `HOTELBEDS_CANCEL_FEE_MARKUP`
 * and stored on `penaltyValue`; the original net is preserved on
 * `netPenaltyValue` so settlement and reporting can reconcile margin.
 */
export function mapCancellationPolicy(
  policies: HotelbedsCancellationPolicy[] | undefined,
  checkInIso: string,
  rateCurrency: string,
): CancellationPolicy {
  if (!policies || policies.length === 0) {
    return { refundable: false, deadlines: [], freeCancel24hrBooking: false };
  }

  const checkInMs = Date.parse(checkInIso);
  const deadlines: CancellationDeadline[] = policies.map((p) => {
    const fromMs = Date.parse(p.from);
    const hoursBeforeCheckin =
      Number.isFinite(checkInMs) && Number.isFinite(fromMs)
        ? Math.max(0, Math.round((checkInMs - fromMs) / (1000 * 60 * 60)))
        : 0;
    const net = new Decimal(p.amount);
    const gross = net.times(HOTELBEDS_CANCEL_FEE_MARKUP);
    return {
      hoursBeforeCheckin,
      penaltyType: 'fixed',
      penaltyValue: Number(gross.toFixed(2)),
      netPenaltyValue: Number(net.toFixed(2)),
      penaltyCurrency: rateCurrency,
    };
  });

  return {
    refundable: true,
    deadlines,
    freeCancel24hrBooking: false,
  };
}

/**
 * Hotelbeds `rateClass` is documented as NOR (normal/refundable) vs NRF
 * (non-refundable). Other values (e.g. STD, SPE) appear in practice; treat
 * anything not explicitly NRF as refundable IF the rate also carries
 * cancellation policies. A non-refundable rate has no recoverable amount.
 */
export function isRefundableRate(rate: HotelbedsRate): boolean {
  if (rate.rateClass === 'NRF') return false;
  return Boolean(rate.cancellationPolicies && rate.cancellationPolicies.length > 0);
}

/**
 * Compute the OTAIP RawRate from a Hotelbeds rate.
 *
 * Pricing semantics per the integration handoff:
 *   - Hotelbeds `net` is the FINAL bedbank cost to us (supplements and
 *     discounts already applied). It is our cost basis, not the customer
 *     selling price.
 *   - The customer-facing markup is set elsewhere (rate-comparison agent or
 *     the OTA layer); this adapter does NOT invent a markup.
 *
 * `nightlyRate` is `net / nights` — Hotelbeds itself does not return a
 * per-night breakdown on the rate object (it's at the daily-rate breakdown
 * level when `dailyRate=true`).
 */
export function mapRate(
  rate: HotelbedsRate,
  roomCode: string,
  hotelCurrency: string,
  checkInIso: string,
  checkOutIso: string,
): RawRate {
  const currency = rate.hotelCurrency ?? hotelCurrency;
  const nights = computeNights(checkInIso, checkOutIso);

  const refundable = isRefundableRate(rate);
  const cancellationPolicy = refundable
    ? mapCancellationPolicy(rate.cancellationPolicies, checkInIso, currency)
    : ({ refundable: false, deadlines: [], freeCancel24hrBooking: false } as CancellationPolicy);

  // Per DQ10: keep raw boardCode (RO/BB/HB/FB/AI). The UI layer maps to
  // display text. boardName falls back only if Hotelbeds omits the code.
  const mealPlan = rate.boardCode ?? rate.boardName;

  // Per DQ11: when `taxes.allIncluded === false`, the un-included taxes
  // and resort fees are mandatory charges the traveler MUST pay. We:
  //   1) keep the structured breakdown on `mandatoryFees` for transparency
  //   2) fold same-currency fees into `totalRate` / `nightlyRate` so the
  //      top-level price is the actual amount the traveler owes
  // Markup (platform margin) is applied downstream by the rate-comparison
  // agent — adapters don't set retail price. See `capabilities.setsRetailPrice`.
  const mandatoryFees: MandatoryFee[] = [];
  let foldedFeeTotal = new Decimal(0);
  if (rate.taxes && rate.taxes.allIncluded === false) {
    for (const tax of rate.taxes.taxes ?? []) {
      if (tax.included) continue;
      const amount = tax.amount ?? tax.clientAmount;
      const feeCurrency = tax.currency ?? tax.clientCurrency ?? currency;
      if (!amount) continue;
      mandatoryFees.push({
        type: tax.type ?? 'tax',
        amount,
        currency: feeCurrency,
        perUnit: 'per_stay',
      });
      // Only fold same-currency fees. Cross-currency fees stay in the
      // breakdown only — folding would require an FX rate the adapter
      // doesn't have.
      if (feeCurrency === currency) {
        foldedFeeTotal = foldedFeeTotal.plus(new Decimal(amount));
      }
    }
  }

  const totalRate = new Decimal(rate.net).plus(foldedFeeTotal);
  const nightlyRate = nights > 0 ? totalRate.dividedBy(nights) : totalRate;

  const result: RawRate = {
    rateId: rate.rateKey,
    roomTypeId: roomCode,
    nightlyRate: nightlyRate.toFixed(2),
    totalRate: totalRate.toFixed(2),
    currency,
    rateType: 'bar',
    paymentModel: paymentModelFromRate(rate),
    cancellationPolicy,
  };
  if (mealPlan) {
    result.mealPlan = mealPlan;
  }
  if (mandatoryFees.length > 0) {
    result.mandatoryFees = mandatoryFees;
  }
  return result;
}

function computeNights(checkInIso: string, checkOutIso: string): number {
  const inMs = Date.parse(checkInIso);
  const outMs = Date.parse(checkOutIso);
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) return 0;
  const diffMs = outMs - inMs;
  if (diffMs <= 0) return 0;
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

/** Hotelbeds room → OTAIP RawRoomType (one per room.code). */
function mapRoomType(room: HotelbedsRoom): RawRoomType {
  return {
    roomTypeId: room.code,
    code: room.code,
    description: room.name ?? room.code,
  };
}

// ---------------------------------------------------------------------------
// Hotel → RawHotelResult
// ---------------------------------------------------------------------------

export interface MapHotelOptions {
  checkIn: string;
  checkOut: string;
  /** Latency this hotel result took to fetch. Stamped on the source. */
  responseLatencyMs?: number;
}

export function mapHotelToRawResult(
  hotel: HotelbedsHotel,
  options: MapHotelOptions,
): RawHotelResult {
  const source: HotelSource = {
    sourceId: HOTELBEDS_SOURCE_ID,
    sourcePropertyId: String(hotel.code),
    ...(options.responseLatencyMs !== undefined
      ? { responseLatencyMs: options.responseLatencyMs }
      : {}),
  };

  const hotelCurrency = hotel.currency ?? 'EUR';

  const rooms = hotel.rooms ?? [];
  const roomTypes: RawRoomType[] = rooms.map(mapRoomType);
  const rates: RawRate[] = [];
  for (const room of rooms) {
    for (const rate of room.rates ?? []) {
      rates.push(mapRate(rate, room.code, hotelCurrency, options.checkIn, options.checkOut));
    }
  }

  const result: RawHotelResult = {
    source,
    propertyName: hotel.name,
    address: parseAddress(hotel),
    coordinates: parseCoordinates(hotel),
    amenities: [],
    roomTypes,
    rates,
    photos: [],
  };
  if (hotel.chainCode) {
    result.chainCode = hotel.chainCode;
  }
  const stars = parseCategoryCodeStarRating(hotel.categoryCode);
  if (stars !== undefined) {
    result.starRating = stars;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Booking → OTAIP-friendly summary
// ---------------------------------------------------------------------------

/**
 * Map Hotelbeds booking status string → OTAIP HotelBookingStatus.
 *
 * Per DQ14:
 *   CONFIRMED  → confirmed
 *   CANCELLED  → cancelled
 *   ON_REQUEST → pending  (waiting on supplier confirmation)
 *   PENDING    → pending  (Hotelbeds occasionally uses this synonym)
 *   MODIFIED   → modified
 *   *anything else* → pending + console.warn so the unknown surface
 *   doesn't get silently swallowed and downstream agents see a non-active
 *   state until we explicitly handle it.
 */
export function mapBookingStatus(status: string | undefined): HotelBookingStatus {
  const upper = (status ?? '').toUpperCase();
  switch (upper) {
    case 'CONFIRMED':
      return 'confirmed';
    case 'CANCELLED':
      return 'cancelled';
    case 'ON_REQUEST':
    case 'PENDING':
      return 'pending';
    case 'MODIFIED':
      return 'modified';
    default:
      console.warn(
        `[hotelbeds] Unknown booking status "${status ?? ''}" — falling back to "pending". ` +
          'Add an explicit mapping in field-mapper.ts:mapBookingStatus.',
      );
      return 'pending';
  }
}

export interface BookingSummary {
  reference: string;
  status: HotelBookingStatus;
  totalCharged: MonetaryAmount;
  paymentModel: PaymentModel;
  bookedAt: string;
  hotelCode?: string;
  clientReference?: string;
}

export function summarizeBooking(booking: HotelbedsBooking): BookingSummary {
  const totalAmount = booking.totalNet ?? booking.totalSellingRate ?? '0';
  const currency = booking.currency ?? booking.hotel?.currency ?? 'EUR';

  // Default to prepaid because confirmed Hotelbeds bookings flowing through
  // /bookings are prepaid net-rate bookings unless the rate is AT_HOTEL.
  const paymentModel: PaymentModel = 'prepaid';

  const summary: BookingSummary = {
    reference: booking.reference,
    status: mapBookingStatus(booking.status),
    totalCharged: { amount: totalAmount, currency },
    paymentModel,
    bookedAt: booking.creationDate ?? new Date().toISOString(),
  };
  if (booking.hotel?.code !== undefined) {
    summary.hotelCode = String(booking.hotel.code);
  }
  if (booking.clientReference) {
    summary.clientReference = booking.clientReference;
  }
  return summary;
}
