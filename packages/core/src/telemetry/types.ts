/**
 * Telemetry — vendor-agnostic tracing and span interfaces.
 *
 * OTAIP agents emit spans via these interfaces. Consumers bring their
 * own telemetry backend (OpenTelemetry SDK, Datadog, etc.) by implementing
 * TelemetryProvider.
 *
 * Default: NoopTelemetryProvider (zero overhead when no backend is configured).
 */

export interface TelemetrySpan {
  /** Set an attribute on the span. */
  setAttribute(key: string, value: string | number | boolean): void;

  /** Mark the span as successful. */
  setOk(): void;

  /** Mark the span as errored with a message. */
  setError(message: string): void;

  /** End the span. Must be called exactly once. */
  end(): void;
}

export interface TelemetryProvider {
  /** Start a new span. The caller is responsible for calling span.end(). */
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): TelemetrySpan;
}
