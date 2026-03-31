/**
 * Plugin Manager — Unit Tests (Agent 9.5)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PluginManagerAgent } from '../index.js';
import type { PluginInput } from '../types.js';

let agent: PluginManagerAgent;

beforeAll(async () => {
  agent = new PluginManagerAgent();
  await agent.initialize();
});

afterAll(() => { agent.destroy(); });

// Note: beforeEach does NOT clear — seed data persists. Tests that need clean state re-init.

describe('Plugin Manager', () => {
  describe('Seed data', () => {
    it('has 3 seed plugins', async () => {
      const res = await agent.execute({ data: { operation: 'list_plugins' } });
      expect(res.data.plugins!.length).toBe(3);
    });
  });

  describe('register_plugin', () => {
    it('registers new plugin', async () => {
      const res = await agent.execute({ data: {
        operation: 'register_plugin',
        plugin_data: {
          plugin_id: 'test-plugin', name: 'Test Plugin', version: '1.0.0',
          description: 'A test plugin', author: 'Tester',
          capabilities: ['testing'], agent_ids: ['0.1'],
        },
      } });
      expect(res.data.plugin!.plugin_id).toBe('test-plugin');
      expect(res.data.plugin!.enabled).toBe(true);
    });

    it('rejects duplicate plugin_id', async () => {
      await expect(agent.execute({ data: {
        operation: 'register_plugin',
        plugin_data: {
          plugin_id: 'duffel-adapter', name: 'Dupe', version: '1.0.0',
          description: '', author: '', capabilities: ['x'], agent_ids: ['0.1'],
        },
      } })).rejects.toThrow('DUPLICATE_PLUGIN_ID');
    });

    it('rejects invalid semver', async () => {
      await expect(agent.execute({ data: {
        operation: 'register_plugin',
        plugin_data: {
          plugin_id: 'bad-ver', name: 'Bad', version: 'not-semver',
          description: '', author: '', capabilities: ['x'], agent_ids: ['0.1'],
        },
      } })).rejects.toThrow('INVALID_VERSION_FORMAT');
    });

    it('rejects empty capabilities', async () => {
      await expect(agent.execute({ data: {
        operation: 'register_plugin',
        plugin_data: {
          plugin_id: 'no-cap', name: 'NoCap', version: '1.0.0',
          description: '', author: '', capabilities: [], agent_ids: ['0.1'],
        },
      } })).rejects.toThrow('MISSING_REQUIRED_FIELD');
    });

    it('rejects empty name', async () => {
      await expect(agent.execute({ data: {
        operation: 'register_plugin',
        plugin_data: {
          plugin_id: 'no-name', name: '', version: '1.0.0',
          description: '', author: '', capabilities: ['x'], agent_ids: ['0.1'],
        },
      } })).rejects.toThrow('MISSING_REQUIRED_FIELD');
    });
  });

  describe('get_plugin', () => {
    it('gets plugin by ID', async () => {
      const res = await agent.execute({ data: { operation: 'get_plugin', plugin_id: 'duffel-adapter' } });
      expect(res.data.plugin!.name).toBe('Duffel NDC Adapter');
    });

    it('throws PLUGIN_NOT_FOUND', async () => {
      await expect(agent.execute({ data: { operation: 'get_plugin', plugin_id: 'nonexistent' } })).rejects.toThrow('PLUGIN_NOT_FOUND');
    });
  });

  describe('unregister_plugin', () => {
    it('removes plugin', async () => {
      // Register then unregister
      await agent.execute({ data: {
        operation: 'register_plugin',
        plugin_data: {
          plugin_id: 'to-remove', name: 'Remove Me', version: '1.0.0',
          description: '', author: '', capabilities: ['x'], agent_ids: ['0.1'],
        },
      } });
      await agent.execute({ data: { operation: 'unregister_plugin', plugin_id: 'to-remove' } });
      await expect(agent.execute({ data: { operation: 'get_plugin', plugin_id: 'to-remove' } })).rejects.toThrow('PLUGIN_NOT_FOUND');
    });
  });

  describe('enable/disable', () => {
    it('disables plugin', async () => {
      const res = await agent.execute({ data: { operation: 'disable_plugin', plugin_id: 'amadeus-adapter' } });
      expect(res.data.plugin!.enabled).toBe(false);
    });

    it('enables plugin', async () => {
      await agent.execute({ data: { operation: 'disable_plugin', plugin_id: 'amadeus-adapter' } });
      const res = await agent.execute({ data: { operation: 'enable_plugin', plugin_id: 'amadeus-adapter' } });
      expect(res.data.plugin!.enabled).toBe(true);
    });

    it('enable is idempotent', async () => {
      const res = await agent.execute({ data: { operation: 'enable_plugin', plugin_id: 'duffel-adapter' } });
      expect(res.data.plugin!.enabled).toBe(true);
    });
  });

  describe('discover_capabilities', () => {
    it('discovers all capabilities from enabled plugins', async () => {
      // Make sure amadeus-adapter is enabled
      await agent.execute({ data: { operation: 'enable_plugin', plugin_id: 'amadeus-adapter' } });
      const res = await agent.execute({ data: { operation: 'discover_capabilities' } });
      expect(res.data.capabilities!.length).toBeGreaterThan(0);
      expect(res.data.capabilities!.some((c) => c.capability === 'availability_search')).toBe(true);
    });

    it('filters by capability', async () => {
      const res = await agent.execute({ data: { operation: 'discover_capabilities', capability: 'booking' } });
      expect(res.data.capabilities!).toHaveLength(1);
      expect(res.data.capabilities![0]!.capability).toBe('booking');
      expect(res.data.capabilities![0]!.plugin_ids.length).toBeGreaterThan(0);
    });

    it('excludes disabled plugins', async () => {
      // expense-reporter is disabled by default
      const res = await agent.execute({ data: { operation: 'discover_capabilities', capability: 'expense_management' } });
      expect(res.data.capabilities![0]!.plugin_ids).toHaveLength(0);
    });
  });

  describe('Agent compliance', () => {
    it('has correct id/name', () => { expect(agent.id).toBe('9.5'); });
    it('reports healthy', async () => { expect((await agent.health()).status).toBe('healthy'); });
    it('throws when not initialized', async () => {
      const u = new PluginManagerAgent();
      await expect(u.execute({ data: { operation: 'list_plugins' } })).rejects.toThrow('not been initialized');
    });
  });
});
