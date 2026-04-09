# Getting Started with OTAIP

This guide walks you through installing OTAIP, running your first agent, and wiring up a flight search.

## Prerequisites

- Node.js >= 24 ([download](https://nodejs.org))
- pnpm 10+ (`corepack enable && corepack prepare pnpm@10.33.0 --activate`)

## Install and verify

```bash
git clone https://github.com/telivity-otaip/otaip.git
cd otaip
pnpm install

# Download reference datasets (48K airports, 22 metro area mappings)
pnpm run data:download

# Run all tests
pnpm test

# Type check
pnpm typecheck
```

## 1. Your first agent — Airport Code Resolver

Every OTAIP agent implements the same interface: `initialize()`, `execute()`, `health()`.

```typescript
import { AirportCodeResolver } from '@otaip/agents-reference';

const resolver = new AirportCodeResolver();
await resolver.initialize();

// Resolve a multi-airport city
const result = await resolver.execute({ data: { code: 'NYC' } });
console.log(result.data);
// => { airports: [{ iata: 'JFK', name: 'John F Kennedy Intl', ... }, ...], type: 'metro' }
console.log(result.confidence);
// => 0.95
```

## 2. Flight search with Duffel adapter

Wire up the Duffel adapter to search for flights:

```typescript
import { AvailabilitySearch } from '@otaip/agents-search';
import { MockDuffelAdapter } from '@otaip/adapter-duffel';

// Use MockDuffelAdapter for development (no API key needed)
const adapter = new MockDuffelAdapter();

const search = new AvailabilitySearch({ adapters: [adapter] });
await search.initialize();

const result = await search.execute({
  data: {
    segments: [{ origin: 'LHR', destination: 'CDG', departure_date: '2026-06-15' }],
    passengers: { adults: 1, children: 0, infants: 0 },
    cabin_class: 'economy',
  },
});

console.log(`Found ${result.data.offers.length} offers`);
```

For real API calls, use `DuffelAdapter` with your API key:

```typescript
import { DuffelAdapter } from '@otaip/adapter-duffel';

const adapter = new DuffelAdapter({
  apiKey: process.env.DUFFEL_API_KEY!,
});
```

## 3. Understanding the agent pattern

All OTAIP agents share these characteristics:

- **Typed I/O**: Input and output types are defined in each agent's `types.ts`
- **Confidence scores**: Every output includes a `confidence` field (0-1)
- **Health checks**: `agent.health()` returns `{ status: 'healthy' | 'degraded' | 'unhealthy' }`
- **Stateless**: Agents don't hold state between executions (by default)
- **Composable**: Chain agents together — one agent's output feeds another's input

## 4. Where to go next

- **Agent specs**: See `agents/specs/` for detailed YAML specifications of each agent
- **Developer guide**: See `docs/DEVELOPER_GUIDE.md` for the full development workflow
- **Connect framework**: See `packages/connect/GUIDE.md` for multi-supplier adapter setup (Sabre, Amadeus, Navitaire)
- **Adapter status**: See `docs/architecture/ADAPTER_STATUS.md` for what's implemented
- **Demo scripts**: Run `pnpm --filter demo book` to see a full booking flow

## 5. Building your own agent

Use the scaffold script:

```bash
pnpm tsx scripts/scaffold-agent.ts --stage 10 --id 1 --name "my-agent"
```

Or follow the reference implementation at `packages/agents/reference/src/airport-code-resolver/`.
