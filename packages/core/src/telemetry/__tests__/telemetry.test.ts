import { describe, it, expect, vi } from 'vitest';
import { NoopTelemetryProvider, traceAgentExecution } from '../noop-provider.js';
import type { TelemetryProvider, TelemetrySpan } from '../types.js';

describe('NoopTelemetryProvider', () => {
  it('returns a span that does nothing', () => {
    const provider = new NoopTelemetryProvider();
    const span = provider.startSpan('test');
    // Should not throw
    span.setAttribute('key', 'value');
    span.setOk();
    span.end();
  });
});

describe('traceAgentExecution', () => {
  function createMockProvider(): {
    provider: TelemetryProvider;
    span: TelemetrySpan & {
      attributes: Record<string, string | number | boolean>;
      status: string;
      ended: boolean;
    };
  } {
    const span = {
      attributes: {} as Record<string, string | number | boolean>,
      status: 'unset',
      ended: false,
      setAttribute(key: string, value: string | number | boolean): void {
        span.attributes[key] = value;
      },
      setOk(): void {
        span.status = 'ok';
      },
      setError(msg: string): void {
        span.status = `error: ${msg}`;
      },
      end(): void {
        span.ended = true;
      },
    };
    const provider: TelemetryProvider = {
      startSpan: vi.fn().mockReturnValue(span),
    };
    return { provider, span };
  }

  it('traces successful execution', async () => {
    const { provider, span } = createMockProvider();

    const result = await traceAgentExecution(
      provider,
      'test-agent',
      { 'agent.id': '1.1', 'agent.stage': '1' },
      async () => 42,
    );

    expect(result).toBe(42);
    expect(span.status).toBe('ok');
    expect(span.attributes['execution.success']).toBe(true);
    expect(span.attributes['execution.duration_ms']).toBeGreaterThanOrEqual(0);
    expect(span.ended).toBe(true);
    expect(provider.startSpan).toHaveBeenCalledWith('otaip.agent.test-agent', {
      'agent.id': '1.1',
      'agent.stage': '1',
    });
  });

  it('traces failed execution', async () => {
    const { provider, span } = createMockProvider();

    await expect(
      traceAgentExecution(provider, 'fail-agent', {}, async () => {
        throw new Error('agent boom');
      }),
    ).rejects.toThrow('agent boom');

    expect(span.status).toBe('error: agent boom');
    expect(span.attributes['execution.success']).toBe(false);
    expect(span.ended).toBe(true);
  });

  it('always ends span even on error', async () => {
    const { span, provider } = createMockProvider();

    try {
      await traceAgentExecution(provider, 'x', {}, async () => {
        throw new Error('fail');
      });
    } catch {
      // expected
    }

    expect(span.ended).toBe(true);
  });
});
