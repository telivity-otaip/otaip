# OTAIP — Open Travel AI Platform

Domain-specific agent orchestration for airlines, TMCs, and GDS/NDC systems.

OTAIP provides a library of composable AI agents that encode travel industry domain knowledge — airport codes, airline alliances, fare rules, booking classes, tax codes, and more. Each agent implements a standard interface, accepts typed inputs, and returns structured outputs with confidence scores.

## Architecture

```
Stage 0 — Reference Data Agents (offline, static datasets)
  0.1  Airport/City Code Resolver
  0.2  Airline Code & Alliance Mapper
  0.3  Fare Basis Code Decoder
  0.4  Class of Service Mapper
  0.6  Currency & Tax Code Resolver

Stage 1 — Live Data Agents (GDS/NDC API integration)       [planned]
Stage 2 — Decision Agents (pricing, routing, rebooking)     [planned]
Stage 3 — Orchestration (multi-agent workflows)             [planned]
```

All agents implement the `Agent<TInput, TOutput>` interface from `@otaip/core`:

```typescript
interface Agent<TInput, TOutput> {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  initialize(): Promise<void>;
  execute(input: AgentInput<TInput>): Promise<AgentOutput<TOutput>>;
  health(): Promise<AgentHealthStatus>;
}
```

## Quick Start

```bash
# Prerequisites: Node.js >= 20, pnpm 9
git clone https://github.com/telivity-otaip/otaip.git
cd otaip
pnpm install

# Download reference data (airports)
pnpm run data:download

# Run tests
pnpm test

# Type check
pnpm run typecheck

# Lint
pnpm run lint
```

## Using an Agent

```typescript
import { AirportCodeResolver } from '@otaip/agents-reference';

const resolver = new AirportCodeResolver();
await resolver.initialize();

const result = await resolver.execute({
  data: { code: 'LHR', code_type: 'iata' },
});

console.log(result.data.resolved_airport?.name);
// → "London Heathrow Airport"
console.log(result.confidence);
// → 1.0
```

## Packages

| Package | Description |
|---------|-------------|
| `@otaip/core` | Agent interface, types, and error classes |
| `@otaip/agents-reference` | Stage 0 reference data agents |

## Stage 0 Agents

| ID | Agent | What it does |
|----|-------|-------------|
| 0.1 | Airport/City Code Resolver | IATA/ICAO codes, multi-airport cities, fuzzy name search |
| 0.2 | Airline Code & Alliance Mapper | Airline codes, Star Alliance/oneworld/SkyTeam, codeshares |
| 0.3 | Fare Basis Code Decoder | ATPCO fare basis parsing (cabin, restrictions, advance purchase) |
| 0.4 | Class of Service Mapper | Booking class → cabin, fare family, upgrade eligibility |
| 0.6 | Currency & Tax Code Resolver | ISO currencies, IATA tax codes (YQ, GB, US, etc.) |

## Project Structure

```
packages/
  core/                     @otaip/core — interfaces and errors
  agents/
    reference/              @otaip/agents-reference — Stage 0 agents
      src/
        airport-code-resolver/    Agent 0.1
        airline-code-mapper/      Agent 0.2
        fare-basis-decoder/       Agent 0.3
        class-of-service-mapper/  Agent 0.4
        currency-tax-resolver/    Agent 0.6
agents/
  specs/                    Agent specification YAMLs
scripts/
  download-airport-data.ts  Reference data pipeline
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0 — see [LICENSE](LICENSE).

---

Built by [Telivity](https://telivity.app)
