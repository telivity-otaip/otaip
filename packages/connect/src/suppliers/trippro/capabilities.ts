/**
 * TripPro channel capability manifest.
 *
 * TripPro is an aggregator of GDS + NDC sources. It offers search and
 * pricing; ticketing goes through whichever upstream source it routes to.
 */

import type { ChannelCapability } from '@otaip/core';

export const tripproCapabilities: ChannelCapability = {
  channelId: 'trippro',
  channelType: 'aggregator',
  supportedCarriers: ['*'],
  supportedFunctions: ['search', 'price'],
  reliabilityScore: 0.85,
  latencyScore: 0.65,
  costScore: 0.6,
  updatedAt: '2026-04-16',
};
