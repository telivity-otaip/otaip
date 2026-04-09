/**
 * PNR Command Builder — GDS-specific command generation.
 *
 * GDS command syntax reference:
 *   Amadeus: NM1SURNAME/FIRSTNAME MR
 *   Sabre:   -SURNAME/FIRSTNAME
 *   Travelport: N:1SURNAME/FIRSTNAME
 *
 * TODO: [NEEDS DOMAIN INPUT] Knowledge base file
 *   knowledge-base/core/distribution/gds_command_comparison.md
 *   not found. Commands below are based on standard GDS documentation.
 *   Verify against actual GDS API specs before production use.
 */

import type {
  GdsSystem,
  PnrBuilderInput,
  PnrBuilderOutput,
  PnrCommand,
  PnrPassenger,
  PnrSegment,
  PnrContact,
  PnrTicketing,
  SsrElement,
  OsiElement,
} from './types.js';

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function formatDateGds(isoDate: string): string {
  const d = new Date(isoDate);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTHS[d.getUTCMonth()]!;
  return `${day}${mon}`;
}

function formatDateDocs(isoDate: string): string {
  const d = new Date(isoDate);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTHS[d.getUTCMonth()]!;
  const year = String(d.getUTCFullYear());
  return `${day}${mon}${year}`;
}

// ---------------------------------------------------------------------------
// Name commands
// ---------------------------------------------------------------------------

function buildNameCommands(
  gds: GdsSystem,
  passengers: PnrPassenger[],
  isGroup: boolean,
  groupName?: string,
): PnrCommand[] {
  const commands: PnrCommand[] = [];

  if (isGroup && groupName) {
    switch (gds) {
      case 'AMADEUS':
        // Amadeus group: NM10GROUPNAME
        commands.push({
          command: `NM${passengers.length}${groupName.toUpperCase()}`,
          description: `Group name for ${passengers.length} passengers`,
          element_type: 'GROUP',
        });
        break;
      case 'SABRE':
        // Sabre group: 0GROUP NAME§10
        commands.push({
          command: `0${groupName.toUpperCase()}§${passengers.length}`,
          description: `Group name for ${passengers.length} passengers`,
          element_type: 'GROUP',
        });
        break;
      case 'TRAVELPORT':
        // Travelport group: N:10/GROUPNAME
        commands.push({
          command: `N:${passengers.length}/${groupName.toUpperCase()}`,
          description: `Group name for ${passengers.length} passengers`,
          element_type: 'GROUP',
        });
        break;
    }
  }

  // Individual names (non-infant passengers only for initial entry)
  const adults = passengers.filter((p) => p.passenger_type !== 'INF');
  const infants = passengers.filter((p) => p.passenger_type === 'INF');

  for (const pax of adults) {
    const surname = pax.last_name.toUpperCase();
    const firstname = pax.first_name.toUpperCase();
    const title = pax.title ? ` ${pax.title.toUpperCase()}` : '';

    switch (gds) {
      case 'AMADEUS':
        // NM1SURNAME/FIRSTNAME MR
        commands.push({
          command: `NM1${surname}/${firstname}${title}`,
          description: `Name: ${surname}/${firstname}`,
          element_type: 'NAME',
        });
        break;
      case 'SABRE':
        // -SURNAME/FIRSTNAME
        commands.push({
          command: `-${surname}/${firstname}${title}`,
          description: `Name: ${surname}/${firstname}`,
          element_type: 'NAME',
        });
        break;
      case 'TRAVELPORT':
        // N:1SURNAME/FIRSTNAME
        commands.push({
          command: `N:1${surname}/${firstname}${title}`,
          description: `Name: ${surname}/${firstname}`,
          element_type: 'NAME',
        });
        break;
    }
  }

  // Infant names (linked to accompanying adult)
  for (const inf of infants) {
    const surname = inf.last_name.toUpperCase();
    const firstname = inf.first_name.toUpperCase();
    const adultIdx = inf.infant_accompanying_adult ?? 0;
    const adultPaxNum = adultIdx + 1;

    switch (gds) {
      case 'AMADEUS':
        // Amadeus infant: NM1SURNAME/FIRSTNAME(INF)
        commands.push({
          command: `NM1${surname}/${firstname}(INF)`,
          description: `Infant: ${surname}/${firstname} with adult P${adultPaxNum}`,
          element_type: 'NAME',
        });
        break;
      case 'SABRE':
        // Sabre infant: -SURNAME/FIRSTNAME*INF
        // TODO: [NEEDS DOMAIN INPUT] Verify exact Sabre infant name syntax
        commands.push({
          command: `-${surname}/${firstname}*INF`,
          description: `Infant: ${surname}/${firstname} with adult P${adultPaxNum}`,
          element_type: 'NAME',
        });
        break;
      case 'TRAVELPORT':
        // Travelport infant: N:I/1SURNAME/FIRSTNAME
        // TODO: [NEEDS DOMAIN INPUT] Verify exact Travelport infant syntax
        commands.push({
          command: `N:I/1${surname}/${firstname}`,
          description: `Infant: ${surname}/${firstname} with adult P${adultPaxNum}`,
          element_type: 'NAME',
        });
        break;
    }
  }

  return commands;
}

// ---------------------------------------------------------------------------
// Segment commands
// ---------------------------------------------------------------------------

function buildSegmentCommands(gds: GdsSystem, segments: PnrSegment[]): PnrCommand[] {
  return segments.map((seg) => {
    const date = formatDateGds(seg.departure_date);
    const carrier = seg.carrier.toUpperCase();
    const flightNum = seg.flight_number;
    const cls = seg.booking_class.toUpperCase();
    const origin = seg.origin.toUpperCase();
    const dest = seg.destination.toUpperCase();
    const qty = seg.quantity;
    const status = seg.status;

    let command: string;
    switch (gds) {
      case 'AMADEUS':
        // SS2 BA115 Y 15MAR LHRJFK SS2
        command = `SS${qty} ${carrier}${flightNum} ${cls} ${date} ${origin}${dest} ${status}${qty}`;
        break;
      case 'SABRE':
        // 0BA115Y15MARLHRJFKSS2
        command = `0${carrier}${flightNum}${cls}${date}${origin}${dest}${status}${qty}`;
        break;
      case 'TRAVELPORT':
        // 0BA115Y15MAR-LHRJFK/SS2
        command = `0${carrier}${flightNum}${cls}${date}-${origin}${dest}/${status}${qty}`;
        break;
    }

    return {
      command,
      description: `Segment: ${carrier}${flightNum} ${cls} ${date} ${origin}-${dest}`,
      element_type: 'SEGMENT' as const,
    };
  });
}

// ---------------------------------------------------------------------------
// Contact commands
// ---------------------------------------------------------------------------

function buildContactCommands(gds: GdsSystem, contacts: PnrContact[]): PnrCommand[] {
  const commands: PnrCommand[] = [];

  for (const contact of contacts) {
    const phone = contact.phone;
    const typeLabel = contact.type === 'AGENCY' ? 'A' : contact.type === 'PASSENGER' ? 'P' : 'E';

    switch (gds) {
      case 'AMADEUS':
        // AP +1-212-555-1234
        commands.push({
          command: `AP ${phone}`,
          description: `Phone (${contact.type}): ${phone}`,
          element_type: 'CONTACT',
        });
        break;
      case 'SABRE':
        // 9+1-212-555-1234-A
        commands.push({
          command: `9${phone}-${typeLabel}`,
          description: `Phone (${contact.type}): ${phone}`,
          element_type: 'CONTACT',
        });
        break;
      case 'TRAVELPORT':
        // P:SFOAS/+1-212-555-1234
        commands.push({
          command: `P:SFO${typeLabel}S/${phone}`,
          description: `Phone (${contact.type}): ${phone}`,
          element_type: 'CONTACT',
        });
        break;
    }

    // Email (CTCE SSR in most GDS)
    if (contact.email) {
      const emailEncoded = contact.email.replace('@', '//');
      switch (gds) {
        case 'AMADEUS':
          commands.push({
            command: `SR CTCE ${emailEncoded}-1.1`,
            description: `Email: ${contact.email}`,
            element_type: 'CONTACT',
          });
          break;
        case 'SABRE':
          commands.push({
            command: `3CTCE/${emailEncoded}`,
            description: `Email: ${contact.email}`,
            element_type: 'CONTACT',
          });
          break;
        case 'TRAVELPORT':
          commands.push({
            command: `SI.P1/CTCE/${emailEncoded}`,
            description: `Email: ${contact.email}`,
            element_type: 'CONTACT',
          });
          break;
      }
    }
  }

  return commands;
}

// ---------------------------------------------------------------------------
// Ticketing commands
// ---------------------------------------------------------------------------

function buildTicketingCommand(gds: GdsSystem, ticketing: PnrTicketing): PnrCommand {
  const date = formatDateGds(ticketing.time_limit);

  let command: string;
  switch (gds) {
    case 'AMADEUS':
      // TKTL15MAR
      command = `TKTL${date}`;
      break;
    case 'SABRE':
      // 7TAW15MAR
      command = `7TAW${date}`;
      break;
    case 'TRAVELPORT':
      // T:TAU/15MAR
      command = `T:TAU/${date}`;
      break;
  }

  return {
    command,
    description: `Ticketing time limit: ${date}`,
    element_type: 'TICKETING',
  };
}

// ---------------------------------------------------------------------------
// Received-from command
// ---------------------------------------------------------------------------

function buildReceivedFromCommand(gds: GdsSystem, receivedFrom: string): PnrCommand {
  let command: string;
  switch (gds) {
    case 'AMADEUS':
      // RF AGENT NAME
      command = `RF ${receivedFrom.toUpperCase()}`;
      break;
    case 'SABRE':
      // 6AGENT NAME
      command = `6${receivedFrom.toUpperCase()}`;
      break;
    case 'TRAVELPORT':
      // R:AGENT NAME
      command = `R:${receivedFrom.toUpperCase()}`;
      break;
  }

  return {
    command,
    description: `Received from: ${receivedFrom}`,
    element_type: 'RECEIVED_FROM',
  };
}

// ---------------------------------------------------------------------------
// SSR commands
// ---------------------------------------------------------------------------

function buildSsrCommands(gds: GdsSystem, ssrs: SsrElement[]): PnrCommand[] {
  return ssrs.map((ssr) => {
    const carrier = ssr.carrier.toUpperCase();
    const code = ssr.code;
    const paxNum = ssr.passenger_index;
    const text = ssr.text;
    const segRef = ssr.segment_index ? `/S${ssr.segment_index}` : '';

    let command: string;
    switch (gds) {
      case 'AMADEUS':
        // SR WCHR-BA/P1/S1
        command = `SR ${code} ${carrier !== 'YY' ? `-${carrier}` : ''}${segRef}/P${paxNum}${text ? `/${text}` : ''}`;
        break;
      case 'SABRE':
        // 3${CODE}${CARRIER}${SEGNUM}/TEXT-1.1
        command = `3${code}${carrier}${ssr.segment_index ?? ''}/${text}-${paxNum}.1`;
        break;
      case 'TRAVELPORT':
        // SI.P1/S1/${CODE}/${CARRIER}/${TEXT}
        command = `SI.P${paxNum}${segRef}/${code}/${carrier}/${text}`;
        break;
    }

    return {
      command,
      description: `SSR ${code} for P${paxNum}: ${text}`,
      element_type: 'SSR' as const,
    };
  });
}

// ---------------------------------------------------------------------------
// OSI commands
// ---------------------------------------------------------------------------

function buildOsiCommands(gds: GdsSystem, osis: OsiElement[]): PnrCommand[] {
  return osis.map((osi) => {
    const carrier = osi.carrier.toUpperCase();
    const text = osi.text.toUpperCase();

    let command: string;
    switch (gds) {
      case 'AMADEUS':
        command = `OS ${carrier} ${text}`;
        break;
      case 'SABRE':
        command = `3OSI${carrier}/${text}`;
        break;
      case 'TRAVELPORT':
        command = `SI.${carrier}/${text}`;
        break;
    }

    return {
      command,
      description: `OSI ${carrier}: ${text}`,
      element_type: 'OSI' as const,
    };
  });
}

// ---------------------------------------------------------------------------
// DOCS SSR (APIS) commands
// ---------------------------------------------------------------------------

function buildDocsCommands(gds: GdsSystem, passengers: PnrPassenger[]): PnrCommand[] {
  const commands: PnrCommand[] = [];

  for (let i = 0; i < passengers.length; i++) {
    const pax = passengers[i]!;
    if (!pax.passport_number || !pax.date_of_birth) continue;

    const paxNum = i + 1;
    const dob = formatDateDocs(pax.date_of_birth);
    const expiry = pax.passport_expiry ? formatDateDocs(pax.passport_expiry) : '';
    const gender = pax.gender ?? 'M';
    const nationality = pax.nationality ?? '';
    const ppCountry = pax.passport_country ?? nationality;
    const surname = pax.last_name.toUpperCase();
    const firstname = pax.first_name.toUpperCase();

    let command: string;
    switch (gds) {
      case 'AMADEUS':
        // SR DOCS YY HK1/P/GB/P12345678/GB/12JAN1985/M/15JAN2030/SMITH/JOHN-P1
        command = `SR DOCS YY HK1/P/${ppCountry}/${pax.passport_number}/${nationality}/${dob}/${gender}/${expiry}/${surname}/${firstname}-P${paxNum}`;
        break;
      case 'SABRE':
        // 3DOCS/DB/12JAN1985/M/SMITH/JOHN/P/GB/P12345678/GB/15JAN2030-1.1
        command = `3DOCS/DB/${dob}/${gender}/${surname}/${firstname}/P/${ppCountry}/${pax.passport_number}/${nationality}/${expiry}-${paxNum}.1`;
        break;
      case 'TRAVELPORT':
        // SI.P1/SSRDOCSYYHK1/P/GB/P12345678/GB/12JAN1985/M/15JAN2030/SMITH/JOHN
        command = `SI.P${paxNum}/SSRDOCSYYHK1/P/${ppCountry}/${pax.passport_number}/${nationality}/${dob}/${gender}/${expiry}/${surname}/${firstname}`;
        break;
    }

    commands.push({
      command,
      description: `DOCS/APIS for P${paxNum}: ${surname}/${firstname}`,
      element_type: 'SSR',
    });
  }

  return commands;
}

// ---------------------------------------------------------------------------
// End transaction command
// ---------------------------------------------------------------------------

function buildEndTransactCommand(gds: GdsSystem): PnrCommand {
  let command: string;
  switch (gds) {
    case 'AMADEUS':
      command = 'ET';
      break;
    case 'SABRE':
      command = 'E';
      break;
    case 'TRAVELPORT':
      command = 'ER';
      break;
  }

  return {
    command,
    description: 'End transaction and save PNR',
    element_type: 'END_TRANSACT',
  };
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildPnrCommands(input: PnrBuilderInput): PnrBuilderOutput {
  const commands: PnrCommand[] = [];
  const isGroup = input.is_group ?? false;
  const infants = input.passengers.filter((p) => p.passenger_type === 'INF');

  // 1. Names (or group header + names)
  commands.push(...buildNameCommands(input.gds, input.passengers, isGroup, input.group_name));

  // 2. Air segments
  commands.push(...buildSegmentCommands(input.gds, input.segments));

  // 3. Contact elements
  commands.push(...buildContactCommands(input.gds, input.contacts));

  // 4. Ticketing arrangement
  commands.push(buildTicketingCommand(input.gds, input.ticketing));

  // 5. Received from
  commands.push(buildReceivedFromCommand(input.gds, input.received_from));

  // 6. SSR elements
  if (input.ssrs && input.ssrs.length > 0) {
    commands.push(...buildSsrCommands(input.gds, input.ssrs));
  }

  // 7. DOCS/APIS for passengers with passport data
  commands.push(...buildDocsCommands(input.gds, input.passengers));

  // 8. OSI elements
  if (input.osis && input.osis.length > 0) {
    commands.push(...buildOsiCommands(input.gds, input.osis));
  }

  // 9. End transaction
  commands.push(buildEndTransactCommand(input.gds));

  return {
    gds: input.gds,
    commands,
    passenger_count: input.passengers.length,
    segment_count: input.segments.length,
    is_group: isGroup,
    infant_count: infants.length,
  };
}
