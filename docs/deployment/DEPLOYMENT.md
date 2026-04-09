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

# Start
docker compose up
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DUFFEL_API_KEY` | Duffel API key (test or live) | For Duffel adapter |
| `ANTHROPIC_API_KEY` | Anthropic API key | For AI Travel Advisor |
| `SABRE_CLIENT_ID` | Sabre OAuth client ID | For Sabre adapter |
| `SABRE_CLIENT_SECRET` | Sabre OAuth client secret | For Sabre adapter |
| `SABRE_ENVIRONMENT` | `cert` or `prod` | For Sabre adapter |

## Node Version

OTAIP requires Node.js >= 24.14.1. The Dockerfile uses `node:24-slim`.

## Architecture Note

Each OTAIP agent is stateless by default. For production deployments:
- Horizontal scaling: run multiple instances behind a load balancer
- The bottleneck is external API rate limits, not OTAIP itself
- Use the `RateLimiter` from `@otaip/core` to control per-adapter throughput
- For stateful agents (Offer Builder, Order Management), inject a `PersistenceAdapter` backed by Redis or PostgreSQL
