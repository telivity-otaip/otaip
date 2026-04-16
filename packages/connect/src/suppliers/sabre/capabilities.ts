/**
 * Sabre channel capability manifest.
 */

import type { ChannelCapability } from '@otaip/core';

export const sabreCapabilities: ChannelCapability = {
  channelId: 'sabre',
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
  reliabilityScore: 0.9,
  latencyScore: 0.72,
  costScore: 0.55,
  updatedAt: '2026-04-16',
};
