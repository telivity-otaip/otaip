/**
 * PNR Validation Engine — 13 pre-ticketing checks.
 *
 * Catches errors before they become ADMs (Agency Debit Memos).
 */

import type {
  PnrValidationInput,
  PnrValidationOutput,
  ValidationCheck,
  PnrSegmentData,
} from './types.js';

const VALID_STATUSES = new Set(['HK', 'KK', 'SS']);
const NAME_MAX_LENGTH = 60;
const NAME_RE = /^[A-Za-z\s'-]+$/;

function now(input: PnrValidationInput): Date {
  return input.validation_date ? new Date(input.validation_date) : new Date();
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function check1SegmentStatus(input: PnrValidationInput): ValidationCheck {
  const invalid = input.segments.filter((s) => !VALID_STATUSES.has(s.status));
  if (invalid.length === 0) {
    return {
      check_id: 1,
      name: 'Segment Status',
      passed: true,
      severity: 'error',
      message: 'All segments confirmed (HK/KK).',
    };
  }
  const details = invalid
    .map((s) => `S${s.segment_number} ${s.carrier}${s.flight_number}: ${s.status}`)
    .join(', ');
  return {
    check_id: 1,
    name: 'Segment Status',
    passed: false,
    severity: 'error',
    message: `Unconfirmed segments: ${details}. Must be HK/KK before ticketing.`,
  };
}

function check2TtlNotExpired(input: PnrValidationInput): ValidationCheck {
  if (!input.ticketing) {
    return {
      check_id: 2,
      name: 'TTL Not Expired',
      passed: false,
      severity: 'error',
      message: 'No ticketing data present.',
    };
  }
  const ttl = new Date(input.ticketing.time_limit);
  const current = now(input);
  if (ttl >= current) {
    return {
      check_id: 2,
      name: 'TTL Not Expired',
      passed: true,
      severity: 'error',
      message: `TTL ${input.ticketing.time_limit} is still valid.`,
    };
  }
  return {
    check_id: 2,
    name: 'TTL Not Expired',
    passed: false,
    severity: 'error',
    message: `TTL expired: ${input.ticketing.time_limit}. Booking may auto-cancel.`,
  };
}

function check3NoDuplicateBookings(input: PnrValidationInput): ValidationCheck {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const pax of input.passengers) {
    for (const seg of input.segments) {
      const key = `${pax.last_name}/${pax.first_name}-${seg.carrier}${seg.flight_number}-${seg.departure_date}`;
      if (seen.has(key)) {
        dupes.push(
          `${pax.last_name}/${pax.first_name} on ${seg.carrier}${seg.flight_number} ${seg.departure_date}`,
        );
      }
      seen.add(key);
    }
  }
  if (dupes.length === 0) {
    return {
      check_id: 3,
      name: 'No Duplicate Bookings',
      passed: true,
      severity: 'error',
      message: 'No duplicate passenger/flight combinations.',
    };
  }
  return {
    check_id: 3,
    name: 'No Duplicate Bookings',
    passed: false,
    severity: 'error',
    message: `Duplicate bookings detected: ${dupes.join('; ')}`,
  };
}

function check4NoOrphanSegments(input: PnrValidationInput): ValidationCheck {
  // A segment is orphaned if there's a gap in the routing
  if (input.segments.length <= 1) {
    return {
      check_id: 4,
      name: 'No Orphan Segments',
      passed: true,
      severity: 'warning',
      message: 'Single segment — no orphan check needed.',
    };
  }

  const orphans: number[] = [];
  for (let i = 1; i < input.segments.length; i++) {
    const prev = input.segments[i - 1]!;
    const curr = input.segments[i]!;
    if (prev.destination !== curr.origin) {
      orphans.push(curr.segment_number);
    }
  }

  if (orphans.length === 0) {
    return {
      check_id: 4,
      name: 'No Orphan Segments',
      passed: true,
      severity: 'warning',
      message: 'Routing is continuous.',
    };
  }
  return {
    check_id: 4,
    name: 'No Orphan Segments',
    passed: false,
    severity: 'warning',
    message: `Orphan segments detected at S${orphans.join(', S')} — routing gap.`,
  };
}

function check5ApisCompleteness(input: PnrValidationInput): ValidationCheck {
  const intlSegments = input.segments.filter((s) => s.is_international);
  if (intlSegments.length === 0) {
    return {
      check_id: 5,
      name: 'APIS Completeness',
      passed: true,
      severity: 'error',
      message: 'No international segments — APIS not required.',
    };
  }

  const nonInfants = input.passengers.filter((p) => p.passenger_type !== 'INF');
  const missing: string[] = [];

  for (const pax of nonInfants) {
    const missingFields: string[] = [];
    if (!pax.passport_number) missingFields.push('passport');
    if (!pax.nationality) missingFields.push('nationality');
    if (!pax.date_of_birth) missingFields.push('DOB');
    if (!pax.gender) missingFields.push('gender');

    if (missingFields.length > 0) {
      missing.push(`P${pax.pax_number} ${pax.last_name}: ${missingFields.join(', ')}`);
    }
  }

  if (missing.length === 0) {
    return {
      check_id: 5,
      name: 'APIS Completeness',
      passed: true,
      severity: 'error',
      message: 'All passengers have complete APIS data.',
    };
  }
  return {
    check_id: 5,
    name: 'APIS Completeness',
    passed: false,
    severity: 'error',
    message: `Incomplete APIS: ${missing.join('; ')}`,
  };
}

function check6InfantLinked(input: PnrValidationInput): ValidationCheck {
  const infants = input.passengers.filter((p) => p.passenger_type === 'INF');
  if (infants.length === 0) {
    return {
      check_id: 6,
      name: 'Infant Linked',
      passed: true,
      severity: 'error',
      message: 'No infants in booking.',
    };
  }

  const unlinked = infants.filter((inf) => !inf.infant_linked_to);
  if (unlinked.length === 0) {
    // Verify linked adults exist
    const invalidLinks = infants.filter((inf) => {
      const adult = input.passengers.find((p) => p.pax_number === inf.infant_linked_to);
      return !adult || adult.passenger_type !== 'ADT';
    });
    if (invalidLinks.length === 0) {
      return {
        check_id: 6,
        name: 'Infant Linked',
        passed: true,
        severity: 'error',
        message: 'All infants correctly linked to adults.',
      };
    }
    return {
      check_id: 6,
      name: 'Infant Linked',
      passed: false,
      severity: 'error',
      message: `Infants linked to non-existent or non-adult passengers: P${invalidLinks.map((i) => i.pax_number).join(', P')}`,
    };
  }
  return {
    check_id: 6,
    name: 'Infant Linked',
    passed: false,
    severity: 'error',
    message: `Unlinked infants: P${unlinked.map((i) => i.pax_number).join(', P')}`,
  };
}

function check7NameFormat(input: PnrValidationInput): ValidationCheck {
  const issues: string[] = [];

  for (const pax of input.passengers) {
    const fullName = `${pax.last_name}/${pax.first_name}`;
    if (fullName.length > NAME_MAX_LENGTH) {
      issues.push(`P${pax.pax_number}: name exceeds ${NAME_MAX_LENGTH} chars`);
    }
    if (!NAME_RE.test(pax.last_name)) {
      issues.push(`P${pax.pax_number}: last name contains invalid characters`);
    }
    if (!NAME_RE.test(pax.first_name)) {
      issues.push(`P${pax.pax_number}: first name contains invalid characters`);
    }
  }

  if (issues.length === 0) {
    return {
      check_id: 7,
      name: 'Name Format',
      passed: true,
      severity: 'error',
      message: 'All names comply with format rules.',
    };
  }
  return {
    check_id: 7,
    name: 'Name Format',
    passed: false,
    severity: 'error',
    message: `Name issues: ${issues.join('; ')}`,
  };
}

function check8MarriedSegmentIntegrity(input: PnrValidationInput): ValidationCheck {
  const marriedGroups = new Map<string, PnrSegmentData[]>();
  for (const seg of input.segments) {
    if (seg.married_group) {
      const group = marriedGroups.get(seg.married_group) ?? [];
      group.push(seg);
      marriedGroups.set(seg.married_group, group);
    }
  }

  if (marriedGroups.size === 0) {
    return {
      check_id: 8,
      name: 'Married Segment Integrity',
      passed: true,
      severity: 'warning',
      message: 'No married segments.',
    };
  }

  const issues: string[] = [];
  for (const [group, segs] of marriedGroups) {
    if (segs.length < 2) {
      issues.push(`Married group ${group} has only 1 segment`);
    }
    // Check all segments have same status
    const statuses = new Set(segs.map((s) => s.status));
    if (statuses.size > 1) {
      issues.push(`Married group ${group} has mixed statuses: ${[...statuses].join(', ')}`);
    }
  }

  if (issues.length === 0) {
    return {
      check_id: 8,
      name: 'Married Segment Integrity',
      passed: true,
      severity: 'warning',
      message: 'Married segments are intact.',
    };
  }
  return {
    check_id: 8,
    name: 'Married Segment Integrity',
    passed: false,
    severity: 'warning',
    message: issues.join('; '),
  };
}

function check9FareToSegmentMatch(input: PnrValidationInput): ValidationCheck {
  if (!input.fare) {
    return {
      check_id: 9,
      name: 'Fare-Segment Match',
      passed: false,
      severity: 'warning',
      message: 'No fare data to validate.',
    };
  }

  const coveredSegments = new Set(input.fare.segment_indices);
  const uncovered = input.segments.filter((_, i) => !coveredSegments.has(i));

  if (uncovered.length === 0) {
    return {
      check_id: 9,
      name: 'Fare-Segment Match',
      passed: true,
      severity: 'warning',
      message: 'All segments covered by fare.',
    };
  }
  return {
    check_id: 9,
    name: 'Fare-Segment Match',
    passed: false,
    severity: 'warning',
    message: `Segments not covered by fare: S${uncovered.map((s) => s.segment_number).join(', S')}`,
  };
}

function check10ContactPresent(input: PnrValidationInput): ValidationCheck {
  if (input.contact && (input.contact.phone || input.contact.email)) {
    return {
      check_id: 10,
      name: 'Contact Present',
      passed: true,
      severity: 'error',
      message: 'Contact information present.',
    };
  }
  return {
    check_id: 10,
    name: 'Contact Present',
    passed: false,
    severity: 'error',
    message: 'No contact information (phone or email) in PNR.',
  };
}

function check11TicketingArrangement(input: PnrValidationInput): ValidationCheck {
  if (input.ticketing && input.ticketing.arranged) {
    return {
      check_id: 11,
      name: 'Ticketing Arrangement',
      passed: true,
      severity: 'error',
      message: 'Ticketing arrangement present.',
    };
  }
  return {
    check_id: 11,
    name: 'Ticketing Arrangement',
    passed: false,
    severity: 'error',
    message: 'No ticketing arrangement in PNR.',
  };
}

function check12AdvancePurchase(input: PnrValidationInput): ValidationCheck {
  if (!input.fare?.advance_purchase_deadline) {
    return {
      check_id: 12,
      name: 'Advance Purchase',
      passed: true,
      severity: 'warning',
      message: 'No advance purchase requirement.',
    };
  }

  const deadline = new Date(input.fare.advance_purchase_deadline);
  const current = now(input);

  if (current <= deadline) {
    return {
      check_id: 12,
      name: 'Advance Purchase',
      passed: true,
      severity: 'error',
      message: `Advance purchase deadline ${input.fare.advance_purchase_deadline} not yet passed.`,
    };
  }
  return {
    check_id: 12,
    name: 'Advance Purchase',
    passed: false,
    severity: 'error',
    message: `Advance purchase deadline EXPIRED: ${input.fare.advance_purchase_deadline}. Fare may no longer be valid.`,
  };
}

function check13NoNameChangePostBooking(_input: PnrValidationInput): ValidationCheck {
  // TODO: [NEEDS DOMAIN INPUT] Real name change detection requires comparing
  // current PNR names against original booking names from PNR history.
  // For now, always passes — would need PNR history data to implement.
  return {
    check_id: 13,
    name: 'No Name Change',
    passed: true,
    severity: 'warning',
    message:
      'Name change check requires PNR history comparison (not available in static validation).',
  };
}

// ---------------------------------------------------------------------------
// Main validation
// ---------------------------------------------------------------------------

export function validatePnr(input: PnrValidationInput): PnrValidationOutput {
  const checks: ValidationCheck[] = [
    check1SegmentStatus(input),
    check2TtlNotExpired(input),
    check3NoDuplicateBookings(input),
    check4NoOrphanSegments(input),
    check5ApisCompleteness(input),
    check6InfantLinked(input),
    check7NameFormat(input),
    check8MarriedSegmentIntegrity(input),
    check9FareToSegmentMatch(input),
    check10ContactPresent(input),
    check11TicketingArrangement(input),
    check12AdvancePurchase(input),
    check13NoNameChangePostBooking(input),
  ];

  const errorCount = checks.filter((c) => !c.passed && c.severity === 'error').length;
  const warningCount = checks.filter((c) => !c.passed && c.severity === 'warning').length;

  return {
    record_locator: input.record_locator,
    checks,
    valid: errorCount === 0,
    error_count: errorCount,
    warning_count: warningCount,
  };
}
