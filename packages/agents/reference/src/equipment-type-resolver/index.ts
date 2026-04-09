/**
 * Equipment Type Resolver — Agent 0.5
 *
 * Resolves IATA aircraft equipment codes to structured equipment data.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type { EquipmentTypeInput, EquipmentTypeOutput, EquipmentInfo } from './types.js';

// ---------- Static dataset ----------
const EQUIPMENT_DB: EquipmentInfo[] = [
  // Boeing
  {
    iataCode: '73H',
    icaoCode: 'B738',
    manufacturer: 'Boeing',
    family: '737 Next Generation',
    bodyType: 'narrow',
    typicalSeats: { C: 16, Y: 144, total: 160 },
    rangeKm: 5765,
    maxPaxCapacity: 189,
  },
  {
    iataCode: '738',
    icaoCode: 'B738',
    manufacturer: 'Boeing',
    family: '737 Next Generation',
    bodyType: 'narrow',
    typicalSeats: { C: 16, Y: 144, total: 160 },
    rangeKm: 5765,
    maxPaxCapacity: 189,
  },
  {
    iataCode: '739',
    icaoCode: 'B739',
    manufacturer: 'Boeing',
    family: '737 Next Generation',
    bodyType: 'narrow',
    typicalSeats: { C: 16, Y: 159, total: 175 },
    rangeKm: 5084,
    maxPaxCapacity: 220,
  },
  {
    iataCode: '77W',
    icaoCode: 'B77W',
    manufacturer: 'Boeing',
    family: '777',
    bodyType: 'wide',
    typicalSeats: { F: 8, C: 42, W: 24, Y: 232, total: 306 },
    rangeKm: 13649,
    maxPaxCapacity: 396,
  },
  {
    iataCode: '788',
    icaoCode: 'B788',
    manufacturer: 'Boeing',
    family: '787 Dreamliner',
    bodyType: 'wide',
    typicalSeats: { C: 28, W: 21, Y: 191, total: 240 },
    rangeKm: 13621,
    maxPaxCapacity: 381,
  },
  {
    iataCode: '789',
    icaoCode: 'B789',
    manufacturer: 'Boeing',
    family: '787 Dreamliner',
    bodyType: 'wide',
    typicalSeats: { C: 30, W: 21, Y: 223, total: 274 },
    rangeKm: 14140,
    maxPaxCapacity: 420,
  },
  {
    iataCode: '77L',
    icaoCode: 'B77L',
    manufacturer: 'Boeing',
    family: '777',
    bodyType: 'wide',
    typicalSeats: { F: 8, C: 40, W: 24, Y: 195, total: 267 },
    rangeKm: 17395,
    maxPaxCapacity: 317,
  },
  {
    iataCode: '744',
    icaoCode: 'B744',
    manufacturer: 'Boeing',
    family: '747',
    bodyType: 'wide',
    typicalSeats: { F: 12, C: 52, W: 32, Y: 270, total: 366 },
    rangeKm: 13450,
    maxPaxCapacity: 524,
  },
  {
    iataCode: '748',
    icaoCode: 'B748',
    manufacturer: 'Boeing',
    family: '747',
    bodyType: 'wide',
    typicalSeats: { F: 12, C: 48, W: 32, Y: 273, total: 365 },
    rangeKm: 14815,
    maxPaxCapacity: 467,
  },
  {
    iataCode: '752',
    icaoCode: 'B752',
    manufacturer: 'Boeing',
    family: '757',
    bodyType: 'narrow',
    typicalSeats: { C: 22, Y: 166, total: 188 },
    rangeKm: 7222,
    maxPaxCapacity: 239,
  },
  {
    iataCode: '764',
    icaoCode: 'B764',
    manufacturer: 'Boeing',
    family: '767',
    bodyType: 'wide',
    typicalSeats: { C: 35, W: 28, Y: 182, total: 245 },
    rangeKm: 10415,
    maxPaxCapacity: 304,
  },
  // Airbus
  {
    iataCode: '320',
    icaoCode: 'A320',
    manufacturer: 'Airbus',
    family: 'A320',
    bodyType: 'narrow',
    typicalSeats: { C: 12, Y: 138, total: 150 },
    rangeKm: 6100,
    maxPaxCapacity: 180,
  },
  {
    iataCode: '319',
    icaoCode: 'A319',
    manufacturer: 'Airbus',
    family: 'A320',
    bodyType: 'narrow',
    typicalSeats: { C: 8, Y: 116, total: 124 },
    rangeKm: 6950,
    maxPaxCapacity: 160,
  },
  {
    iataCode: '321',
    icaoCode: 'A321',
    manufacturer: 'Airbus',
    family: 'A320',
    bodyType: 'narrow',
    typicalSeats: { C: 16, Y: 169, total: 185 },
    rangeKm: 5950,
    maxPaxCapacity: 236,
  },
  {
    iataCode: '332',
    icaoCode: 'A332',
    manufacturer: 'Airbus',
    family: 'A330',
    bodyType: 'wide',
    typicalSeats: { C: 36, W: 21, Y: 190, total: 247 },
    rangeKm: 13450,
    maxPaxCapacity: 406,
  },
  {
    iataCode: '333',
    icaoCode: 'A333',
    manufacturer: 'Airbus',
    family: 'A330',
    bodyType: 'wide',
    typicalSeats: { C: 36, W: 21, Y: 220, total: 277 },
    rangeKm: 11750,
    maxPaxCapacity: 440,
  },
  {
    iataCode: '343',
    icaoCode: 'A343',
    manufacturer: 'Airbus',
    family: 'A340',
    bodyType: 'wide',
    typicalSeats: { C: 30, W: 21, Y: 216, total: 267 },
    rangeKm: 13700,
    maxPaxCapacity: 375,
  },
  {
    iataCode: '346',
    icaoCode: 'A346',
    manufacturer: 'Airbus',
    family: 'A340',
    bodyType: 'wide',
    typicalSeats: { F: 8, C: 42, W: 32, Y: 222, total: 304 },
    rangeKm: 14600,
    maxPaxCapacity: 380,
  },
  {
    iataCode: '388',
    icaoCode: 'A388',
    manufacturer: 'Airbus',
    family: 'A380',
    bodyType: 'wide',
    typicalSeats: { F: 14, C: 76, W: 44, Y: 365, total: 499 },
    rangeKm: 15200,
    maxPaxCapacity: 853,
  },
  {
    iataCode: '359',
    icaoCode: 'A359',
    manufacturer: 'Airbus',
    family: 'A350',
    bodyType: 'wide',
    typicalSeats: { C: 36, W: 24, Y: 253, total: 313 },
    rangeKm: 15000,
    maxPaxCapacity: 440,
  },
  {
    iataCode: '351',
    icaoCode: 'A351',
    manufacturer: 'Airbus',
    family: 'A350',
    bodyType: 'wide',
    typicalSeats: { C: 40, W: 32, Y: 288, total: 360 },
    rangeKm: 16100,
    maxPaxCapacity: 480,
  },
  {
    iataCode: '32A',
    icaoCode: 'A20N',
    manufacturer: 'Airbus',
    family: 'A320neo',
    bodyType: 'narrow',
    typicalSeats: { C: 12, Y: 138, total: 150 },
    rangeKm: 6300,
    maxPaxCapacity: 194,
  },
  {
    iataCode: '32B',
    icaoCode: 'A21N',
    manufacturer: 'Airbus',
    family: 'A320neo',
    bodyType: 'narrow',
    typicalSeats: { C: 16, Y: 180, total: 196 },
    rangeKm: 7400,
    maxPaxCapacity: 244,
  },
  {
    iataCode: '32N',
    icaoCode: 'A20N',
    manufacturer: 'Airbus',
    family: 'A320neo',
    bodyType: 'narrow',
    typicalSeats: { C: 12, Y: 138, total: 150 },
    rangeKm: 6300,
    maxPaxCapacity: 194,
  },
  // Embraer
  {
    iataCode: 'E90',
    icaoCode: 'E190',
    manufacturer: 'Embraer',
    family: 'E-Jet',
    bodyType: 'regional_jet',
    typicalSeats: { Y: 100, total: 100 },
    rangeKm: 4537,
    maxPaxCapacity: 114,
  },
  {
    iataCode: 'E95',
    icaoCode: 'E195',
    manufacturer: 'Embraer',
    family: 'E-Jet',
    bodyType: 'regional_jet',
    typicalSeats: { Y: 118, total: 118 },
    rangeKm: 4260,
    maxPaxCapacity: 132,
  },
  {
    iataCode: 'E75',
    icaoCode: 'E170',
    manufacturer: 'Embraer',
    family: 'E-Jet',
    bodyType: 'regional_jet',
    typicalSeats: { Y: 76, total: 76 },
    rangeKm: 3704,
    maxPaxCapacity: 88,
  },
  {
    iataCode: 'E70',
    icaoCode: 'E170',
    manufacturer: 'Embraer',
    family: 'E-Jet',
    bodyType: 'regional_jet',
    typicalSeats: { Y: 72, total: 72 },
    rangeKm: 3982,
    maxPaxCapacity: 80,
  },
  // ATR
  {
    iataCode: 'AT7',
    icaoCode: 'AT72',
    manufacturer: 'ATR',
    family: 'ATR',
    bodyType: 'turboprop',
    typicalSeats: { Y: 70, total: 70 },
    rangeKm: 1528,
    maxPaxCapacity: 78,
  },
  {
    iataCode: 'AT5',
    icaoCode: 'AT45',
    manufacturer: 'ATR',
    family: 'ATR',
    bodyType: 'turboprop',
    typicalSeats: { Y: 48, total: 48 },
    rangeKm: 1326,
    maxPaxCapacity: 50,
  },
  // Bombardier
  {
    iataCode: 'DH4',
    icaoCode: 'DH8D',
    manufacturer: 'Bombardier',
    family: 'Dash 8',
    bodyType: 'turboprop',
    typicalSeats: { Y: 74, total: 74 },
    rangeKm: 2040,
    maxPaxCapacity: 90,
  },
  {
    iataCode: 'CR9',
    icaoCode: 'CRJ9',
    manufacturer: 'Bombardier',
    family: 'CRJ',
    bodyType: 'regional_jet',
    typicalSeats: { C: 12, Y: 64, total: 76 },
    rangeKm: 2876,
    maxPaxCapacity: 90,
  },
  {
    iataCode: 'CR7',
    icaoCode: 'CRJ7',
    manufacturer: 'Bombardier',
    family: 'CRJ',
    bodyType: 'regional_jet',
    typicalSeats: { C: 8, Y: 58, total: 66 },
    rangeKm: 2653,
    maxPaxCapacity: 78,
  },
];

const CODE_MAP = new Map<string, EquipmentInfo>();
for (const eq of EQUIPMENT_DB) {
  CODE_MAP.set(eq.iataCode.toUpperCase(), eq);
}

function lookupEquipment(code: string): EquipmentInfo | undefined {
  return CODE_MAP.get(code.toUpperCase());
}

export class EquipmentTypeResolver implements Agent<EquipmentTypeInput, EquipmentTypeOutput> {
  readonly id = '0.5';
  readonly name = 'Equipment Type Resolver';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(input: AgentInput<EquipmentTypeInput>): Promise<AgentOutput<EquipmentTypeOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const d = input.data;
    if (!d.code) throw new AgentInputValidationError(this.id, 'code', 'Equipment code required.');

    switch (d.operation) {
      case 'resolve': {
        const eq = lookupEquipment(d.code);
        return {
          data: { equipment: eq ?? undefined },
          confidence: eq ? 1.0 : 0,
          metadata: { agent_id: this.id },
        };
      }
      case 'getSeatingConfig': {
        if (!d.cabin)
          throw new AgentInputValidationError(
            this.id,
            'cabin',
            'Cabin code required for getSeatingConfig.',
          );
        const eq = lookupEquipment(d.code);
        const seatCount = eq ? (eq.typicalSeats[d.cabin] ?? null) : null;
        return {
          data: { seatCount: seatCount ?? undefined },
          confidence: eq ? 1.0 : 0,
          metadata: { agent_id: this.id },
        };
      }
      case 'isWidebody': {
        const eq = lookupEquipment(d.code);
        return {
          data: { isWidebody: eq ? eq.bodyType === 'wide' : undefined },
          confidence: eq ? 1.0 : 0,
          metadata: { agent_id: this.id },
        };
      }
      case 'getSimilarTypes': {
        const eq = lookupEquipment(d.code);
        if (!eq)
          return { data: { similarTypes: [] }, confidence: 0, metadata: { agent_id: this.id } };
        const similar = EQUIPMENT_DB.filter(
          (e) =>
            e.manufacturer === eq.manufacturer &&
            e.bodyType === eq.bodyType &&
            e.iataCode !== eq.iataCode,
        ).map((e) => e.iataCode);
        return {
          data: { similarTypes: similar },
          confidence: 1.0,
          metadata: { agent_id: this.id },
        };
      }
      default:
        throw new AgentInputValidationError(
          this.id,
          'operation',
          'Must be resolve, getSeatingConfig, isWidebody, or getSimilarTypes.',
        );
    }
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
  }
}

export type {
  EquipmentTypeInput,
  EquipmentTypeOutput,
  EquipmentInfo,
  Manufacturer,
  BodyType,
  CabinCode,
  TypicalSeats,
  EquipmentOperation,
} from './types.js';
