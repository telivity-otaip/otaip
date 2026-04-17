/**
 * Channel capability types.
 *
 * Lives in @otaip/core so that adapters, the capability registry
 * (@otaip/connect), and pipeline agents can share a single `ChannelCapability`
 * shape without creating a circular dep between core and connect.
 *
 * The `CapabilityRegistry` class implementation lives in @otaip/connect.
 */

export type ChannelType = 'gds' | 'ndc' | 'lcc' | 'aggregator';

export type ChannelFunction =
  | 'search'
  | 'price'
  | 'book_held'
  | 'ticket'
  | 'refund'
  | 'exchange'
  | 'ssr'
  | 'seat_map';

export interface ChannelCapability {
  readonly channelId: string;
  readonly channelType: ChannelType;
  /** Airlines supported. Use `['*']` for "all carriers the channel contracts". */
  readonly supportedCarriers: readonly string[];
  readonly supportedFunctions: readonly ChannelFunction[];
  /** NDC level (IATA NDC leveling 1-4). Undefined for non-NDC channels. */
  readonly supportsNdcLevel?: 1 | 2 | 3 | 4;
  /** Stable scores 0..1 used by router weighting. Seeded constants. */
  readonly reliabilityScore?: number;
  readonly latencyScore?: number;
  readonly costScore?: number;
  /** Per-carrier overrides — narrows capabilities for specific carriers. */
  readonly carrier_restrictions?: Readonly<Record<string, Partial<ChannelCapability>>>;
  /** Whether this channel supports the ONE Order / Offers & Orders model. */
  readonly supportsOrders?: boolean;
  /** Which AIDM 24.1 order operations this channel supports. */
  readonly orderOperations?: readonly ('create' | 'retrieve' | 'change' | 'cancel')[];
  /** ISO timestamp stamped on the manifest when it was last reviewed. */
  readonly updatedAt: string;
}

export interface ResolvedCapability {
  readonly channelId: string;
  readonly channelType: ChannelType;
  readonly supportsNdcLevel?: 1 | 2 | 3 | 4;
  readonly supportedFunctions: readonly ChannelFunction[];
  readonly reliabilityScore: number;
  readonly latencyScore: number;
  readonly costScore: number;
}
