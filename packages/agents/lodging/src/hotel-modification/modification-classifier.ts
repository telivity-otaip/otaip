/**
 * Modification classifier — determines if a change is free, requires cancel/rebook, or is blocked.
 *
 * Domain rules:
 * - Free modifications: guest name, bed type, smoking preference, special requests,
 *   accessibility needs, number of guests
 * - Cancel/rebook required: date changes, room type changes, property changes
 *   (date change = cancel old booking + create new booking, new rates apply — NOT a modification)
 * - Not modifiable: non-refundable bookings (cancel only, no refund)
 *
 * Domain source: OTAIP Lodging Knowledge Base §4 (Modification vs Cancel/Rebook)
 */

import type { ChangeClassification, FreeModifications, DateChangeRequest } from './types.js';

/**
 * Classify a requested change as free modification, cancel/rebook, or not modifiable.
 */
export function classifyChange(
  modifications?: FreeModifications,
  dateChange?: DateChangeRequest,
  isNonRefundable: boolean = false,
): ChangeClassification {
  // Date changes ALWAYS require cancel/rebook — this is NOT a modification
  if (dateChange) {
    return 'cancel_rebook_required';
  }

  // Check if any free modifications were requested
  if (modifications) {
    const hasFreeChanges =
      modifications.guestFirstName !== undefined ||
      modifications.guestLastName !== undefined ||
      modifications.bedTypePreference !== undefined ||
      modifications.smokingPreference !== undefined ||
      modifications.specialRequests !== undefined ||
      modifications.accessibilityNeeds !== undefined ||
      modifications.guestCount !== undefined;

    if (hasFreeChanges) {
      return 'free_modification';
    }
  }

  // Non-refundable bookings: cancel only, no refund
  if (isNonRefundable) {
    return 'not_modifiable';
  }

  return 'free_modification';
}

/**
 * List of fields that are freely modifiable (no cancel/rebook needed).
 * From knowledge base: guest name, bed type, smoking preference,
 * special requests, accessibility needs, number of guests.
 */
export const FREE_MODIFICATION_FIELDS = [
  'guestFirstName',
  'guestLastName',
  'bedTypePreference',
  'smokingPreference',
  'specialRequests',
  'accessibilityNeeds',
  'guestCount',
] as const;
