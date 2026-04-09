/**
 * Static schedule data for Schedule Lookup agent.
 *
 * In production, this would be sourced from SSIM files or GDS schedules.
 * TODO: [FUTURE] Integrate with real SSIM/GDS schedule feeds.
 */

import type { ScheduledFlight, DayOfWeek } from './types.js';

// ---------------------------------------------------------------------------
// SSIM helpers
// ---------------------------------------------------------------------------

/** Parse SSIM 7-digit binary to day names. "1111100" = Mon-Fri */
export function parseSsimDays(ssim: string): DayOfWeek[] {
  const days: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const result: DayOfWeek[] = [];
  for (let i = 0; i < 7 && i < ssim.length; i++) {
    if (ssim[i] === '1') {
      result.push(days[i]!);
    }
  }
  return result;
}

/** Check if a date falls on an operating day given SSIM string */
export function operatesOnDate(ssim: string, date: string): boolean {
  const d = new Date(date + 'T00:00:00Z');
  // getUTCDay: 0=Sun, 1=Mon, ..., 6=Sat
  // SSIM: index 0=Mon, 1=Tue, ..., 6=Sun
  const jsDay = d.getUTCDay();
  const ssimIndex = jsDay === 0 ? 6 : jsDay - 1;
  return ssim[ssimIndex] === '1';
}

/** Get the DayOfWeek for a given ISO date string */
export function getDayOfWeek(date: string): DayOfWeek {
  const days: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const d = new Date(date + 'T00:00:00Z');
  return days[d.getUTCDay()]!;
}

// ---------------------------------------------------------------------------
// Mock schedule database
// ---------------------------------------------------------------------------

const SCHEDULE_DB: ScheduledFlight[] = [
  // JFK-LAX direct flights
  {
    carrier: 'UA',
    flight_number: '1234',
    origin: 'JFK',
    destination: 'LAX',
    departure_time: '08:00',
    arrival_time: '11:30',
    duration_minutes: 330,
    aircraft: '787-9',
    schedule: {
      operating_days_ssim: '1111111',
      operating_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      effective_from: '2025-03-30',
      effective_to: '2025-10-25',
    },
    is_codeshare: false,
  },
  {
    carrier: 'DL',
    flight_number: '100',
    origin: 'JFK',
    destination: 'LAX',
    departure_time: '09:00',
    arrival_time: '12:20',
    duration_minutes: 320,
    aircraft: 'A330-900',
    schedule: {
      operating_days_ssim: '1111111',
      operating_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      effective_from: '2025-03-30',
      effective_to: '2025-10-25',
    },
    is_codeshare: false,
  },
  // Codeshare: LH markets UA1234 as LH7600
  {
    carrier: 'LH',
    flight_number: '7600',
    operating_carrier: 'UA',
    operating_flight_number: '1234',
    origin: 'JFK',
    destination: 'LAX',
    departure_time: '08:00',
    arrival_time: '11:30',
    duration_minutes: 330,
    aircraft: '787-9',
    schedule: {
      operating_days_ssim: '1111100',
      operating_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      effective_from: '2025-03-30',
      effective_to: '2025-10-25',
    },
    is_codeshare: true,
  },
  // JFK-ORD (for connection building)
  {
    carrier: 'UA',
    flight_number: '456',
    origin: 'JFK',
    destination: 'ORD',
    departure_time: '07:00',
    arrival_time: '08:30',
    duration_minutes: 150,
    aircraft: 'A320',
    schedule: {
      operating_days_ssim: '1111111',
      operating_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      effective_from: '2025-03-30',
      effective_to: '2025-10-25',
    },
    is_codeshare: false,
  },
  // ORD-LAX (for connection building)
  {
    carrier: 'UA',
    flight_number: '789',
    origin: 'ORD',
    destination: 'LAX',
    departure_time: '10:00',
    arrival_time: '12:15',
    duration_minutes: 255,
    aircraft: '737-900',
    schedule: {
      operating_days_ssim: '1111111',
      operating_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      effective_from: '2025-03-30',
      effective_to: '2025-10-25',
    },
    is_codeshare: false,
  },
  // LHR-CDG
  {
    carrier: 'BA',
    flight_number: '304',
    origin: 'LHR',
    destination: 'CDG',
    departure_time: '10:00',
    arrival_time: '12:15',
    duration_minutes: 75,
    aircraft: 'A320',
    schedule: {
      operating_days_ssim: '1111110',
      operating_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      effective_from: '2025-03-30',
      effective_to: '2025-10-25',
    },
    is_codeshare: false,
  },
  // SFO-NRT
  {
    carrier: 'NH',
    flight_number: '7',
    origin: 'SFO',
    destination: 'NRT',
    departure_time: '11:00',
    arrival_time: '14:00',
    duration_minutes: 660,
    aircraft: '787-10',
    schedule: {
      operating_days_ssim: '1111111',
      operating_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      effective_from: '2025-03-30',
      effective_to: '2025-10-25',
    },
    is_codeshare: false,
  },
  // Weekend-only flight for testing SSIM
  {
    carrier: 'AA',
    flight_number: '500',
    origin: 'JFK',
    destination: 'LAX',
    departure_time: '14:00',
    arrival_time: '17:15',
    duration_minutes: 315,
    aircraft: '777-300ER',
    schedule: {
      operating_days_ssim: '0000011',
      operating_days: ['sat', 'sun'],
      effective_from: '2025-03-30',
      effective_to: '2025-10-25',
    },
    is_codeshare: false,
  },
];

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

export interface ScheduleQuery {
  origin: string;
  destination: string;
  carrier?: string;
  flightNumber?: string;
  date: string;
  includeCodeshares: boolean;
}

export function querySchedules(query: ScheduleQuery): ScheduledFlight[] {
  let results = SCHEDULE_DB.filter(
    (f) => f.origin === query.origin && f.destination === query.destination,
  );

  if (query.carrier) {
    results = results.filter((f) => f.carrier === query.carrier);
  }

  if (query.flightNumber) {
    results = results.filter((f) => f.flight_number === query.flightNumber);
  }

  if (!query.includeCodeshares) {
    results = results.filter((f) => !f.is_codeshare);
  }

  // Filter by date (check if within effective range and operating on that day)
  results = results.filter((f) => {
    const date = query.date;
    if (date < f.schedule.effective_from || date > f.schedule.effective_to) {
      return false;
    }
    return operatesOnDate(f.schedule.operating_days_ssim, date);
  });

  return results;
}

/**
 * Find connecting flight options via common hubs.
 * TODO: [FUTURE] Use Agent 1.3 Connection Builder for MCT validation.
 */
export function findConnections(
  origin: string,
  destination: string,
  date: string,
  includeCodeshares: boolean,
): {
  firstLeg: ScheduledFlight;
  secondLeg: ScheduledFlight;
  connectionAirport: string;
  connectionMinutes: number;
}[] {
  // Find all flights from origin
  const fromOrigin = SCHEDULE_DB.filter(
    (f) => f.origin === origin && f.destination !== destination,
  );

  const connections: {
    firstLeg: ScheduledFlight;
    secondLeg: ScheduledFlight;
    connectionAirport: string;
    connectionMinutes: number;
  }[] = [];

  for (const leg1 of fromOrigin) {
    if (!includeCodeshares && leg1.is_codeshare) continue;
    if (date < leg1.schedule.effective_from || date > leg1.schedule.effective_to) continue;
    if (!operatesOnDate(leg1.schedule.operating_days_ssim, date)) continue;

    const hub = leg1.destination;

    // Find flights from hub to destination
    const fromHub = SCHEDULE_DB.filter((f) => f.origin === hub && f.destination === destination);

    for (const leg2 of fromHub) {
      if (!includeCodeshares && leg2.is_codeshare) continue;
      if (date < leg2.schedule.effective_from || date > leg2.schedule.effective_to) continue;
      if (!operatesOnDate(leg2.schedule.operating_days_ssim, date)) continue;

      // Calculate connection time using departure/arrival times
      const [arrHH, arrMM] = leg1.arrival_time.split(':').map(Number) as [number, number];
      const [depHH, depMM] = leg2.departure_time.split(':').map(Number) as [number, number];
      const arrMinutes = arrHH * 60 + arrMM;
      const depMinutes = depHH * 60 + depMM;
      const connectionMinutes = depMinutes - arrMinutes;

      // Minimum connection: 45 minutes, maximum: 8 hours
      if (connectionMinutes >= 45 && connectionMinutes <= 480) {
        connections.push({
          firstLeg: leg1,
          secondLeg: leg2,
          connectionAirport: hub,
          connectionMinutes,
        });
      }
    }
  }

  return connections;
}
