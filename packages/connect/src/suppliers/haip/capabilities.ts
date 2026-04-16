/**
 * HAIP (Hotel Availability Interactive Protocol) channel capability manifest.
 *
 * HAIP is a hotel channel — different function surface from the flight
 * adapters. Included for completeness; GdsNdcRouter flight-routing logic
 * filters by `channelType` so HAIP is naturally excluded from flight
 * routing decisions.
 */

import type { ChannelCapability } from '@otaip/core';

export const haipCapabilities: ChannelCapability = {
  channelId: 'haip',
  channelType: 'aggregator',
  supportedCarriers: [],
  supportedFunctions: ['search', 'price', 'book_held'],
  reliabilityScore: 0.85,
  latencyScore: 0.7,
  costScore: 0.55,
  updatedAt: '2026-04-16',
};
