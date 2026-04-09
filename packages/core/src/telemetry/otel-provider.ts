/**
 * OpenTelemetry bridge — wraps @opentelemetry/api to implement OTAIP's TelemetryProvider.
 *
 * Requires @opentelemetry/api as a peer dependency.
 * If not installed, construction throws with a clear message.
 *
 * Consumers set up their own OTLP exporter and TracerProvider:
 * ```typescript
 * import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
 * import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
 * import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
 *
 * const provider = new NodeTracerProvider();
 * provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter()));
 * provider.register();
 *
 * // Then use OTAIP's OTelTelemetryProvider:
 * const telemetry = new OTelTelemetryProvider('otaip');
 * ```
 */

import type { TelemetryProvider, TelemetrySpan } from './types.js';

interface OTelSpan {
  setAttribute(key: string, value: string | number | boolean): OTelSpan;
  setStatus(status: { code: number; message?: string }): OTelSpan;
  end(): void;
}

interface OTelTracer {
  startSpan(name: string): OTelSpan;
}

interface OTelApi {
  trace: {
    getTracer(name: string, version?: string): OTelTracer;
  };
  SpanStatusCode: {
    OK: number;
    ERROR: number;
  };
}

export class OTelTelemetryProvider implements TelemetryProvider {
  private readonly tracer: OTelTracer;
  private readonly statusCode: { OK: number; ERROR: number };

  constructor(serviceName: string, version = '0.3.0') {
    let api: OTelApi;
    try {
      api = require('@opentelemetry/api') as OTelApi;
    } catch {
      throw new Error(
        'OTelTelemetryProvider requires @opentelemetry/api. ' +
          'Install it with: npm install @opentelemetry/api',
      );
    }

    this.tracer = api.trace.getTracer(serviceName, version);
    this.statusCode = api.SpanStatusCode;
  }

  startSpan(
    name: string,
    attributes?: Record<string, string | number | boolean>,
  ): TelemetrySpan {
    const span = this.tracer.startSpan(name);

    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
    }

    const statusCode = this.statusCode;

    return {
      setAttribute(key: string, value: string | number | boolean): void {
        span.setAttribute(key, value);
      },
      setOk(): void {
        span.setStatus({ code: statusCode.OK });
      },
      setError(message: string): void {
        span.setStatus({ code: statusCode.ERROR, message });
      },
      end(): void {
        span.end();
      },
    };
  }
}
