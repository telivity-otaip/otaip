/**
 * Duty of Care — Agent 8.5
 *
 * Locates travelers in active itineraries during disruptions.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type {
  DutyCareInput,
  DutyCareOutput,
  TravelerItinerary,
  LocatedTraveler,
  DestinationRisk,
  RiskLevel,
} from './types.js';

const AIRPORT_RE = /^[A-Z]{3}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

// Static risk data — ~20 countries. Note: live threat intelligence is out of scope.
const RISK_DATA: Record<string, { name: string; level: RiskLevel; note: string }> = {
  US: { name: 'United States', level: 'low', note: 'Generally safe for travelers.' },
  GB: { name: 'United Kingdom', level: 'low', note: 'Generally safe for travelers.' },
  DE: { name: 'Germany', level: 'low', note: 'Generally safe for travelers.' },
  FR: { name: 'France', level: 'low', note: 'Generally safe. Exercise normal precautions.' },
  JP: { name: 'Japan', level: 'low', note: 'Very safe for travelers.' },
  SG: { name: 'Singapore', level: 'low', note: 'Very safe for travelers.' },
  AU: { name: 'Australia', level: 'low', note: 'Generally safe for travelers.' },
  CA: { name: 'Canada', level: 'low', note: 'Generally safe for travelers.' },
  AE: {
    name: 'United Arab Emirates',
    level: 'low',
    note: 'Generally safe. Observe local customs.',
  },
  MX: { name: 'Mexico', level: 'medium', note: 'Exercise increased caution in certain regions.' },
  BR: {
    name: 'Brazil',
    level: 'medium',
    note: 'Exercise increased caution, especially in urban areas.',
  },
  IN: { name: 'India', level: 'medium', note: 'Exercise increased caution.' },
  ZA: { name: 'South Africa', level: 'medium', note: 'Exercise increased caution due to crime.' },
  TR: { name: 'Turkey', level: 'medium', note: 'Exercise increased caution.' },
  EG: { name: 'Egypt', level: 'medium', note: 'Exercise increased caution.' },
  NG: { name: 'Nigeria', level: 'high', note: 'Reconsider travel. Risk of terrorism and crime.' },
  PK: { name: 'Pakistan', level: 'high', note: 'Reconsider travel. Risk of terrorism.' },
  IQ: { name: 'Iraq', level: 'critical', note: 'Do not travel. Armed conflict and terrorism.' },
  AF: {
    name: 'Afghanistan',
    level: 'critical',
    note: 'Do not travel. Armed conflict and terrorism.',
  },
  SY: { name: 'Syria', level: 'critical', note: 'Do not travel. Civil war and terrorism.' },
};

export class DutyCareAgent implements Agent<DutyCareInput, DutyCareOutput> {
  readonly id = '8.5';
  readonly name = 'Duty of Care';
  readonly version = '0.1.0';

  private initialized = false;
  private itineraries = new Map<string, TravelerItinerary>();
  private accountedFor = new Map<string, Set<string>>(); // incident_id → Set<traveler_id>

  getItineraryStore(): Map<string, TravelerItinerary> {
    return this.itineraries;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(input: AgentInput<DutyCareInput>): Promise<AgentOutput<DutyCareOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const d = input.data;

    switch (d.operation) {
      case 'locate_travelers':
        return this.handleLocate(d);
      case 'get_traveler_itinerary':
        return this.handleGetItinerary(d);
      case 'assess_destination_risk':
        return this.handleRisk(d);
      case 'mark_accounted_for':
        return this.handleAccountedFor(d);
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Invalid operation.');
    }
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
    this.itineraries.clear();
    this.accountedFor.clear();
  }

  private handleLocate(d: DutyCareInput): AgentOutput<DutyCareOutput> {
    if (!d.date)
      throw new AgentInputValidationError(this.id, 'date', 'Required for locate_travelers.');
    if (d.airport_code && !AIRPORT_RE.test(d.airport_code)) {
      throw new AgentInputValidationError(this.id, 'airport_code', 'INVALID_AIRPORT_CODE');
    }
    if (d.country_code && !COUNTRY_RE.test(d.country_code)) {
      throw new AgentInputValidationError(this.id, 'country_code', 'Must be ISO 2-letter code.');
    }

    const windowHours = d.window_hours ?? 24;
    const targetDate = new Date(d.date);
    const windowStart = new Date(targetDate.getTime() - windowHours * 60 * 60 * 1000);
    const windowEnd = new Date(targetDate.getTime() + windowHours * 60 * 60 * 1000);

    const travelers: LocatedTraveler[] = [];

    for (const itin of this.itineraries.values()) {
      if (d.corporate_id && itin.corporate_id !== d.corporate_id) continue;

      for (const seg of itin.segments) {
        const depTime = new Date(`${seg.departure_date}T${seg.departure_time}:00Z`);
        const arrTime = new Date(`${seg.arrival_date}T${seg.arrival_time}:00Z`);

        const inWindow = depTime >= windowStart && depTime <= windowEnd;
        const arrInWindow = arrTime >= windowStart && arrTime <= windowEnd;

        let matchesLocation = false;
        let currentLocation = '';

        if (d.airport_code) {
          if (seg.origin === d.airport_code && inWindow) {
            matchesLocation = true;
            currentLocation = seg.origin;
          }
          if (seg.destination === d.airport_code && arrInWindow) {
            matchesLocation = true;
            currentLocation = seg.destination;
          }
        } else {
          // No specific airport — match any segment in window
          if (inWindow || arrInWindow) {
            matchesLocation = true;
            currentLocation = inWindow ? seg.origin : seg.destination;
          }
        }

        if (matchesLocation) {
          const isAccounted = this.isAccountedFor(itin.traveler_id, d);
          travelers.push({
            traveler_id: itin.traveler_id,
            given_name: itin.given_name,
            surname: itin.surname,
            contact_phone: itin.contact_phone,
            contact_email: itin.contact_email,
            current_location: currentLocation,
            status: inWindow ? 'IN_TRANSIT' : 'AT_DESTINATION',
            next_flight: `${seg.carrier}${seg.flight_number}`,
            accounted_for: isAccounted,
            corporate_id: itin.corporate_id,
            department: itin.department,
          });
          break; // one match per traveler is sufficient
        }
      }
    }

    return {
      data: { travelers },
      confidence: 1.0,
      metadata: { agent_id: this.id, travelers_found: travelers.length },
    };
  }

  private handleGetItinerary(d: DutyCareInput): AgentOutput<DutyCareOutput> {
    if (!d.traveler_id) throw new AgentInputValidationError(this.id, 'traveler_id', 'Required.');
    const itin = this.itineraries.get(d.traveler_id);
    if (!itin) throw new AgentInputValidationError(this.id, 'traveler_id', 'TRAVELER_NOT_FOUND');
    return { data: { itinerary: itin }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private handleRisk(d: DutyCareInput): AgentOutput<DutyCareOutput> {
    if (!d.destination_country || !COUNTRY_RE.test(d.destination_country)) {
      throw new AgentInputValidationError(
        this.id,
        'destination_country',
        'Must be ISO 2-letter code.',
      );
    }

    const data = RISK_DATA[d.destination_country];
    const risk: DestinationRisk = data
      ? {
          country_code: d.destination_country,
          country_name: data.name,
          risk_level: data.level,
          note: data.note,
        }
      : {
          country_code: d.destination_country,
          country_name: 'Unknown',
          risk_level: 'medium',
          note: 'No specific risk data available. Exercise normal caution. Live threat intelligence is out of scope.',
        };

    const warnings =
      risk.risk_level === 'high' || risk.risk_level === 'critical'
        ? [`${risk.country_name}: ${risk.risk_level} risk — ${risk.note}`]
        : undefined;

    return { data: { risk }, confidence: 1.0, warnings, metadata: { agent_id: this.id } };
  }

  private handleAccountedFor(d: DutyCareInput): AgentOutput<DutyCareOutput> {
    if (!d.traveler_id) throw new AgentInputValidationError(this.id, 'traveler_id', 'Required.');
    if (!d.incident_id) throw new AgentInputValidationError(this.id, 'incident_id', 'Required.');

    const set = this.accountedFor.get(d.incident_id) ?? new Set<string>();
    set.add(d.traveler_id);
    this.accountedFor.set(d.incident_id, set);

    return {
      data: {
        accounted_for: true,
        message: `Traveler ${d.traveler_id} marked accounted for incident ${d.incident_id}.`,
      },
      confidence: 1.0,
      metadata: { agent_id: this.id },
    };
  }

  private isAccountedFor(travelerId: string, d: DutyCareInput): boolean {
    if (!d.incident_id) return false;
    return this.accountedFor.get(d.incident_id)?.has(travelerId) ?? false;
  }
}

export type {
  DutyCareInput,
  DutyCareOutput,
  TravelerItinerary,
  LocatedTraveler,
  DestinationRisk,
  RiskLevel,
  TravelerStatus,
  DutyCareOperation,
} from './types.js';
