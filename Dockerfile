FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/agents-platform/package.json packages/agents-platform/
COPY packages/agents-tmc/package.json packages/agents-tmc/
COPY packages/connect/package.json packages/connect/
COPY packages/agents/reference/package.json packages/agents/reference/
COPY packages/agents/search/package.json packages/agents/search/
COPY packages/agents/pricing/package.json packages/agents/pricing/
COPY packages/agents/booking/package.json packages/agents/booking/
COPY packages/agents/ticketing/package.json packages/agents/ticketing/
COPY packages/agents/exchange/package.json packages/agents/exchange/
COPY packages/agents/settlement/package.json packages/agents/settlement/
COPY packages/agents/reconciliation/package.json packages/agents/reconciliation/
COPY packages/agents/lodging/package.json packages/agents/lodging/
COPY packages/adapters/duffel/package.json packages/adapters/duffel/
RUN pnpm install --frozen-lockfile --ignore-scripts

# --- Build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/*/node_modules ./packages/
COPY . .
RUN pnpm build

# --- Runtime ---
FROM node:24-slim AS runtime
WORKDIR /app
COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
EXPOSE 3000

# OTAIP is a library, not a standalone server.
# Your application imports OTAIP packages and runs its own entry point.
# Override CMD with your app's entry point:
#   docker run -e DUFFEL_API_KEY=... otaip node your-app.js
CMD ["node", "-e", "console.log('OTAIP packages ready. Override CMD with your app entry point.')"]
