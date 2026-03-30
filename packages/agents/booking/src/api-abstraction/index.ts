/**
 * API Abstraction — Agent 3.5
 *
 * Universal HTTP client with circuit breaker, retry logic,
 * timeout handling, rate limiting, and IATA error normalization.
 *
 * Implements the base Agent interface from @otaip/core.
 */

import type {
  Agent,
  AgentInput,
  AgentOutput,
  AgentHealthStatus,
} from '@otaip/core';
import {
  AgentNotInitializedError,
  AgentInputValidationError,
} from '@otaip/core';
import type { ApiAbstractionInput, ApiAbstractionOutput, HttpMethod } from './types.js';
import { ApiClient } from './api-client.js';
import type { RequestHandler } from './api-client.js';

const VALID_METHODS = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);

export class ApiAbstraction
  implements Agent<ApiAbstractionInput, ApiAbstractionOutput>
{
  readonly id = '3.5';
  readonly name = 'API Abstraction';
  readonly version = '0.1.0';

  private initialized = false;
  private client: ApiClient;

  constructor(handler?: RequestHandler) {
    this.client = new ApiClient(handler);
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<ApiAbstractionInput>,
  ): Promise<AgentOutput<ApiAbstractionOutput>> {
    if (!this.initialized) {
      throw new AgentNotInitializedError(this.id);
    }

    this.validateInput(input.data);

    const result = await this.client.execute(input.data);

    const warnings: string[] = [];
    if (result.circuit_breaker.state !== 'closed') {
      warnings.push(`Circuit breaker for ${input.data.request.provider_id} is ${result.circuit_breaker.state}`);
    }
    if (result.rate_limit.request_count > result.rate_limit.max_requests * 0.8) {
      warnings.push(`Rate limit for ${input.data.request.provider_id}: ${result.rate_limit.request_count}/${result.rate_limit.max_requests} (>80%)`);
    }

    return {
      data: result,
      confidence: result.success ? 1.0 : 0.0,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        agent_id: this.id,
        agent_version: this.version,
        provider_id: input.data.request.provider_id,
        success: result.success,
        circuit_state: result.circuit_breaker.state,
      },
    };
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) {
      return { status: 'unhealthy', details: 'Not initialized. Call initialize() first.' };
    }
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
  }

  /** Expose the underlying client for direct circuit breaker / rate limit access */
  getClient(): ApiClient {
    return this.client;
  }

  private validateInput(data: ApiAbstractionInput): void {
    if (!data.request) {
      throw new AgentInputValidationError(this.id, 'request', 'Request object is required.');
    }
    if (!data.request.provider_id || typeof data.request.provider_id !== 'string') {
      throw new AgentInputValidationError(this.id, 'request.provider_id', 'Provider ID is required.');
    }
    if (!data.request.method || !VALID_METHODS.has(data.request.method)) {
      throw new AgentInputValidationError(this.id, 'request.method', 'Must be GET, POST, PUT, DELETE, or PATCH.');
    }
    if (!data.request.path || typeof data.request.path !== 'string') {
      throw new AgentInputValidationError(this.id, 'request.path', 'Path is required.');
    }
  }
}

export { ApiClient, ProviderError } from './api-client.js';
export type {
  RequestHandler,
} from './api-client.js';
export type {
  ApiAbstractionInput,
  ApiAbstractionOutput,
  ApiRequest,
  ApiResponse,
  ProviderConfig,
  ProviderType,
  CircuitState,
  CircuitBreakerStatus,
  RateLimitStatus,
  NormalizedError,
  ErrorCategory,
  HttpMethod,
} from './types.js';
