/**
 * Fare Shopping — Input/Output types
 *
 * Agent 1.4: Multi-source fare comparison with fare basis decoding,
 * class mapping, branded fare family grouping, and passenger type pricing.
 */

import type { SearchOffer, PassengerCount } from '@otaip/core';

export type FareFamily = 'basic' | 'standard' | 'flex' | 'premium' | 'unknown';

export interface FareShoppingInput {
  /** Origin airport IATA code */
  origin: string;
  /** Destination airport IATA code */
  destination: string;
  /** Departure date (ISO 8601 YYYY-MM-DD) */
  departure_date: string;
  /** Passengers for pricing */
  passengers: PassengerCount[];
  /** Cabin class filter */
  cabin_class?: 'economy' | 'premium_economy' | 'business' | 'first';
  /** Currency for pricing (ISO 4217) */
  currency?: string;
  /** Whether to decode fare basis codes. Default: true */
  decode_fare_basis?: boolean;
  /** Whether to group by fare family. Default: true */
  group_by_fare_family?: boolean;
  /** Adapter names to query */
  sources?: string[];
}

export interface DecodedFareBasisInfo {
  /** Raw fare basis code */
  fare_basis: string;
  /** Decoded cabin class */
  cabin_class: string;
  /** Whether refundable */
  refundable: boolean;
  /** Advance purchase days (null if not specified) */
  advance_purchase_days: number | null;
  /** Decoded fare family classification */
  fare_family: FareFamily;
}

export interface ClassOfServiceInfo {
  /** Booking class letter */
  booking_class: string;
  /** Cabin class */
  cabin_class: string;
  /** Fare tier description */
  tier: string;
}

export interface FareOffer {
  /** The underlying search offer */
  offer: SearchOffer;
  /** Decoded fare basis information (if decode_fare_basis=true) */
  fare_basis_decoded: DecodedFareBasisInfo[] | null;
  /** Class of service information */
  class_of_service: ClassOfServiceInfo[] | null;
  /** Classified fare family */
  fare_family: FareFamily;
  /** Per-passenger-type price breakdown */
  passenger_pricing: PassengerPricing[];
}

export interface PassengerPricing {
  /** Passenger type */
  type: 'ADT' | 'CHD' | 'INF';
  /** Count of this type */
  count: number;
  /** Per-person fare */
  per_person_total: number;
  /** Subtotal for all passengers of this type */
  subtotal: number;
}

export interface FareFamilyGroup {
  /** Fare family name */
  family: FareFamily;
  /** All fare offers in this family */
  offers: FareOffer[];
  /** Cheapest offer in this family */
  cheapest_total: number;
  /** Most expensive in this family */
  most_expensive_total: number;
}

export interface FareShoppingOutput {
  /** All fare offers (sorted by price) */
  fares: FareOffer[];
  /** Grouped by fare family (if group_by_fare_family=true) */
  fare_families: FareFamilyGroup[] | null;
  /** Total fares found */
  total_fares: number;
  /** Source summary */
  sources_queried: string[];
}
