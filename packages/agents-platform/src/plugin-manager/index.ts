/**
 * Plugin Manager — Agent 9.5
 *
 * Manages third-party agent extensions and capability discovery.
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError, AgentInputValidationError } from '@otaip/core';
import type { PluginInput, PluginOutput, Plugin, PluginCapability } from './types.js';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const SEED_PLUGINS: Omit<Plugin, 'registered_at'>[] = [
  {
    plugin_id: 'duffel-adapter',
    name: 'Duffel NDC Adapter',
    version: '1.0.0',
    description: 'Duffel API distribution adapter for NDC content.',
    author: 'OTAIP',
    capabilities: ['availability_search', 'booking', 'ticketing'],
    agent_ids: ['1.1', '3.1'],
    enabled: true,
  },
  {
    plugin_id: 'amadeus-adapter',
    name: 'Amadeus GDS Adapter',
    version: '2.1.0',
    description: 'Amadeus GDS adapter for legacy distribution.',
    author: 'OTAIP',
    capabilities: ['availability_search', 'booking', 'ticketing', 'queues'],
    agent_ids: ['1.1', '3.1', '3.2', '3.4'],
    enabled: true,
  },
  {
    plugin_id: 'expense-reporter',
    name: 'Corporate Expense Reporter',
    version: '0.5.0',
    description: 'Generates expense reports from travel bookings.',
    author: 'Third Party',
    capabilities: ['reporting', 'expense_management'],
    agent_ids: ['8.4'],
    enabled: false,
  },
];

export class PluginManagerAgent implements Agent<PluginInput, PluginOutput> {
  readonly id = '9.5';
  readonly name = 'Plugin Manager';
  readonly version = '0.1.0';

  private initialized = false;
  private plugins = new Map<string, Plugin>();

  async initialize(): Promise<void> {
    this.initialized = true;
    const now = new Date().toISOString();
    for (const p of SEED_PLUGINS) {
      this.plugins.set(p.plugin_id, { ...p, registered_at: now });
    }
  }

  async execute(input: AgentInput<PluginInput>): Promise<AgentOutput<PluginOutput>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    const d = input.data;

    switch (d.operation) {
      case 'register_plugin':
        return this.handleRegister(d);
      case 'unregister_plugin':
        return this.handleUnregister(d);
      case 'list_plugins':
        return this.handleList();
      case 'get_plugin':
        return this.handleGet(d);
      case 'discover_capabilities':
        return this.handleDiscover(d);
      case 'enable_plugin':
        return this.handleToggle(d, true);
      case 'disable_plugin':
        return this.handleToggle(d, false);
      default:
        throw new AgentInputValidationError(this.id, 'operation', 'Invalid operation.');
    }
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
    this.plugins.clear();
  }

  private handleRegister(d: PluginInput): AgentOutput<PluginOutput> {
    if (!d.plugin_data)
      throw new AgentInputValidationError(this.id, 'plugin_data', 'MISSING_REQUIRED_FIELD');
    const pd = d.plugin_data;

    if (!pd.plugin_id)
      throw new AgentInputValidationError(this.id, 'plugin_id', 'MISSING_REQUIRED_FIELD');
    if (!pd.name || pd.name.trim().length === 0)
      throw new AgentInputValidationError(this.id, 'name', 'MISSING_REQUIRED_FIELD');
    if (!pd.version || !SEMVER_RE.test(pd.version))
      throw new AgentInputValidationError(this.id, 'version', 'INVALID_VERSION_FORMAT');
    if (!pd.capabilities || pd.capabilities.length === 0)
      throw new AgentInputValidationError(this.id, 'capabilities', 'MISSING_REQUIRED_FIELD');
    if (!pd.agent_ids || pd.agent_ids.length === 0)
      throw new AgentInputValidationError(this.id, 'agent_ids', 'MISSING_REQUIRED_FIELD');

    if (this.plugins.has(pd.plugin_id)) {
      throw new AgentInputValidationError(this.id, 'plugin_id', 'DUPLICATE_PLUGIN_ID');
    }

    const plugin: Plugin = {
      plugin_id: pd.plugin_id,
      name: pd.name,
      version: pd.version,
      description: pd.description ?? '',
      author: pd.author ?? '',
      capabilities: pd.capabilities,
      agent_ids: pd.agent_ids,
      enabled: pd.enabled ?? true,
      registered_at: new Date().toISOString(),
      metadata: pd.metadata,
    };

    this.plugins.set(plugin.plugin_id, plugin);

    return {
      data: { plugin, message: 'Plugin registered.' },
      confidence: 1.0,
      metadata: { agent_id: this.id },
    };
  }

  private handleUnregister(d: PluginInput): AgentOutput<PluginOutput> {
    if (!d.plugin_id)
      throw new AgentInputValidationError(this.id, 'plugin_id', 'MISSING_REQUIRED_FIELD');
    if (!this.plugins.has(d.plugin_id))
      throw new AgentInputValidationError(this.id, 'plugin_id', 'PLUGIN_NOT_FOUND');

    this.plugins.delete(d.plugin_id);

    return {
      data: { message: `Plugin ${d.plugin_id} unregistered.` },
      confidence: 1.0,
      metadata: { agent_id: this.id },
    };
  }

  private handleList(): AgentOutput<PluginOutput> {
    return {
      data: { plugins: [...this.plugins.values()] },
      confidence: 1.0,
      metadata: { agent_id: this.id, plugin_count: this.plugins.size },
    };
  }

  private handleGet(d: PluginInput): AgentOutput<PluginOutput> {
    if (!d.plugin_id)
      throw new AgentInputValidationError(this.id, 'plugin_id', 'MISSING_REQUIRED_FIELD');
    const plugin = this.plugins.get(d.plugin_id);
    if (!plugin) throw new AgentInputValidationError(this.id, 'plugin_id', 'PLUGIN_NOT_FOUND');
    return { data: { plugin }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private handleDiscover(d: PluginInput): AgentOutput<PluginOutput> {
    const enabledPlugins = [...this.plugins.values()].filter((p) => p.enabled);

    if (d.capability) {
      const matching = enabledPlugins.filter((p) => p.capabilities.includes(d.capability!));
      const capabilities: PluginCapability[] = [
        {
          capability: d.capability,
          plugin_ids: matching.map((p) => p.plugin_id),
        },
      ];
      return { data: { capabilities }, confidence: 1.0, metadata: { agent_id: this.id } };
    }

    // No filter — return all capabilities across enabled plugins
    const capMap = new Map<string, string[]>();
    for (const p of enabledPlugins) {
      for (const cap of p.capabilities) {
        const list = capMap.get(cap) ?? [];
        list.push(p.plugin_id);
        capMap.set(cap, list);
      }
    }

    const capabilities: PluginCapability[] = [...capMap.entries()].map(([cap, ids]) => ({
      capability: cap,
      plugin_ids: ids,
    }));

    return { data: { capabilities }, confidence: 1.0, metadata: { agent_id: this.id } };
  }

  private handleToggle(d: PluginInput, enable: boolean): AgentOutput<PluginOutput> {
    if (!d.plugin_id)
      throw new AgentInputValidationError(this.id, 'plugin_id', 'MISSING_REQUIRED_FIELD');
    const plugin = this.plugins.get(d.plugin_id);
    if (!plugin) throw new AgentInputValidationError(this.id, 'plugin_id', 'PLUGIN_NOT_FOUND');

    plugin.enabled = enable;

    return {
      data: { plugin, message: `Plugin ${d.plugin_id} ${enable ? 'enabled' : 'disabled'}.` },
      confidence: 1.0,
      metadata: { agent_id: this.id },
    };
  }
}

export type {
  PluginInput,
  PluginOutput,
  Plugin,
  PluginCapability,
  PluginOperation,
} from './types.js';
