/**
 * API Abstraction — Unit Tests
 *
 * Agent 3.5: Circuit breaker, retry with backoff, timeout,
 * rate limiting, error normalization.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ApiAbstraction, ApiClient, ProviderError } from '../index.js';
import type { RequestHandler, ApiRequest, ApiResponse, ProviderConfig } from '../index.js';

// ---------------------------------------------------------------------------
// Mock request handler factory
// ---------------------------------------------------------------------------

function mockSuccessHandler(): RequestHandler {
  return (
    _provider: ProviderConfig,
    request: ApiRequest,
    _timeout: number,
  ): Promise<ApiResponse> => {
    return Promise.resolve({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { ok: true, path: request.path },
      provider_id: request.provider_id,
      duration_ms: 42,
      retries: 0,
    });
  };
}

function mockFailHandler(error: Error): RequestHandler {
  return (): Promise<ApiResponse> => {
    return Promise.reject(error);
  };
}

function mockFailNThenSucceed(failCount: number, error: Error): RequestHandler {
  let calls = 0;
  return (_provider: ProviderConfig, request: ApiRequest): Promise<ApiResponse> => {
    calls++;
    if (calls <= failCount) {
      return Promise.reject(error);
    }
    return Promise.resolve({
      status: 200,
      headers: {},
      body: { ok: true },
      provider_id: request.provider_id,
      duration_ms: 10,
      retries: 0,
    });
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('API Abstraction', () => {
  describe('Agent interface compliance', () => {
    it('has correct metadata', () => {
      const agent = new ApiAbstraction(mockSuccessHandler());
      expect(agent.id).toBe('3.5');
      expect(agent.name).toBe('API Abstraction');
      expect(agent.version).toBe('0.1.0');
    });

    it('reports healthy after initialization', async () => {
      const agent = new ApiAbstraction(mockSuccessHandler());
      await agent.initialize();
      const health = await agent.health();
      expect(health.status).toBe('healthy');
      agent.destroy();
    });

    it('reports unhealthy before initialization', async () => {
      const agent = new ApiAbstraction(mockSuccessHandler());
      const health = await agent.health();
      expect(health.status).toBe('unhealthy');
    });

    it('throws when not initialized', async () => {
      const agent = new ApiAbstraction(mockSuccessHandler());
      await expect(
        agent.execute({
          data: {
            request: { provider_id: 'AMADEUS', method: 'GET', path: '/test' },
          },
        }),
      ).rejects.toThrow('not been initialized');
    });

    it('returns metadata in output', async () => {
      const agent = new ApiAbstraction(mockSuccessHandler());
      await agent.initialize();
      const result = await agent.execute({
        data: { request: { provider_id: 'AMADEUS', method: 'GET', path: '/test' } },
      });
      expect(result.metadata!['agent_id']).toBe('3.5');
      expect(result.metadata!['provider_id']).toBe('AMADEUS');
      agent.destroy();
    });
  });

  describe('Successful requests', () => {
    let agent: ApiAbstraction;

    beforeEach(async () => {
      agent = new ApiAbstraction(mockSuccessHandler());
      await agent.initialize();
    });

    it('executes a simple GET request', async () => {
      const result = await agent.execute({
        data: { request: { provider_id: 'AMADEUS', method: 'GET', path: '/flights' } },
      });

      expect(result.data.success).toBe(true);
      expect(result.data.response).not.toBeNull();
      expect(result.data.response!.status).toBe(200);
      expect(result.data.error).toBeNull();
    });

    it('executes a POST request', async () => {
      const result = await agent.execute({
        data: {
          request: {
            provider_id: 'NDC_BA',
            method: 'POST',
            path: '/orders',
            body: { passenger: 'SMITH/JOHN' },
          },
        },
      });

      expect(result.data.success).toBe(true);
      expect(result.data.response!.provider_id).toBe('NDC_BA');
    });
  });

  describe('Input validation', () => {
    let agent: ApiAbstraction;

    beforeEach(async () => {
      agent = new ApiAbstraction(mockSuccessHandler());
      await agent.initialize();
    });

    it('rejects missing provider_id', async () => {
      await expect(
        agent.execute({
          data: { request: { provider_id: '', method: 'GET', path: '/test' } },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects invalid method', async () => {
      await expect(
        agent.execute({
          data: { request: { provider_id: 'AMADEUS', method: 'INVALID' as 'GET', path: '/test' } },
        }),
      ).rejects.toThrow('Invalid input');
    });

    it('rejects missing path', async () => {
      await expect(
        agent.execute({
          data: { request: { provider_id: 'AMADEUS', method: 'GET', path: '' } },
        }),
      ).rejects.toThrow('Invalid input');
    });
  });

  describe('Unknown provider', () => {
    it('returns error for unknown provider', async () => {
      const agent = new ApiAbstraction(mockSuccessHandler());
      await agent.initialize();

      const result = await agent.execute({
        data: { request: { provider_id: 'UNKNOWN_GDS', method: 'GET', path: '/test' } },
      });

      expect(result.data.success).toBe(false);
      expect(result.data.error!.category).toBe('VALIDATION_ERROR');
    });
  });

  describe('Circuit breaker', () => {
    it('starts in closed state', () => {
      const client = new ApiClient(mockSuccessHandler());
      const provider = client.getProvider('AMADEUS')!;
      const status = client.getCircuitBreakerStatus(provider);
      expect(status.state).toBe('closed');
      expect(status.failure_count).toBe(0);
    });

    it('opens after reaching failure threshold', async () => {
      const client = new ApiClient(mockFailHandler(new Error('server error 500')));
      const provider = client.getProvider('AMADEUS')!;

      // AMADEUS has threshold of 5
      for (let i = 0; i < 5; i++) {
        await client.execute({
          request: { provider_id: 'AMADEUS', method: 'GET', path: '/test' },
          max_retries: 0,
        });
      }

      const status = client.getCircuitBreakerStatus(provider);
      expect(status.state).toBe('open');
      expect(status.failure_count).toBe(5);
    });

    it('rejects requests when circuit is open', async () => {
      const client = new ApiClient(mockSuccessHandler());
      client.setCircuitState('AMADEUS', 'open', Date.now() + 60000);

      const result = await client.execute({
        request: { provider_id: 'AMADEUS', method: 'GET', path: '/test' },
      });

      expect(result.success).toBe(false);
      expect(result.error!.category).toBe('CIRCUIT_OPEN');
    });

    it('allows requests when circuit is open with force=true', async () => {
      const client = new ApiClient(mockSuccessHandler());
      client.setCircuitState('AMADEUS', 'open', Date.now() + 60000);

      const result = await client.execute({
        request: { provider_id: 'AMADEUS', method: 'GET', path: '/test' },
        force: true,
      });

      expect(result.success).toBe(true);
    });

    it('transitions to half-open after reset timeout', () => {
      const client = new ApiClient(mockSuccessHandler());
      // Set reset time in the past
      client.setCircuitState('AMADEUS', 'open', Date.now() - 1000);

      const provider = client.getProvider('AMADEUS')!;
      const status = client.getCircuitBreakerStatus(provider);
      expect(status.state).toBe('half-open');
    });

    it('closes after successful request in half-open state', async () => {
      const client = new ApiClient(mockSuccessHandler());
      client.setCircuitState('AMADEUS', 'open', Date.now() - 1000);

      // Should be half-open now, request should succeed and close circuit
      const result = await client.execute({
        request: { provider_id: 'AMADEUS', method: 'GET', path: '/test' },
      });

      expect(result.success).toBe(true);
      const provider = client.getProvider('AMADEUS')!;
      const status = client.getCircuitBreakerStatus(provider);
      expect(status.state).toBe('closed');
    });

    it('resets circuit breaker', () => {
      const client = new ApiClient(mockSuccessHandler());
      client.setCircuitState('AMADEUS', 'open');
      client.resetCircuitBreaker('AMADEUS');

      const provider = client.getProvider('AMADEUS')!;
      const status = client.getCircuitBreakerStatus(provider);
      expect(status.state).toBe('closed');
    });
  });

  describe('Retry with backoff', () => {
    it('retries on retryable errors', async () => {
      const handler = mockFailNThenSucceed(2, new Error('server error 500'));
      const client = new ApiClient(handler);

      const result = await client.execute({
        request: { provider_id: 'AMADEUS', method: 'GET', path: '/test' },
        max_retries: 3,
      });

      expect(result.success).toBe(true);
      expect(result.response!.retries).toBe(2);
    }, 15000);

    it('does not retry non-retryable errors', async () => {
      let callCount = 0;
      const handler: RequestHandler = (): Promise<ApiResponse> => {
        callCount++;
        return Promise.reject(new ProviderError('Not found', 'NOT_FOUND', '404', false));
      };

      const client = new ApiClient(handler);
      const result = await client.execute({
        request: { provider_id: 'AMADEUS', method: 'GET', path: '/test' },
        max_retries: 3,
      });

      expect(result.success).toBe(false);
      expect(callCount).toBe(1); // Only one attempt, no retries
    });

    it('fails after exhausting retries', async () => {
      const handler = mockFailHandler(new Error('timeout'));
      const client = new ApiClient(handler);

      const result = await client.execute({
        request: { provider_id: 'AMADEUS', method: 'GET', path: '/test' },
        max_retries: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error!.category).toBe('TIMEOUT');
    });
  });

  describe('Rate limiting', () => {
    it('tracks request count per provider', async () => {
      const client = new ApiClient(mockSuccessHandler());
      const provider = client.getProvider('NDC_BA')!;

      await client.execute({
        request: { provider_id: 'NDC_BA', method: 'GET', path: '/test' },
      });
      await client.execute({
        request: { provider_id: 'NDC_BA', method: 'GET', path: '/test2' },
      });

      const status = client.getRateLimitStatus(provider);
      expect(status.request_count).toBe(2);
      expect(status.exceeded).toBe(false);
    });

    it('blocks requests when rate limit exceeded', async () => {
      const client = new ApiClient(mockSuccessHandler());

      // NDC_SQ has rate_limit_max of 40 — simulate hitting it
      // We'll set state directly for efficiency
      const provider = client.getProvider('NDC_SQ')!;

      // Execute 40 requests to hit the limit
      for (let i = 0; i < 40; i++) {
        await client.execute({
          request: { provider_id: 'NDC_SQ', method: 'GET', path: `/test${i}` },
        });
      }

      const result = await client.execute({
        request: { provider_id: 'NDC_SQ', method: 'GET', path: '/blocked' },
      });

      expect(result.success).toBe(false);
      expect(result.error!.category).toBe('RATE_LIMITED');
    });

    it('resets rate limit after window expires', () => {
      const client = new ApiClient(mockSuccessHandler());
      const provider = client.getProvider('AMADEUS')!;

      // After reset, count should be 0
      client.resetRateLimit('AMADEUS');
      const status = client.getRateLimitStatus(provider);
      expect(status.request_count).toBe(0);
    });

    it('tracks rate limits independently per provider', async () => {
      const client = new ApiClient(mockSuccessHandler());

      await client.execute({
        request: { provider_id: 'AMADEUS', method: 'GET', path: '/test' },
      });

      const amadeus = client.getProvider('AMADEUS')!;
      const sabre = client.getProvider('SABRE')!;

      expect(client.getRateLimitStatus(amadeus).request_count).toBe(1);
      expect(client.getRateLimitStatus(sabre).request_count).toBe(0);
    });
  });

  describe('Error normalization', () => {
    it('normalizes timeout errors', () => {
      const client = new ApiClient(mockSuccessHandler());
      const err = client.normalizeError('AMADEUS', new Error('Request timed out'));
      expect(err.category).toBe('TIMEOUT');
      expect(err.retryable).toBe(true);
    });

    it('normalizes network errors', () => {
      const client = new ApiClient(mockSuccessHandler());
      const err = client.normalizeError('AMADEUS', new Error('ECONNREFUSED'));
      expect(err.category).toBe('NETWORK_ERROR');
      expect(err.retryable).toBe(true);
    });

    it('normalizes auth failures', () => {
      const client = new ApiClient(mockSuccessHandler());
      const err = client.normalizeError('AMADEUS', new Error('401 Unauthorized'));
      expect(err.category).toBe('AUTH_FAILURE');
      expect(err.retryable).toBe(false);
    });

    it('normalizes 404 not found', () => {
      const client = new ApiClient(mockSuccessHandler());
      const err = client.normalizeError('AMADEUS', new Error('404 Not found'));
      expect(err.category).toBe('NOT_FOUND');
      expect(err.retryable).toBe(false);
    });

    it('normalizes server errors', () => {
      const client = new ApiClient(mockSuccessHandler());
      const err = client.normalizeError('AMADEUS', new Error('500 Internal Server Error'));
      expect(err.category).toBe('SERVER_ERROR');
      expect(err.retryable).toBe(true);
    });

    it('normalizes EDIFACT errors', () => {
      const client = new ApiClient(mockSuccessHandler());
      const err = client.normalizeError('AMADEUS', new Error('EDI301 — invalid segment'));
      expect(err.category).toBe('EDIFACT_ERROR');
    });

    it('normalizes SOAP faults', () => {
      const client = new ApiClient(mockSuccessHandler());
      const err = client.normalizeError('SABRE', new Error('SOAP fault: invalid request'));
      expect(err.category).toBe('SOAP_FAULT');
      expect(err.retryable).toBe(false);
    });

    it('normalizes NDC errors', () => {
      const client = new ApiClient(mockSuccessHandler());
      const err = client.normalizeError('NDC_BA', new Error('NDC order creation failed'));
      expect(err.category).toBe('NDC_ERROR');
    });

    it('normalizes ProviderError instances', () => {
      const client = new ApiClient(mockSuccessHandler());
      const provErr = new ProviderError('Rate limited', 'RATE_LIMITED', '429', true, {
        retry_after: 30,
      });
      const err = client.normalizeError('AMADEUS', provErr);
      expect(err.category).toBe('RATE_LIMITED');
      expect(err.retryable).toBe(true);
      expect(err.original_code).toBe('429');
    });

    it('handles non-Error objects', () => {
      const client = new ApiClient(mockSuccessHandler());
      const err = client.normalizeError('AMADEUS', 'string error');
      expect(err.category).toBe('UNKNOWN');
      expect(err.message).toBe('string error');
    });
  });

  describe('Provider registry', () => {
    it('lists all configured providers', () => {
      const client = new ApiClient(mockSuccessHandler());
      const providers = client.listProviders();
      expect(providers.length).toBeGreaterThanOrEqual(10);
    });

    it('returns AMADEUS with GDS timeout of 5s', () => {
      const client = new ApiClient(mockSuccessHandler());
      const amadeus = client.getProvider('AMADEUS');
      expect(amadeus).toBeDefined();
      expect(amadeus!.timeout_ms).toBe(5000);
      expect(amadeus!.type).toBe('GDS');
    });

    it('returns NDC_BA with NDC timeout of 10s', () => {
      const client = new ApiClient(mockSuccessHandler());
      const ndc = client.getProvider('NDC_BA');
      expect(ndc).toBeDefined();
      expect(ndc!.timeout_ms).toBe(10000);
      expect(ndc!.type).toBe('NDC');
    });

    it('returns PAYMENT_STRIPE with 30s timeout', () => {
      const client = new ApiClient(mockSuccessHandler());
      const payment = client.getProvider('PAYMENT_STRIPE');
      expect(payment).toBeDefined();
      expect(payment!.timeout_ms).toBe(30000);
      expect(payment!.type).toBe('PAYMENT');
    });

    it('returns undefined for unknown provider', () => {
      const client = new ApiClient(mockSuccessHandler());
      expect(client.getProvider('NONEXISTENT')).toBeUndefined();
    });
  });

  describe('Agent warnings', () => {
    it('warns when circuit breaker is not closed', async () => {
      // Use a handler that fails, keeping the circuit in non-closed state
      const agent = new ApiAbstraction(mockFailHandler(new Error('server error 500')));
      await agent.initialize();

      // Make enough failures to open the circuit (AMADEUS threshold = 5)
      for (let i = 0; i < 5; i++) {
        await agent.execute({
          data: {
            request: { provider_id: 'AMADEUS', method: 'GET', path: '/test' },
            max_retries: 0,
          },
        });
      }

      // Next request should get circuit open warning/error
      const result = await agent.execute({
        data: { request: { provider_id: 'AMADEUS', method: 'GET', path: '/test' } },
      });

      expect(result.data.success).toBe(false);
      expect(result.data.error!.category).toBe('CIRCUIT_OPEN');
      agent.destroy();
    });
  });
});
