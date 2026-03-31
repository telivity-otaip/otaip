/**
 * ADM Prevention Engine — 9 pre-ticketing audit checks.
 */

import Decimal from 'decimal.js';
import type {
  ADMPreventionInput,
  ADMPreventionOutput,
  ADMPreventionResult,
  ADMCheck,
} from './types.js';

// Fare basis first-character to expected booking class mapping
// This is a simplified mapping — real ATPCO mappings are far more complex
const FARE_CLASS_MAP: Record<string, string[]> = {
  Y: ['Y'],
  B: ['B'],
  M: ['M'],
  H: ['H'],
  K: ['K'],
  L: ['L'],
  Q: ['Q'],
  N: ['N'],
  S: ['S'],
  T: ['T'],
  V: ['V'],
  W: ['W'],
  X: ['X'],
  E: ['E'],
  G: ['G'],
  U: ['U'],
  C: ['C', 'J', 'D'],
  J: ['C', 'J', 'D'],
  D: ['C', 'J', 'D'],
  R: ['R'],
  I: ['I'],
  P: ['P'],
  F: ['F', 'A'],
  A: ['F', 'A'],
};

const TOUR_CODE_RE = /^[A-Z0-9]{1,15}$/;
const TTL_BUFFER_MINUTES = 30;

// Unrestricted fare classes (no endorsement required)
const UNRESTRICTED_CLASSES = new Set(['Y', 'C', 'D', 'J', 'F', 'A', 'P', 'R', 'I']);

function currentTime(input: ADMPreventionInput): Date {
  return input.current_datetime ? new Date(input.current_datetime) : new Date();
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkDuplicateBooking(input: ADMPreventionInput): ADMCheck {
  const check: ADMCheck = {
    check_id: 'DUPLICATE_BOOKING',
    name: 'Duplicate Booking Detection',
    severity: 'blocking',
    passed: true,
    reason: 'No duplicate bookings found.',
  };

  if (!input.duplicate_check_pnrs || input.duplicate_check_pnrs.length === 0) {
    return check;
  }

  const paxName = input.booking.passenger_name.toUpperCase();
  for (const otherPnr of input.duplicate_check_pnrs) {
    if (otherPnr.record_locator === input.booking.record_locator) continue;
    if (otherPnr.passenger_name.toUpperCase() !== paxName) continue;

    for (const otherSeg of otherPnr.segments) {
      for (const mySeg of input.booking.segments) {
        if (
          mySeg.carrier === otherSeg.carrier &&
          mySeg.flight_number === otherSeg.flight_number &&
          mySeg.departure_date === otherSeg.departure_date
        ) {
          check.passed = false;
          check.reason = `Duplicate: ${paxName} on ${mySeg.carrier}${mySeg.flight_number} ${mySeg.departure_date} in PNR ${otherPnr.record_locator}.`;
          return check;
        }
      }
    }
  }

  return check;
}

function checkFareClassMismatch(input: ADMPreventionInput): ADMCheck {
  const check: ADMCheck = {
    check_id: 'FARE_CLASS_MISMATCH',
    name: 'Fare Basis vs Booked Class',
    severity: 'blocking',
    passed: true,
    reason: 'Fare basis matches booked class.',
  };

  const firstChar = input.fare_basis.charAt(0).toUpperCase();
  const allowed = FARE_CLASS_MAP[firstChar];
  if (allowed && !allowed.includes(input.booked_class.toUpperCase())) {
    check.passed = false;
    check.reason = `Fare basis ${input.fare_basis} (${firstChar} class) booked in ${input.booked_class} — mismatch.`;
  }

  return check;
}

function checkPassiveSegments(input: ADMPreventionInput): ADMCheck {
  const check: ADMCheck = {
    check_id: 'PASSIVE_SEGMENT',
    name: 'Passive Segment Abuse',
    severity: 'blocking',
    passed: true,
    reason: 'No passive segments found.',
  };

  const passiveStatuses = new Set(['HX', 'UN', 'NO', 'UC']);
  for (const seg of input.booking.segments) {
    if (passiveStatuses.has(seg.status)) {
      check.passed = false;
      check.reason = `Passive segment: ${seg.carrier}${seg.flight_number} status ${seg.status} — must be removed before ticketing.`;
      return check;
    }
  }

  return check;
}

function checkMarriedSegments(input: ADMPreventionInput): ADMCheck {
  const check: ADMCheck = {
    check_id: 'MARRIED_SEGMENT',
    name: 'Married Segment Integrity',
    severity: 'blocking',
    passed: true,
    reason: 'Married segments are consistent.',
  };

  const groups = new Map<string, string[]>();
  for (const seg of input.booking.segments) {
    if (seg.married_group) {
      const statuses = groups.get(seg.married_group) ?? [];
      statuses.push(seg.status);
      groups.set(seg.married_group, statuses);
    }
  }

  for (const [group, statuses] of groups) {
    const unique = new Set(statuses);
    if (unique.size > 1) {
      check.passed = false;
      check.reason = `Married group ${group} has mixed statuses: ${[...unique].join(', ')} — must be identical.`;
      return check;
    }
  }

  return check;
}

function checkTtlExpired(input: ADMPreventionInput): ADMCheck {
  const check: ADMCheck = {
    check_id: 'TTL_EXPIRED',
    name: 'Ticketing Time Limit',
    severity: 'blocking',
    passed: true,
    reason: 'TTL is valid.',
  };

  if (!input.ttl_deadline) {
    check.reason = 'No TTL deadline provided — skipped.';
    return check;
  }

  const now = currentTime(input);
  const deadline = new Date(input.ttl_deadline);
  const minutesRemaining = (deadline.getTime() - now.getTime()) / (1000 * 60);

  if (minutesRemaining < 0) {
    check.passed = false;
    check.reason = `TTL expired at ${input.ttl_deadline} — cannot ticket.`;
  } else if (minutesRemaining < TTL_BUFFER_MINUTES) {
    check.passed = false;
    check.reason = `TTL expires in ${Math.round(minutesRemaining)} minutes (< ${TTL_BUFFER_MINUTES}min buffer) — risk of expiry during ticketing.`;
  }

  return check;
}

function checkCommissionRate(input: ADMPreventionInput): ADMCheck {
  const check: ADMCheck = {
    check_id: 'COMMISSION_RATE',
    name: 'Commission Rate vs Contracted',
    severity: 'blocking',
    passed: true,
    reason: 'Commission rate is within contracted limits.',
  };

  if (input.commission_rate == null || input.carrier_contracted_rate == null) {
    check.reason = 'Commission rate or contracted rate not provided — skipped.';
    return check;
  }

  if (input.commission_rate > input.carrier_contracted_rate) {
    check.passed = false;
    check.reason = `Commission ${input.commission_rate}% exceeds carrier contracted rate ${input.carrier_contracted_rate}% — ADM risk.`;
  }

  return check;
}

function checkEndorsementBox(input: ADMPreventionInput): ADMCheck {
  const check: ADMCheck = {
    check_id: 'ENDORSEMENT_BOX',
    name: 'Endorsement Box',
    severity: 'warning',
    passed: true,
    reason: 'Endorsement populated correctly.',
  };

  const firstChar = input.fare_basis.charAt(0).toUpperCase();
  const isRestricted = !UNRESTRICTED_CLASSES.has(firstChar);

  if (isRestricted && (!input.endorsement || input.endorsement.trim().length === 0)) {
    check.passed = false;
    check.reason = `Restricted fare ${input.fare_basis} requires endorsement (e.g., "NON-ENDO/NON-REF") — endorsement box is empty.`;
  }

  return check;
}

function checkTourCodeFormat(input: ADMPreventionInput): ADMCheck {
  const check: ADMCheck = {
    check_id: 'TOUR_CODE_FORMAT',
    name: 'Tour Code Format',
    severity: 'warning',
    passed: true,
    reason: 'Tour code format is valid.',
  };

  if (!input.tour_code) {
    check.reason = 'No tour code present — skipped.';
    return check;
  }

  if (!TOUR_CODE_RE.test(input.tour_code)) {
    check.passed = false;
    check.reason = `Tour code "${input.tour_code}" is invalid — must be alphanumeric, max 15 characters.`;
  }

  return check;
}

function checkNetRemit(input: ADMPreventionInput): ADMCheck {
  const check: ADMCheck = {
    check_id: 'NET_REMIT',
    name: 'Net Remit Validation',
    severity: 'blocking',
    passed: true,
    reason: 'Net remit validation passed.',
  };

  if (!input.is_net_remit) {
    check.reason = 'Not a net remit ticket — skipped.';
    return check;
  }

  if (!input.net_contracted_amount) {
    check.passed = false;
    check.reason = 'Net remit ticket but no contracted amount provided — cannot validate.';
    return check;
  }

  const baseFare = new Decimal(input.booking.base_fare);
  const netAmount = new Decimal(input.net_contracted_amount);

  if (baseFare.greaterThan(netAmount)) {
    check.passed = false;
    check.reason = `Base fare ${input.booking.base_fare_currency} ${baseFare.toFixed(2)} exceeds net contracted amount ${input.booking.base_fare_currency} ${netAmount.toFixed(2)} — ADM risk.`;
  }

  return check;
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

export function runAudit(input: ADMPreventionInput): ADMPreventionOutput {
  const checks: ADMCheck[] = [
    checkDuplicateBooking(input),
    checkFareClassMismatch(input),
    checkPassiveSegments(input),
    checkMarriedSegments(input),
    checkTtlExpired(input),
    checkCommissionRate(input),
    checkEndorsementBox(input),
    checkTourCodeFormat(input),
    checkNetRemit(input),
  ];

  const blockingFailures = checks.filter((c) => c.severity === 'blocking' && !c.passed);
  const warningFailures = checks.filter((c) => c.severity === 'warning' && !c.passed);

  const result: ADMPreventionResult = {
    checks,
    overall_pass: blockingFailures.length === 0,
    blocking_count: blockingFailures.length,
    warning_count: warningFailures.length,
  };

  return { result };
}
