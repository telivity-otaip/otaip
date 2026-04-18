# Getting Started with OTAIP

> From zero to a working pipeline-validated flight booking in under 10 minutes.

## Prerequisites

- **Node.js >= 24** -- required for native fetch and ESM support
- **pnpm 10+** -- workspace monorepo manager

```bash
node --version   # v24.x.x
pnpm --version   # 10.x.x
```

## 1. Clone and Install

```bash
git clone https://github.com/telivity-otaip/otaip.git
cd otaip
pnpm install --frozen-lockfile
```

This installs all workspace packages: `@otaip/core`, `@otaip/connect`, `@otaip/duffel`, and all agent packages.

> **Note**: lifecycle scripts are disabled (`ignore-scripts=true` in `.npmrc`) for supply-chain safety. No `postinstall` hooks run.

## 2. Download Reference Data

```bash
pnpm run data:download
```

Fetches airport reference data into `data/reference/`. Required for the airport-code resolver and any agent that depends on it. Re-run whenever the upstream OurAirports dataset is updated.

## 3. Build the Project

```bash
pnpm build
```

Builds all packages with `tsup` in the correct dependency order.

## 4. Run Tests to Verify

```bash
pnpm test
```

You should see 3,092 tests pass across all packages. The adapter tests (456 tests) use mocked HTTP -- no live API calls.

## 4. Set Up Duffel Sandbox (Optional)

For the live NDC adapter demo:

1. Create a free account at [duffel.com](https://duffel.com)
2. Go to your dashboard and copy the **test mode** API token (starts with `duffel_test_`)

## 5. Create .env

Create a `.env` file at the repo root:

```bash
# Required for the full pipeline demo
ANTHROPIC_API_KEY=sk-ant-...

# Optional: for Duffel live adapter tests
DUFFEL_API_KEY=duffel_test_...
```

The `ANTHROPIC_API_KEY` is required for the LLM-orchestrated pipeline demo. The demo uses Claude to drive the tool-calling loop.

## 6. Run the Full Pipeline Demo

```bash
pnpm --filter @otaip/demo book:full
```

This runs `demo/book-flight-full.ts` -- a complete search-to-book pipeline using Claude as the orchestrator.

### What happens

1. The demo initializes 5 contracted agents: AvailabilitySearch (1.1), FareRuleAgent (2.1), GdsNdcRouter (3.1), PnrBuilder (3.2), PnrRetrieval (3.8)
2. Each agent is bridged to a `ToolDefinition` via `agentToTool()`
3. Agent contracts are converted to Anthropic tool schemas via `zodToJsonSchema()`
4. A pipeline session is created with an intent lock: LHR to AMS, economy, one-way
5. Claude receives the tools and a booking request
6. Claude calls tools in order: `availability_search` -> `gds_ndc_router` -> `pnr_builder`
7. Every tool call runs through **6 pipeline gates**:
   - **Intent Lock** -- verifies the agent is relevant to the locked intent
   - **Schema In** -- Zod validates the input against the contract schema
   - **Semantic In** -- domain checks (valid airport codes, dates in the future, etc.)
   - **Cross-Agent** -- input is consistent with prior agent outputs
   - **Schema Out + Confidence** -- output structure is valid and confidence meets the threshold
   - **Action Classification** -- irreversible mutations require approval
8. Every execution is logged to the **EventStore** with duration, confidence, and gate results

### Expected output

```
============================================================
OTAIP Full Pipeline Demo
Contract-driven tools - 6-gate pipeline validator - EventStore logging
============================================================

Tools available: availability_search, fare_rule_agent, gds_ndc_router, pnr_builder, pnr_retrieval

--- Agent step 1 ---
[TOOL CALL] availability_search
...
[TOOL CALL] gds_ndc_router
...
[TOOL CALL] pnr_builder
...

============================================================
Pipeline Summary
============================================================
Session: session_...
Intent: LHR -> AMS on 2026-04-30
Invocations: 3
  1.1 [ok] intent_lock:pass schema_in:pass semantic_in:pass ...
  3.1 [ok] intent_lock:pass schema_in:pass semantic_in:pass ...
  3.2 [ok] intent_lock:pass schema_in:pass semantic_in:pass ...

EventStore: 3 agent.executed events logged
```

## 7. What You Just Ran

The demo demonstrates the core OTAIP architecture:

- **Agent contracts** define Zod schemas as the single source of truth for input/output validation
- **`agentToTool()`** bridges each agent to the LLM tool interface -- no hand-written JSON schemas
- **Pipeline Validator** enforces 6 gates around every `execute()` call
- **EventStore** logs every agent execution for governance and observability
- **Intent Lock** prevents the LLM from drifting off the original booking goal

The LLM cannot:
- Hallucinate offer IDs (schema gate catches invalid references)
- Change the destination mid-flow (intent lock blocks it)
- Ticket without completing prior steps (cross-agent gate catches missing state)
- Proceed with low-confidence results (confidence gate rejects them)

## 8. Next Steps

### Add a new adapter

Implement the `ConnectAdapter` interface from `@otaip/connect`:

```typescript
import { BaseAdapter } from '@otaip/connect';
import type { ConnectAdapter } from '@otaip/connect';

export class MyAdapter extends BaseAdapter implements ConnectAdapter {
  readonly supplierId = 'my-supplier';
  readonly supplierName = 'My Supplier';

  async searchFlights(input) { /* ... */ }
  async priceItinerary(offerId, passengers) { /* ... */ }
  async createBooking(input) { /* ... */ }
  // ...
}
```

### Contract more agents

Add a pipeline contract to any agent by creating a `contract.ts` file:

```typescript
import { z } from 'zod';
import type { AgentContract, ValidationContext, SemanticValidationResult } from '@otaip/core';

export const myAgentContract: AgentContract<typeof inputSchema, typeof outputSchema> = {
  agentId: '2.3',
  inputSchema,
  outputSchema,
  actionType: 'query',
  confidenceThreshold: 0.8,
  outputContract: ['total_tax', 'currency'],
  async validate(input, ctx): Promise<SemanticValidationResult> {
    // Domain-specific checks using ctx.reference
  },
};
```

### Build on the platform

- Wire governance agents (9.6-9.9) to the EventStore for production monitoring
- Add persistence adapters (Postgres, Redis) to replace `InMemoryEventStore`
- Implement remaining placeholder agents with proper domain input
- Connect more distribution adapters (Travelport, Hotelbeds, etc.)

## Useful Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all 2,881 tests |
| `pnpm lint` | Run ESLint + Prettier |
| `pnpm --filter @otaip/core test` | Test only core package |
| `pnpm --filter @otaip/connect test` | Test only connect (adapters) |
| `pnpm --filter @otaip/demo book:full` | Run the full pipeline demo |
