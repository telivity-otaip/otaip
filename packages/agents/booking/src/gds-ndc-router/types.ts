/**
 * GDS/NDC Router — Types
 *
 * Agent 3.1: Routes booking requests to the correct distribution channel.
 */

export type DistributionChannel = 'GDS' | 'NDC' | 'DIRECT';

export type NdcVersion = '17.2' | '18.1' | '21.3';

export type GdsSystem = 'AMADEUS' | 'SABRE' | 'TRAVELPORT';

export interface CarrierChannelConfig {
  name: string;
  channels: DistributionChannel[];
  channel_priority: DistributionChannel[];
  ndc_version: NdcVersion | null;
  gds_preference: GdsSystem | null;
  ndc_capable: boolean;
  ndc_provider_id: string | null;
}

export interface RoutingSegment {
  /** Marketing carrier IATA code */
  marketing_carrier: string;
  /** Operating carrier IATA code (if different from marketing) */
  operating_carrier?: string;
  /** Origin airport */
  origin: string;
  /** Destination airport */
  destination: string;
  /** Flight number */
  flight_number?: string;
}

export interface GdsNdcRouterInput {
  /** Segments to route */
  segments: RoutingSegment[];
  /** Preferred channel (optional override) */
  preferred_channel?: DistributionChannel;
  /** Preferred GDS (optional override) */
  preferred_gds?: GdsSystem;
  /** Whether to include fallback channels */
  include_fallbacks: boolean;
}

// ---------------------------------------------------------------------------
// Format translation stubs (types only — no real API calls)
// ---------------------------------------------------------------------------

/** GDS PNR format stub */
export interface GdsPnrFormat {
  format: 'GDS_PNR';
  gds: GdsSystem;
  record_locator: string | null;
  segments: GdsPnrSegment[];
}

export interface GdsPnrSegment {
  carrier: string;
  flight_number: string;
  origin: string;
  destination: string;
  booking_class: string;
  date: string;
  status: string;
}

/** NDC Order format stub */
export interface NdcOrderFormat {
  format: 'NDC_ORDER';
  ndc_version: NdcVersion;
  order_id: string | null;
  offer_items: NdcOfferItem[];
}

export interface NdcOfferItem {
  carrier: string;
  origin: string;
  destination: string;
  service_id: string;
}

// ---------------------------------------------------------------------------
// Routing result
// ---------------------------------------------------------------------------

export interface ChannelRouting {
  /** Primary channel to use */
  primary_channel: DistributionChannel;
  /** GDS system (if channel is GDS) */
  gds_system: GdsSystem | null;
  /** NDC version (if channel is NDC) */
  ndc_version: NdcVersion | null;
  /** NDC provider ID from API abstraction layer */
  ndc_provider_id: string | null;
  /** Fallback channels in priority order */
  fallbacks: DistributionChannel[];
  /** The carrier code used for routing decision */
  routed_carrier: string;
  /** Whether codeshare routing was applied */
  codeshare_applied: boolean;
  /** Expected booking format */
  booking_format: 'GDS_PNR' | 'NDC_ORDER' | 'DIRECT_API';
}

export interface GdsNdcRouterOutput {
  /** Per-segment routing decisions */
  routings: ChannelRouting[];
  /** Whether all segments can be routed through the same channel */
  unified_channel: boolean;
  /** Recommended channel for the entire itinerary */
  recommended_channel: DistributionChannel | null;
  /** Format translation stubs */
  gds_format: GdsPnrFormat | null;
  ndc_format: NdcOrderFormat | null;
}
