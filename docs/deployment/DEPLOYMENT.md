# Deployment Guide

OTAIP is a library/framework, not a standalone server. Your application imports OTAIP packages and runs its own server. The Dockerfile packages the build artifacts for containerized deployments.

## Local Development

```bash
# Prerequisites: Node 24+, pnpm 10+
corepack enable && corepack prepare pnpm@10.33.0 --activate

# Install and verify
pnpm install
pnpm run data:download
pnpm test
pnpm typecheck
pnpm build
```

## Docker

```bash
# Build the image
docker build -t otaip .

# Run with your application entry point
docker run -e DUFFEL_API_KEY=duffel_test_... otaip node your-app.js
```

## Docker Compose

```bash
# Copy .env.example to .env and fill in credentials
cp .env.example .env

# Start (OTAIP only)
docker compose up

# Start with Postgres + Jaeger (full stack)
docker compose --profile full up
```

The `full` profile adds:
- **PostgreSQL 17** on port 5432 — for PersistenceAdapter backends
- **Jaeger** on port 16686 (UI) + 4318 (OTLP) — for distributed tracing

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DUFFEL_API_KEY` | Duffel API key (test or live) | For Duffel adapter |
| `ANTHROPIC_API_KEY` | Anthropic API key | For AI Travel Advisor |
| `SABRE_CLIENT_ID` | Sabre OAuth client ID | For Sabre adapter |
| `SABRE_CLIENT_SECRET` | Sabre OAuth client secret | For Sabre adapter |
| `SABRE_ENVIRONMENT` | `cert` or `prod` | For Sabre adapter |
| `DATABASE_URL` | PostgreSQL connection string | For PersistenceAdapter |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint (e.g. `http://localhost:4318`) | For tracing |

## Node Version

OTAIP requires Node.js >= 24.14.1. The Dockerfile uses `node:24-slim`.

## Architecture Note

Each OTAIP agent is stateless by default. For production deployments:
- Horizontal scaling: run multiple instances behind a load balancer
- The bottleneck is external API rate limits, not OTAIP itself
- Use the `RateLimiter` from `@otaip/core` to control per-adapter throughput
- For stateful agents (Offer Builder, Order Management), inject a `PersistenceAdapter` backed by Redis or PostgreSQL
- For tracing, use `OTelTelemetryProvider` from `@otaip/core` with your OTLP backend

## OpenTelemetry Setup

```typescript
import { OTelTelemetryProvider, traceAgentExecution } from '@otaip/core';

// Requires: npm install @opentelemetry/api @opentelemetry/sdk-trace-node @opentelemetry/exporter-trace-otlp-http

// 1. Set up OTel SDK (your application's responsibility)
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

const tracerProvider = new NodeTracerProvider();
tracerProvider.addSpanProcessor(
  new SimpleSpanProcessor(new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }))
);
tracerProvider.register();

// 2. Use OTAIP's OTel provider to wrap agent execution
const telemetry = new OTelTelemetryProvider('otaip');
const result = await traceAgentExecution(
  telemetry,
  agent.name,
  { 'agent.id': agent.id, 'agent.stage': '1' },
  () => agent.execute({ data: searchInput }),
);
```

View traces at http://localhost:16686 when running Jaeger via `docker compose --profile full up`.
