/**
 * CRS↔PMS cross-check verification workflow.
 *
 * Domain rules:
 * - Three confirmation layers: CRS (immediate), PMS (may be async), Channel
 * - PMS sync can take 1-4 hours; >24hr delay = escalate
 * - Escalation triggers: missing PMS code, waitlist/tentative status,
 *   rate mismatch, date mismatch, guest name mismatch
 * - Rate mismatches are CRITICAL (billing impact)
 * - Date/room mismatches are CRITICAL (guest experience)
 * - Guest name mismatches are WARNING (may be formatting differences)
 *
 * Domain source: OTAIP Lodging Knowledge Base §4 (Confirmation Codes), §11 (Edge Cases)
 */

import type {
  CrsBookingData,
  PmsBookingData,
  Discrepancy,
  DiscrepancySeverity,
  EscalationReason,
  VerificationOutput,
  VerificationInput,
} from './types.js';

/**
 * Run full CRS↔PMS verification on a booking.
 */
export function verifyBooking(input: VerificationInput): VerificationOutput {
  const discrepancies: Discrepancy[] = [];
  const escalationReasons: EscalationReason[] = [];

  // Check 1: PMS confirmation code present?
  if (!input.pmsData) {
    discrepancies.push({
      field: 'pms_missing',
      crsValue: input.confirmation.crsConfirmation,
      pmsValue: 'MISSING',
      severity: 'critical',
      message:
        'PMS confirmation code missing — reservation may not have synced to property system.',
    });
    escalationReasons.push('pms_code_missing');

    // Without PMS data, we can't do field-level cross-check
    return buildResult(discrepancies, escalationReasons);
  }

  // Check 2: Status escalation (waitlist/tentative)
  checkStatusEscalation(input.crsData, input.pmsData, discrepancies, escalationReasons);

  // Check 3: Guest name cross-check
  checkGuestName(input.crsData, input.pmsData, discrepancies, escalationReasons);

  // Check 4: Date cross-check
  checkDates(input.crsData, input.pmsData, discrepancies, escalationReasons);

  // Check 5: Room type cross-check
  checkRoomType(input.crsData, input.pmsData, discrepancies, escalationReasons);

  // Check 6: Rate cross-check
  checkRates(input.crsData, input.pmsData, discrepancies, escalationReasons);

  // Multiple discrepancies = escalate even if individually minor
  if (discrepancies.length >= 3 && !escalationReasons.includes('multiple_discrepancies')) {
    escalationReasons.push('multiple_discrepancies');
  }

  return buildResult(discrepancies, escalationReasons);
}

function checkStatusEscalation(
  crs: CrsBookingData,
  pms: PmsBookingData,
  discrepancies: Discrepancy[],
  reasons: EscalationReason[],
): void {
  if (pms.status === 'waitlist') {
    discrepancies.push({
      field: 'status',
      crsValue: crs.status,
      pmsValue: 'waitlist',
      severity: 'critical',
      message: 'PMS shows waitlist status — guest may not have a guaranteed room.',
    });
    reasons.push('waitlist_status');
  }

  if (pms.status === 'tentative') {
    discrepancies.push({
      field: 'status',
      crsValue: crs.status,
      pmsValue: 'tentative',
      severity: 'critical',
      message: 'PMS shows tentative status — reservation not fully confirmed at property.',
    });
    reasons.push('tentative_status');
  }
}

function checkGuestName(
  crs: CrsBookingData,
  pms: PmsBookingData,
  discrepancies: Discrepancy[],
  reasons: EscalationReason[],
): void {
  const crsNorm = normalizeGuestName(crs.guestName);
  const pmsNorm = normalizeGuestName(pms.guestName);

  if (crsNorm !== pmsNorm) {
    // Name mismatches may be formatting differences (e.g. "SMITH/JOHN" vs "John Smith")
    const severity: DiscrepancySeverity = 'warning';
    discrepancies.push({
      field: 'guest_name',
      crsValue: crs.guestName,
      pmsValue: pms.guestName,
      severity,
      message: `Guest name mismatch: CRS="${crs.guestName}" vs PMS="${pms.guestName}". May be formatting difference.`,
    });
    reasons.push('guest_name_mismatch');
  }
}

function checkDates(
  crs: CrsBookingData,
  pms: PmsBookingData,
  discrepancies: Discrepancy[],
  reasons: EscalationReason[],
): void {
  if (crs.checkIn !== pms.checkIn) {
    discrepancies.push({
      field: 'check_in',
      crsValue: crs.checkIn,
      pmsValue: pms.checkIn,
      severity: 'critical',
      message: `Check-in date mismatch: CRS="${crs.checkIn}" vs PMS="${pms.checkIn}". Guest may arrive to wrong dates.`,
    });
    reasons.push('date_mismatch');
  }

  if (crs.checkOut !== pms.checkOut) {
    discrepancies.push({
      field: 'check_out',
      crsValue: crs.checkOut,
      pmsValue: pms.checkOut,
      severity: 'critical',
      message: `Check-out date mismatch: CRS="${crs.checkOut}" vs PMS="${pms.checkOut}". Billing and availability affected.`,
    });
    if (!reasons.includes('date_mismatch')) {
      reasons.push('date_mismatch');
    }
  }
}

function checkRoomType(
  crs: CrsBookingData,
  pms: PmsBookingData,
  discrepancies: Discrepancy[],
  reasons: EscalationReason[],
): void {
  const crsRoom = crs.roomType.toLowerCase().trim();
  const pmsRoom = pms.roomType.toLowerCase().trim();

  if (crsRoom !== pmsRoom) {
    discrepancies.push({
      field: 'room_type',
      crsValue: crs.roomType,
      pmsValue: pms.roomType,
      severity: 'critical',
      message: `Room type mismatch: CRS="${crs.roomType}" vs PMS="${pms.roomType}". Guest may receive wrong room.`,
    });
    reasons.push('room_type_mismatch');
  }
}

function checkRates(
  crs: CrsBookingData,
  pms: PmsBookingData,
  discrepancies: Discrepancy[],
  reasons: EscalationReason[],
): void {
  if (
    crs.nightlyRate.amount !== pms.nightlyRate.amount ||
    crs.nightlyRate.currency !== pms.nightlyRate.currency
  ) {
    discrepancies.push({
      field: 'nightly_rate',
      crsValue: `${crs.nightlyRate.amount} ${crs.nightlyRate.currency}`,
      pmsValue: `${pms.nightlyRate.amount} ${pms.nightlyRate.currency}`,
      severity: 'critical',
      message: `Nightly rate mismatch: CRS=${crs.nightlyRate.amount} ${crs.nightlyRate.currency} vs PMS=${pms.nightlyRate.amount} ${pms.nightlyRate.currency}. Billing discrepancy.`,
    });
    reasons.push('rate_mismatch');
  }

  if (
    crs.totalRate.amount !== pms.totalRate.amount ||
    crs.totalRate.currency !== pms.totalRate.currency
  ) {
    discrepancies.push({
      field: 'total_rate',
      crsValue: `${crs.totalRate.amount} ${crs.totalRate.currency}`,
      pmsValue: `${pms.totalRate.amount} ${pms.totalRate.currency}`,
      severity: 'critical',
      message: `Total rate mismatch: CRS=${crs.totalRate.amount} ${crs.totalRate.currency} vs PMS=${pms.totalRate.amount} ${pms.totalRate.currency}. Billing discrepancy.`,
    });
    if (!reasons.includes('rate_mismatch')) {
      reasons.push('rate_mismatch');
    }
  }
}

/**
 * Normalize guest name for comparison: lowercase, remove punctuation,
 * handle GDS format (LASTNAME/FIRSTNAME) vs PMS format (Firstname Lastname).
 */
function normalizeGuestName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[/,]/g, ' ') // GDS uses / or , as delimiter
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
    .split(' ')
    .sort() // order-independent comparison
    .join(' ');
}

function buildResult(
  discrepancies: Discrepancy[],
  escalationReasons: EscalationReason[],
): VerificationOutput {
  const hasCritical = discrepancies.some((d) => d.severity === 'critical');

  return {
    verified: discrepancies.length === 0,
    discrepancies,
    escalationRequired: escalationReasons.length > 0,
    escalationReasons,
    verifiedAt: new Date().toISOString(),
    message:
      discrepancies.length === 0
        ? 'Verification passed — CRS and PMS data match.'
        : hasCritical
          ? `Verification FAILED — ${discrepancies.length} discrepancy(ies) found, including critical issues.`
          : `Verification completed with ${discrepancies.length} warning(s).`,
  };
}
