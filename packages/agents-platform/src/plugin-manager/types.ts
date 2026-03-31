/**
 * Plugin Manager — Types
 *
 * Agent 9.5: Third-party agent extensions and capability discovery.
 */

export type PluginOperation =
  | 'register_plugin' | 'unregister_plugin' | 'list_plugins'
  | 'get_plugin' | 'discover_capabilities' | 'enable_plugin' | 'disable_plugin';

export interface Plugin {
  plugin_id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  capabilities: string[];
  agent_ids: string[];
  enabled: boolean;
  registered_at: string;
  metadata?: Record<string, unknown>;
}

export interface PluginCapability {
  capability: string;
  plugin_ids: string[];
}

export interface PluginInput {
  operation: PluginOperation;
  plugin_id?: string;
  plugin_data?: Omit<Plugin, 'registered_at' | 'enabled'> & { enabled?: boolean; metadata?: Record<string, unknown> };
  capability?: string;
}

export interface PluginOutput {
  plugin?: Plugin;
  plugins?: Plugin[];
  capabilities?: PluginCapability[];
  message?: string;
}
