/**
 * Amadeus channel capability manifest.
 *
 * Amadeus is a full-service GDS with mature NDC support (level 3 for
 * a growing list of carriers). This manifest intentionally uses
 * conservative defaults: base behaviour is full GDS, NDC capability is
 * asserted only for carriers we have evidence for.
 *
 * Add carrier-specific NDC data via `carrier_restrictions` when IATA
 * tracker or airline developer-portal evidence is available.
 */

import type { ChannelCapability } from '@otaip/core';

export const amadeusCapabilities: ChannelCapability = {
  channelId: 'amadeus',
  channelType: 'gds',
  supportedCarriers: ['*'],
  supportedFunctions: [
    'search',
    'price',
    'book_held',
    'ticket',
    'refund',
    'exchange',
    'ssr',
    'seat_map',
  ],
  reliabilityScore: 0.92,
  latencyScore: 0.7,
  costScore: 0.5,
  updatedAt: '2026-04-16',
};
