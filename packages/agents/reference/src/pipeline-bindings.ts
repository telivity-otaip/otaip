/**
 * Bindings for the OTAIP pipeline validator.
 *
 * `ReferenceAgentDataProvider` implements `@otaip/core`'s
 * `ReferenceDataProvider` interface by delegating to the three Stage 0
 * reference agents:
 *   - AirportCodeResolver (0.1)
 *   - AirlineCodeMapper   (0.2)
 *   - FareBasisDecoder    (0.3)
 *
 * This is the default wiring. Consumers that want a different data source
 * (in-memory tests, a remote reference service) can implement
 * `ReferenceDataProvider` directly and skip this adapter.
 *
 * Placed in the reference package — not in core — to avoid a circular
 * dependency (core must not depend on reference).
 */

import type {
  AirlineRef,
  AirportRef,
  FareBasisRef,
  ReferenceDataProvider,
} from '@otaip/core';
import { AirlineCodeMapper } from './airline-code-mapper/index.js';
import { AirportCodeResolver } from './airport-code-resolver/index.js';
import { FareBasisDecoder } from './fare-basis-decoder/index.js';

export interface ReferenceAgentDataProviderOptions {
  /** Optional override — pass a preconstructed resolver (e.g. for tests). */
  readonly airport?: AirportCodeResolver;
  readonly airline?: AirlineCodeMapper;
  readonly fareBasis?: FareBasisDecoder;
}

/**
 * Default `ReferenceDataProvider` implementation backed by the three
 * Stage 0 reference agents.
 */
export class ReferenceAgentDataProvider implements ReferenceDataProvider {
  private readonly airport: AirportCodeResolver;
  private readonly airline: AirlineCodeMapper;
  private readonly fareBasis: FareBasisDecoder;
  private warmed = false;

  constructor(options: ReferenceAgentDataProviderOptions = {}) {
    this.airport = options.airport ?? new AirportCodeResolver();
    this.airline = options.airline ?? new AirlineCodeMapper();
    this.fareBasis = options.fareBasis ?? new FareBasisDecoder();
  }

  /**
   * Initialize all three underlying agents. Safe to call repeatedly;
   * subsequent calls are no-ops.
   */
  async ready(): Promise<void> {
    if (this.warmed) return;
    await Promise.all([
      this.airport.initialize(),
      this.airline.initialize(),
      this.fareBasis.initialize(),
    ]);
    this.warmed = true;
  }

  async resolveAirport(code: string): Promise<AirportRef | null> {
    await this.ready();
    const result = await this.airport.execute({ data: { code } });
    const resolved = result.data.resolved_airport;
    if (resolved === null) return null;
    return {
      iataCode: resolved.iata_code ?? code,
      icaoCode: resolved.icao_code ?? undefined,
      name: resolved.name,
      city: resolved.city_name ?? undefined,
      country: resolved.country_name,
      matchConfidence: result.data.match_confidence,
    };
  }

  async resolveAirline(code: string): Promise<AirlineRef | null> {
    await this.ready();
    const result = await this.airline.execute({ data: { code } });
    const resolved = result.data.airline;
    if (resolved === null) return null;
    return {
      iataCode: resolved.iata_code ?? code,
      icaoCode: resolved.icao_code ?? undefined,
      name: resolved.name,
      matchConfidence: result.data.match_confidence,
    };
  }

  async decodeFareBasis(
    code: string,
    carrier?: string,
  ): Promise<FareBasisRef | null> {
    await this.ready();
    const result = await this.fareBasis.execute({
      data: { fare_basis: code, ...(carrier !== undefined ? { carrier } : {}) },
    });
    const decoded = result.data.decoded;
    if (decoded === null) return null;
    return {
      fareBasis: decoded.fare_basis,
      ...(carrier !== undefined ? { carrier } : {}),
      matchConfidence: result.data.match_confidence,
    };
  }
}
