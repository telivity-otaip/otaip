import { describe, expect, it } from 'vitest';
import type { ChannelCapability } from '@otaip/core';
import { CapabilityRegistry } from '../capability-registry.js';
import { amadeusCapabilities } from '../suppliers/amadeus/capabilities.js';

describe('CapabilityRegistry', () => {
  it('registers and retrieves capabilities', () => {
    const r = new CapabilityRegistry();
    r.register(amadeusCapabilities);
    expect(r.get('amadeus')).toBeDefined();
    expect(r.all()).toHaveLength(1);
  });

  it('rejects duplicate registration', () => {
    const r = new CapabilityRegistry();
    r.register(amadeusCapabilities);
    expect(() => r.register(amadeusCapabilities)).toThrow(/already registered/);
  });

  it('resolves for any carrier when wildcard', () => {
    const r = new CapabilityRegistry();
    r.register(amadeusCapabilities);
    const resolved = r.resolve('amadeus', 'BA');
    expect(resolved).toBeDefined();
    expect(resolved?.supportedFunctions).toContain('ticket');
  });

  it('returns undefined for unsupported carrier without wildcard', () => {
    const r = new CapabilityRegistry();
    const limited: ChannelCapability = {
      channelId: 'x',
      channelType: 'ndc',
      supportedCarriers: ['BA', 'AF'],
      supportedFunctions: ['search'],
      updatedAt: '2026-04-16',
    };
    r.register(limited);
    expect(r.resolve('x', 'UA')).toBeUndefined();
    expect(r.resolve('x', 'BA')).toBeDefined();
  });

  it('applies carrier restrictions as overrides', () => {
    const r = new CapabilityRegistry();
    const withOverride: ChannelCapability = {
      channelId: 'y',
      channelType: 'ndc',
      supportedCarriers: ['*'],
      supportedFunctions: ['search', 'price', 'book_held', 'ticket'],
      supportsNdcLevel: 3,
      carrier_restrictions: {
        UA: {
          supportedFunctions: ['search', 'price'],
          supportsNdcLevel: 2,
        },
      },
      updatedAt: '2026-04-16',
    };
    r.register(withOverride);
    const generic = r.resolve('y', 'BA');
    expect(generic?.supportedFunctions).toContain('ticket');
    expect(generic?.supportsNdcLevel).toBe(3);
    const restricted = r.resolve('y', 'UA');
    expect(restricted?.supportedFunctions).toEqual(['search', 'price']);
    expect(restricted?.supportsNdcLevel).toBe(2);
  });

  it('findCapable returns only channels supporting the function', () => {
    const r = new CapabilityRegistry();
    r.register(amadeusCapabilities);
    const searchChannels = r.findCapable('BA', 'search');
    expect(searchChannels).toHaveLength(1);
    expect(searchChannels[0]?.channelId).toBe('amadeus');
  });
});
