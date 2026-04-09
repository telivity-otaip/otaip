import type { TelemetryProvider, TelemetrySpan } from './types.js';

const NOOP_SPAN: TelemetrySpan = {
  setAttribute(): void {},
  setOk(): void {},
  setError(): void {},
  end(): void {},
};

/**
 * NoopTelemetryProvider — zero-overhead default when no backend is configured.
 */
export class NoopTelemetryProvider implements TelemetryProvider {
  startSpan(
    _name: string,
    _attributes?: Record<string, string | number | boolean>,
  ): TelemetrySpan {
    return NOOP_SPAN;
  }
}

/**
 * Wrap an async function with a telemetry span.
 * Automatically sets status and duration, and ends the span.
 */
export async function traceAgentExecution<T>(
  provider: TelemetryProvider,
  agentName: string,
  attributes: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  const span = provider.startSpan(`otaip.agent.${agentName}`, attributes);
  const startMs = Date.now();
  try {
    const result = await fn();
    span.setAttribute('execution.duration_ms', Date.now() - startMs);
    span.setAttribute('execution.success', true);
    span.setOk();
    return result;
  } catch (error: unknown) {
    span.setAttribute('execution.duration_ms', Date.now() - startMs);
    span.setAttribute('execution.success', false);
    span.setError(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    span.end();
  }
}
