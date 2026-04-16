/**
 * Channel capability registry.
 *
 * Each distribution adapter (Amadeus, Sabre, Navitaire, TripPro, Duffel,
 * HAIP) declares a static `ChannelCapability` manifest next to its
 * implementation. The registry is populated explicitly at the composition
 * root (no module-load side effects) and consulted by the GdsNdcRouter
 * (3.1) plus any other agent that needs to know which channels can
 * actually perform a given function for a given carrier.
 *
 * The `ChannelCapability` type itself lives in @otaip/core so that
 * adapters (which depend on core, not connect) can declare manifests
 * without a circular dependency.
 */

import type {
  ChannelCapability,
  ChannelFunction,
  ResolvedCapability,
} from '@otaip/core';

const DEFAULT_SCORE = 0.5;

export class CapabilityRegistry {
  private readonly manifests = new Map<string, ChannelCapability>();

  register(cap: ChannelCapability): void {
    if (this.manifests.has(cap.channelId)) {
      throw new Error(
        `CapabilityRegistry: channel '${cap.channelId}' already registered`,
      );
    }
    this.manifests.set(cap.channelId, cap);
  }

  get(channelId: string): ChannelCapability | undefined {
    return this.manifests.get(channelId);
  }

  all(): readonly ChannelCapability[] {
    return [...this.manifests.values()];
  }

  /**
   * Resolve per-carrier capabilities for a given channel. If the channel
   * defines `carrier_restrictions[carrier]`, those fields override the
   * base manifest. Returns undefined if the channel is not registered
   * OR the channel does not support the carrier (neither via
   * `supportedCarriers` nor via an explicit override).
   */
  resolve(channelId: string, carrier: string): ResolvedCapability | undefined {
    const manifest = this.manifests.get(channelId);
    if (!manifest) return undefined;
    const supportsCarrier =
      manifest.supportedCarriers.includes('*') ||
      manifest.supportedCarriers.includes(carrier) ||
      manifest.carrier_restrictions?.[carrier] !== undefined;
    if (!supportsCarrier) return undefined;
    const override = manifest.carrier_restrictions?.[carrier] ?? {};
    const resolvedNdcLevel = override.supportsNdcLevel ?? manifest.supportsNdcLevel;
    return {
      channelId: manifest.channelId,
      channelType: override.channelType ?? manifest.channelType,
      ...(resolvedNdcLevel !== undefined ? { supportsNdcLevel: resolvedNdcLevel } : {}),
      supportedFunctions:
        override.supportedFunctions ?? manifest.supportedFunctions,
      reliabilityScore:
        override.reliabilityScore ?? manifest.reliabilityScore ?? DEFAULT_SCORE,
      latencyScore: override.latencyScore ?? manifest.latencyScore ?? DEFAULT_SCORE,
      costScore: override.costScore ?? manifest.costScore ?? DEFAULT_SCORE,
    };
  }

  /** Find all channels capable of a given (carrier, function) pair. */
  findCapable(
    carrier: string,
    fn: ChannelFunction,
  ): ResolvedCapability[] {
    const hits: ResolvedCapability[] = [];
    for (const manifest of this.manifests.values()) {
      const resolved = this.resolve(manifest.channelId, carrier);
      if (resolved && resolved.supportedFunctions.includes(fn)) {
        hits.push(resolved);
      }
    }
    return hits;
  }
}
