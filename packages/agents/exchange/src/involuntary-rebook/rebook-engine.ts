/**
 * Involuntary Rebook Engine — trigger assessment, protection logic,
 * regulatory entitlements.
 */

import { createRequire } from 'node:module';
import type {
  InvoluntaryRebookInput,
  InvoluntaryRebookOutput,
  InvoluntaryRebookResult,
  InvoluntaryTrigger,
  ProtectionOption,
  ProtectionPath,
  RegulatoryFlag,
} from './types.js';

const require = createRequire(import.meta.url);
const euData = require('./data/eu-countries.json') as { countries: string[] };
const EU_COUNTRIES = new Set(euData.countries);

const DEFAULT_TIME_CHANGE_THRESHOLD = 60; // minutes

// ---------------------------------------------------------------------------
// Trigger assessment
// ---------------------------------------------------------------------------

function assessTrigger(input: InvoluntaryRebookInput): {
  isInvoluntary: boolean;
  trigger: InvoluntaryTrigger;
} {
  const sc = input.schedule_change;
  const thresholds = input.thresholds ?? {};
  const timeThreshold = thresholds.time_change_minutes ?? DEFAULT_TIME_CHANGE_THRESHOLD;

  if (input.is_passenger_no_show) {
    return { isInvoluntary: false, trigger: 'NO_SHOW' };
  }

  switch (sc.change_type) {
    case 'FLIGHT_CANCELLATION':
      return { isInvoluntary: true, trigger: 'FLIGHT_CANCELLATION' };

    case 'TIME_CHANGE': {
      const minutes = sc.time_change_minutes ?? 0;
      return {
        isInvoluntary: minutes > timeThreshold,
        trigger: 'TIME_CHANGE',
      };
    }

    case 'ROUTING_CHANGE':
      return { isInvoluntary: true, trigger: 'ROUTING_CHANGE' };

    case 'EQUIPMENT_DOWNGRADE': {
      // Flag but not auto-involuntary
      const isDowngrade = sc.original_is_widebody === true && sc.new_is_widebody === false;
      return { isInvoluntary: false, trigger: 'EQUIPMENT_DOWNGRADE' };
      void isDowngrade;
    }
  }
}

// ---------------------------------------------------------------------------
// Protection logic
// ---------------------------------------------------------------------------

function buildProtectionOptions(input: InvoluntaryRebookInput): ProtectionOption[] {
  if (!input.available_flights || input.available_flights.length === 0) {
    return [];
  }

  const options: ProtectionOption[] = [];

  // Priority 1: Same carrier
  const sameCarrier = input.available_flights.filter((f) => f.is_same_carrier);
  for (const f of sameCarrier) {
    options.push({
      path: 'SAME_CARRIER',
      carrier: f.carrier,
      flight_number: f.flight_number,
      departure_date: f.departure_date,
      departure_time: f.departure_time,
      booking_class: f.booking_class,
      notes: 'Same carrier — preferred protection option.',
    });
  }

  // Priority 2: Alliance partners
  const alliance = input.available_flights.filter(
    (f) => f.is_alliance_partner && !f.is_same_carrier,
  );
  for (const f of alliance) {
    options.push({
      path: 'ALLIANCE_PARTNER',
      carrier: f.carrier,
      flight_number: f.flight_number,
      departure_date: f.departure_date,
      departure_time: f.departure_time,
      booking_class: f.booking_class,
      notes: 'Alliance partner — secondary protection option.',
    });
  }

  // Priority 3: Interline
  const interline = input.available_flights.filter(
    (f) => f.is_interline && !f.is_same_carrier && !f.is_alliance_partner,
  );
  for (const f of interline) {
    options.push({
      path: 'INTERLINE',
      carrier: f.carrier,
      flight_number: f.flight_number,
      departure_date: f.departure_date,
      departure_time: f.departure_time,
      booking_class: f.booking_class,
      notes: 'Interline — last resort protection.',
    });
  }

  return options;
}

// ---------------------------------------------------------------------------
// Regulatory entitlements
// ---------------------------------------------------------------------------

function assessRegulatory(input: InvoluntaryRebookInput): RegulatoryFlag[] {
  const flags: RegulatoryFlag[] = [];
  const pnr = input.original_pnr;

  // EU261/2004: applies if departing from EU OR if EU carrier regardless of destination
  const departureIsEu = EU_COUNTRIES.has(pnr.departure_country);
  const isEuCarrier = pnr.is_eu_carrier;

  if (departureIsEu || isEuCarrier) {
    flags.push({
      framework: 'EU261',
      applies: true,
      reason: departureIsEu
        ? `Departure from EU/EEA country (${pnr.departure_country}).`
        : `EU carrier (${pnr.affected_segment.carrier}) — EU261 applies regardless of route.`,
    });
  } else {
    flags.push({
      framework: 'EU261',
      applies: false,
      reason: 'Non-EU departure and non-EU carrier — EU261 does not apply.',
    });
  }

  // US DOT: applies if departure from or arrival to US
  const usInvolved = pnr.departure_country === 'US' || pnr.arrival_country === 'US';
  flags.push({
    framework: 'US_DOT',
    applies: usInvolved,
    reason: usInvolved
      ? `US departure or arrival — DOT consumer protection applies.`
      : 'No US touchpoint — US DOT rules do not apply.',
  });

  return flags;
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

export function processInvoluntaryRebook(input: InvoluntaryRebookInput): InvoluntaryRebookOutput {
  const { isInvoluntary, trigger } = assessTrigger(input);
  const isNoShow = input.is_passenger_no_show === true;

  const protectionOptions = isInvoluntary ? buildProtectionOptions(input) : [];
  const protectionPath: ProtectionPath =
    protectionOptions.length > 0 ? protectionOptions[0]!.path : 'NONE_AVAILABLE';

  const regulatoryFlags = isInvoluntary ? assessRegulatory(input) : [];

  // Original routing credit: passenger retains original fare basis when rebooked involuntarily
  const originalRoutingCredit = isInvoluntary && !isNoShow;

  // Build summary
  const summaryParts: string[] = [];
  if (isNoShow) {
    summaryParts.push('Passenger no-show — involuntary protection does not apply.');
  } else if (isInvoluntary) {
    summaryParts.push(`Involuntary change: ${trigger.replace('_', ' ').toLowerCase()}.`);
    if (protectionOptions.length > 0) {
      summaryParts.push(
        `Protection: ${protectionPath.replace('_', ' ').toLowerCase()} — ${protectionOptions[0]!.carrier}${protectionOptions[0]!.flight_number}.`,
      );
    } else {
      summaryParts.push('No protection flights available — manual rebooking required.');
    }
    for (const flag of regulatoryFlags) {
      if (flag.applies) {
        summaryParts.push(`${flag.framework} applies: ${flag.reason}`);
      }
    }
    if (originalRoutingCredit) {
      summaryParts.push('Original routing credit: passenger retains original fare basis.');
    }
  } else {
    summaryParts.push(
      `Schedule change does not meet involuntary threshold (trigger: ${trigger.replace('_', ' ').toLowerCase()}).`,
    );
  }

  const result: InvoluntaryRebookResult = {
    is_involuntary: isInvoluntary,
    trigger,
    is_no_show: isNoShow,
    protection_options: protectionOptions,
    protection_path: isInvoluntary ? protectionPath : 'NONE_AVAILABLE',
    regulatory_flags: regulatoryFlags,
    original_routing_credit: originalRoutingCredit,
    summary: summaryParts.join(' '),
  };

  return { result };
}
