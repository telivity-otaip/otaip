/**
 * Registry Adapter — tests.
 *
 * Verifies that buildCarrierCapabilities() produces ChannelCapability
 * entries that correctly encode the carrier-channels.json data.
 */

import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '@otaip/connect';
import { buildCarrierCapabilities, getCarrierData } from '../registry-adapter.js';

describe('buildCarrierCapabilities', () => {
  const caps = buildCarrierCapabilities();

  it('produces at least one capability per carrier in the JSON', () => {
    const carrierData = getCarrierData();
    const carrierCount = Object.keys(carrierData.carriers).length;
    // Each carrier gets at least one channel entry.
    expect(caps.length).toBeGreaterThanOrEqual(carrierCount);
  });

  it('NDC-preferred carriers get an NDC channel entry', () => {
    const baNdc = caps.find((c) => c.channelId === 'ndc-ba');
    expect(baNdc).toBeDefined();
    expect(baNdc!.channelType).toBe('ndc');
    expect(baNdc!.supportedCarriers).toEqual(['BA']);
    expect(baNdc!.supportsNdcLevel).toBe(4); // 21.3 → level 4
    expect(baNdc!.reliabilityScore).toBe(0.9); // primary channel
  });

  it('GDS-only carriers get only a GDS channel entry', () => {
    const dlGds = caps.find((c) => c.channelId === 'gds-dl');
    const dlNdc = caps.find((c) => c.channelId === 'ndc-dl');
    expect(dlGds).toBeDefined();
    expect(dlGds!.channelType).toBe('gds');
    expect(dlNdc).toBeUndefined();
  });

  it('DIRECT-only carriers get an LCC channel entry', () => {
    const wnDirect = caps.find((c) => c.channelId === 'direct-wn');
    expect(wnDirect).toBeDefined();
    expect(wnDirect!.channelType).toBe('lcc');
    expect(wnDirect!.supportedCarriers).toEqual(['WN']);
  });

  it('GDS-preferred carriers have higher GDS reliability score', () => {
    const uaGds = caps.find((c) => c.channelId === 'gds-ua');
    const uaNdc = caps.find((c) => c.channelId === 'ndc-ua');
    expect(uaGds).toBeDefined();
    expect(uaNdc).toBeDefined();
    // UA is GDS-preferred → GDS reliability > NDC reliability for this carrier.
    expect(uaGds!.reliabilityScore).toBeGreaterThan(uaNdc!.reliabilityScore!);
  });

  it('all capabilities register cleanly in a CapabilityRegistry', () => {
    const registry = new CapabilityRegistry();
    for (const cap of caps) {
      registry.register(cap);
    }
    expect(registry.all().length).toBe(caps.length);
  });

  it('registry.findCapable returns correct channels for BA search', () => {
    const registry = new CapabilityRegistry();
    for (const cap of caps) {
      registry.register(cap);
    }
    const baSearch = registry.findCapable('BA', 'search');
    expect(baSearch.length).toBeGreaterThanOrEqual(2); // NDC + GDS
    const types = baSearch.map((c) => c.channelType);
    expect(types).toContain('ndc');
    expect(types).toContain('gds');
  });

  it('registry.findCapable returns only DIRECT for WN', () => {
    const registry = new CapabilityRegistry();
    for (const cap of caps) {
      registry.register(cap);
    }
    const wnSearch = registry.findCapable('WN', 'search');
    expect(wnSearch).toHaveLength(1);
    expect(wnSearch[0]!.channelType).toBe('lcc');
  });
});
