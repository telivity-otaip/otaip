/**
 * Navitaire channel capability manifest.
 *
 * Navitaire is the LCC (low-cost carrier) platform used by airlines such
 * as Southwest, Wizz Air, Spirit, Allegiant, and Frontier. It is direct-
 * connect only (no GDS/NDC routing). Limited capability surface compared
 * to a full GDS — no traditional ticketing (LCCs use their own
 * e-ticket-equivalent), no exchange in the ATPCO sense.
 */

import type { ChannelCapability } from '@otaip/core';

export const navitaireCapabilities: ChannelCapability = {
  channelId: 'navitaire',
  channelType: 'lcc',
  supportedCarriers: ['*'],
  supportedFunctions: ['search', 'price', 'book_held', 'ssr', 'seat_map'],
  reliabilityScore: 0.88,
  latencyScore: 0.8,
  costScore: 0.7,
  supportsOrders: true,
  orderOperations: ['create', 'retrieve', 'change', 'cancel'],
  updatedAt: '2026-04-16',
};
