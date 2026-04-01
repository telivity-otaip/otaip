/**
 * STUB — Generates an OpenAPI 3.1 spec from a ConnectAdapter.
 * Full implementation comes in a separate build.
 */

import type { ConnectAdapter } from '../../types.js';

export interface OpenAPIGeneratorConfig {
  title: string;
  version: string;
  serverUrl: string;
}

export function generateOpenAPISpec(
  _adapter: ConnectAdapter,
  _config: OpenAPIGeneratorConfig,
): Record<string, unknown> {
  throw new Error('Not implemented — OpenAPI generator is a stub');
}
