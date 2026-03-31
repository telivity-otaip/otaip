/**
 * Equipment Type Resolver — Types
 *
 * Agent 0.5: IATA aircraft equipment code resolution.
 */

export type Manufacturer = 'Boeing' | 'Airbus' | 'Embraer' | 'ATR' | 'Bombardier' | 'Other';
export type BodyType = 'narrow' | 'wide' | 'regional_jet' | 'turboprop';
export type CabinCode = 'F' | 'C' | 'W' | 'Y';

export type EquipmentOperation = 'resolve' | 'getSeatingConfig' | 'isWidebody' | 'getSimilarTypes';

export interface TypicalSeats {
  F?: number;
  C?: number;
  W?: number;
  Y: number;
  total: number;
}

export interface EquipmentInfo {
  iataCode: string;
  icaoCode: string;
  manufacturer: Manufacturer;
  family: string;
  bodyType: BodyType;
  typicalSeats: TypicalSeats;
  rangeKm: number;
  maxPaxCapacity: number;
}

export interface EquipmentTypeInput {
  operation: EquipmentOperation;
  code: string;
  cabin?: CabinCode;
}

export interface EquipmentTypeOutput {
  equipment?: EquipmentInfo;
  seatCount?: number;
  isWidebody?: boolean;
  similarTypes?: string[];
}
