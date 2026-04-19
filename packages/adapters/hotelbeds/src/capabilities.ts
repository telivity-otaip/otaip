/**
 * Hotelbeds channel capability manifest.
 *
 * The OTAIP `ChannelCapability` type in `@otaip/core` is shaped for air
 * (NDC level, IATA carriers, ticketing). Lodging needs a different shape;
 * rather than overload the air type, this module declares a parallel
 * `LodgingChannelCapability` so the lodging-orchestration layer has a
 * structured manifest to read.
 *
 * NOT exporting through @otaip/core to avoid scope creep — when the
 * lodging orchestration layer needs a shared shape it can promote this
 * locally-defined type up.
 */

export type LodgingChannelKind = 'bedbank' | 'gds' | 'direct' | 'ota';

export interface LodgingChannelCapability {
  channelId: string;
  channelKind: LodgingChannelKind;
  /** ISO 3166 country codes the channel sources content from (or "*"). */
  supportedMarkets: string[];
  supportedFunctions: Array<
    | 'availability'
    | 'check_rate'
    | 'book'
    | 'modify'
    | 'cancel_simulation'
    | 'cancel'
    | 'list_bookings'
    | 'get_booking'
  >;
  /** True if `net` is the bedbank cost and the platform sets the markup. */
  setsRetailPrice: false;
  /** Test-environment quota — Hotelbeds caps the sandbox at 50 req/day. */
  testEnvDailyRequestLimit?: number;
  /** Adapter version string for telemetry. */
  updatedAt: string;
}

export const hotelbedsCapabilities: LodgingChannelCapability = {
  channelId: 'hotelbeds',
  channelKind: 'bedbank',
  supportedMarkets: ['*'],
  supportedFunctions: [
    'availability',
    'check_rate',
    'book',
    'cancel_simulation',
    'cancel',
    'list_bookings',
    'get_booking',
  ],
  setsRetailPrice: false,
  testEnvDailyRequestLimit: 50,
  updatedAt: '2026-04-18',
};
