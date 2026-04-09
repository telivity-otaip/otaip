/**
 * GDS/NDC Router Engine
 *
 * Routes booking requests to the correct distribution channel.
 */

import { createRequire } from 'node:module';
import type {
  GdsNdcRouterInput,
  GdsNdcRouterOutput,
  ChannelRouting,
  CarrierChannelConfig,
  DistributionChannel,
  GdsSystem,
  NdcVersion,
  GdsPnrFormat,
  NdcOrderFormat,
  RoutingSegment,
} from './types.js';

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

interface CarrierData {
  carriers: Record<string, CarrierChannelConfig>;
  codeshare_rules: { default_strategy: string; fallback_strategy: string };
}

const require = createRequire(import.meta.url);
const carrierData = require('./data/carrier-channels.json') as CarrierData;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCarrierConfig(iata: string): CarrierChannelConfig | undefined {
  return carrierData.carriers[iata];
}

function resolveRoutingCarrier(segment: RoutingSegment): { carrier: string; codeshare: boolean } {
  // Default strategy: use operating carrier if available
  if (segment.operating_carrier && segment.operating_carrier !== segment.marketing_carrier) {
    const opConfig = getCarrierConfig(segment.operating_carrier);
    if (opConfig) {
      return { carrier: segment.operating_carrier, codeshare: true };
    }
    // Fallback to marketing carrier if operating carrier not in config
  }
  return { carrier: segment.marketing_carrier, codeshare: false };
}

function getBookingFormat(channel: DistributionChannel): 'GDS_PNR' | 'NDC_ORDER' | 'DIRECT_API' {
  switch (channel) {
    case 'GDS':
      return 'GDS_PNR';
    case 'NDC':
      return 'NDC_ORDER';
    case 'DIRECT':
      return 'DIRECT_API';
  }
}

// ---------------------------------------------------------------------------
// Main routing
// ---------------------------------------------------------------------------

export function routeSegments(input: GdsNdcRouterInput): GdsNdcRouterOutput {
  const routings: ChannelRouting[] = [];

  for (const segment of input.segments) {
    const { carrier, codeshare } = resolveRoutingCarrier(segment);
    const config = getCarrierConfig(carrier);

    if (!config) {
      // Unknown carrier — default to GDS via AMADEUS
      routings.push({
        primary_channel: 'GDS',
        gds_system: 'AMADEUS',
        ndc_version: null,
        ndc_provider_id: null,
        fallbacks: [],
        routed_carrier: carrier,
        codeshare_applied: codeshare,
        booking_format: 'GDS_PNR',
      });
      continue;
    }

    // Determine primary channel
    let primaryChannel: DistributionChannel;
    if (input.preferred_channel && config.channels.includes(input.preferred_channel)) {
      primaryChannel = input.preferred_channel;
    } else {
      primaryChannel = config.channel_priority[0] ?? 'GDS';
    }

    // Determine GDS system
    let gdsSystem: GdsSystem | null = null;
    if (primaryChannel === 'GDS' || config.channels.includes('GDS')) {
      gdsSystem = input.preferred_gds ?? config.gds_preference ?? 'AMADEUS';
    }

    // Determine NDC version
    let ndcVersion: NdcVersion | null = null;
    let ndcProviderId: string | null = null;
    if (primaryChannel === 'NDC' && config.ndc_capable) {
      ndcVersion = config.ndc_version;
      ndcProviderId = config.ndc_provider_id;
    }

    // Build fallbacks
    const fallbacks: DistributionChannel[] = [];
    if (input.include_fallbacks) {
      for (const ch of config.channel_priority) {
        if (ch !== primaryChannel) {
          fallbacks.push(ch);
        }
      }
    }

    routings.push({
      primary_channel: primaryChannel,
      gds_system: primaryChannel === 'GDS' ? gdsSystem : null,
      ndc_version: ndcVersion,
      ndc_provider_id: ndcProviderId,
      fallbacks,
      routed_carrier: carrier,
      codeshare_applied: codeshare,
      booking_format: getBookingFormat(primaryChannel),
    });
  }

  // Determine unified channel
  const primaryChannels = new Set(routings.map((r) => r.primary_channel));
  const unifiedChannel = primaryChannels.size === 1;
  const recommendedChannel = unifiedChannel ? (routings[0]?.primary_channel ?? null) : null;

  // Build format stubs
  const gdsFormat = buildGdsFormatStub(input.segments, routings);
  const ndcFormat = buildNdcFormatStub(input.segments, routings);

  return {
    routings,
    unified_channel: unifiedChannel,
    recommended_channel: recommendedChannel,
    gds_format: gdsFormat,
    ndc_format: ndcFormat,
  };
}

// ---------------------------------------------------------------------------
// Format translation stubs
// ---------------------------------------------------------------------------

function buildGdsFormatStub(
  segments: RoutingSegment[],
  routings: ChannelRouting[],
): GdsPnrFormat | null {
  const gdsRoutings = routings.filter((r) => r.primary_channel === 'GDS');
  if (gdsRoutings.length === 0) return null;

  const gds = gdsRoutings[0]!.gds_system ?? 'AMADEUS';

  return {
    format: 'GDS_PNR',
    gds,
    record_locator: null,
    segments: segments
      .filter((_, i) => routings[i]?.primary_channel === 'GDS')
      .map((seg) => ({
        carrier: seg.marketing_carrier,
        flight_number: seg.flight_number ?? '',
        origin: seg.origin,
        destination: seg.destination,
        booking_class: '',
        date: '',
        status: 'SS',
      })),
  };
}

function buildNdcFormatStub(
  segments: RoutingSegment[],
  routings: ChannelRouting[],
): NdcOrderFormat | null {
  const ndcRoutings = routings.filter((r) => r.primary_channel === 'NDC');
  if (ndcRoutings.length === 0) return null;

  const version = ndcRoutings[0]!.ndc_version ?? '21.3';

  return {
    format: 'NDC_ORDER',
    ndc_version: version,
    order_id: null,
    offer_items: segments
      .filter((_, i) => routings[i]?.primary_channel === 'NDC')
      .map((seg) => ({
        carrier: seg.marketing_carrier,
        origin: seg.origin,
        destination: seg.destination,
        service_id: '',
      })),
  };
}
