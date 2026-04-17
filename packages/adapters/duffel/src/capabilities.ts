/**
 * Duffel channel capability manifest.
 *
 * Duffel is an NDC aggregator with direct access to 20+ airlines. It
 * offers search, price, instant ticketing (where the carrier supports
 * instant issue), and order management. No traditional GDS services.
 */

import type { ChannelCapability } from '@otaip/core';

export const duffelCapabilities: ChannelCapability = {
  channelId: 'duffel',
  channelType: 'ndc',
  supportsNdcLevel: 3,
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
  latencyScore: 0.78,
  costScore: 0.65,
  supportsOrders: true,
  orderOperations: ['create', 'retrieve', 'change', 'cancel'],
  updatedAt: '2026-04-16',
};
