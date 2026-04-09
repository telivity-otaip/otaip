/**
 * Core mapping logic for Class of Service Mapper.
 *
 * Looks up carrier + booking class, falls back to IATA defaults if carrier unknown.
 * All domain rules from the spec (agents/specs/0-4-class-of-service-mapper.yaml).
 */

import type {
  ClassOfServiceMapperInput,
  ClassOfServiceMapperOutput,
  ClassMapping,
} from './types.js';
import {
  CARRIER_CLASS_MAPS,
  IATA_DEFAULTS,
  CARRIER_LOYALTY_MAPS,
  toLoyaltyEarning,
} from './data.js';
import type { BookingClassDef } from './data.js';

/** Valid booking class pattern: single uppercase letter A-Z */
const BOOKING_CLASS_PATTERN = /^[A-Z]$/;

/**
 * Map a booking class + carrier to a ClassMapping with confidence score.
 *
 * Resolution order:
 * 1. Carrier-specific map (confidence 1.0)
 * 2. IATA default fallback (confidence 0.7)
 * 3. Unknown (confidence 0, mapping null)
 */
export function mapClassOfService(input: ClassOfServiceMapperInput): ClassOfServiceMapperOutput {
  const bookingClass = input.booking_class.toUpperCase().trim();
  const carrier = input.carrier.toUpperCase().trim();
  const includeLoyalty = input.include_loyalty ?? false;

  // Validate booking class is a single letter
  if (!BOOKING_CLASS_PATTERN.test(bookingClass)) {
    return { mapping: null, match_confidence: 0 };
  }

  // Step 1: Try carrier-specific lookup
  const carrierMap = CARRIER_CLASS_MAPS.get(carrier);
  if (carrierMap) {
    const classDef = carrierMap.get(bookingClass);
    if (classDef) {
      const mapping = buildMapping(bookingClass, carrier, classDef, includeLoyalty);
      return { mapping, match_confidence: 1.0 };
    }

    // Carrier is known but class not mapped — fall through to IATA defaults
  }

  // Step 2: Try IATA default fallback
  const iataDefault = IATA_DEFAULTS.get(bookingClass);
  if (iataDefault) {
    const mapping = buildMapping(bookingClass, carrier, iataDefault, false);
    // No loyalty data for IATA defaults
    return { mapping, match_confidence: 0.7 };
  }

  // Step 3: Unknown
  return { mapping: null, match_confidence: 0 };
}

/**
 * Build a ClassMapping from a BookingClassDef and optional loyalty data.
 */
function buildMapping(
  bookingClass: string,
  carrier: string,
  def: BookingClassDef,
  includeLoyalty: boolean,
): ClassMapping {
  let loyaltyEarning = null;

  if (includeLoyalty) {
    const loyaltyMap = CARRIER_LOYALTY_MAPS.get(carrier);
    if (loyaltyMap) {
      const loyaltyDef = loyaltyMap.get(bookingClass);
      if (loyaltyDef) {
        loyaltyEarning = toLoyaltyEarning(loyaltyDef);
      }
    }
  }

  return {
    booking_class: bookingClass,
    carrier,
    cabin_class: def.cabin_class,
    cabin_brand_name: def.cabin_brand_name,
    fare_family: def.fare_family,
    upgrade_eligible: def.upgrade_eligible,
    upgrade_type: def.upgrade_type,
    same_day_change: def.same_day_change,
    seat_selection: def.seat_selection,
    changes_allowed: def.changes_allowed,
    refundable: def.refundable,
    priority: def.priority,
    loyalty_earning: loyaltyEarning,
  };
}
