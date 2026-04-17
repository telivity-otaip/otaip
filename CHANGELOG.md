# Changelog

## 0.3.2.1 — Sprint B: LLM Tool Layer + EventStore

The pipeline validator can now talk to LLMs. Sprint B connects the contract infrastructure (shipped in v0.3.2) to the tool-dispatch layer, adds persistent event logging, ships a new agent, and delivers the first demo that runs the full architecture end-to-end.

### Added

- **Agent-to-Tool bridge** (`agentToTool()`) — wraps any `AgentContract` + `Agent` pair into a `ToolDefinition` that `AgentLoop` can register and dispatch. Every tool call runs through the six pipeline gates. Failures throw `AgentToolError` with structured reason + issues for LLM self-correction. `registerAgentTools()` batch-converts all contracted agents into a `ToolRegistry`.
- **Catalog generator** — `generateMcpTools()` (Claude MCP), `generateOpenAiFunctions()` (OpenAI strict mode, draft-7), `generateCatalog()` (standalone JSON Schema). All schemas from `zodToJsonSchema()` — zero hand-written JSON anywhere in the pipeline.
- **EventStore** — `OtaipEvent` discriminated union with 6 event types (`agent.executed`, `routing.decided`, `routing.outcome`, `booking.completed`, `booking.failed`, `adapter.health`). `InMemoryEventStore` with filter-by-type/session/agent/time-window queries and percentile aggregation (p50/p95/p99). Optional auto-logging from the tool bridge via `eventStore` option.
- **Agent 3.8 PnrRetrieval** — new agent that retrieves an existing PNR/booking by record locator across distribution adapters. `AgentContract` from day one (`actionType: 'query'`, Zod schemas, semantic validation). Stub retrieval engine — wires to real adapters when `ConnectAdapter` gains `retrieveBooking()`.
- **GdsNdcRouter registry adapter** — `buildCarrierCapabilities()` converts the existing `carrier-channels.json` lookup table into `ChannelCapability` entries for the `CapabilityRegistry`. 8 equivalence tests prove NDC-preferred, GDS-preferred, and DIRECT-only carriers are correctly encoded. Infrastructure for the full scoring-engine swap.
- **Full pipeline demo** (`demo/book-flight-full.ts`) — first demo that uses the Sprint A/B architecture end-to-end: contract-driven tool definitions, `agentToTool()` bridge, 6-gate pipeline validator, EventStore logging, pipeline summary. Run with `pnpm --filter @otaip/demo book:full`.
- **`demo/README.md`** — documents all 5 demo scripts with credential requirements.
- **`AGENT_TOOL_NAMES`** — stable snake_case name map for all 10 contracted agents (e.g. `'1.1' → 'availability_search'`).

### Fixed

- **`@otaip/connect` missing from vitest alias map** — the only workspace package without an alias, causing CI to fail when tests imported `CapabilityRegistry` from `@otaip/connect` (resolved to `dist/` which doesn't exist without a build step).

### Tests

- 39 net new tests across 7 files (2835 total passing, 0 failing)

## 0.3.2 — Sprint A: Pipeline Contract Foundation

OTAIP moves from a library to a platform: every agent that participates in an LLM-orchestrated or pipeline-composed flow can now declare a machine-verifiable `AgentContract`, enforced at runtime by six gates (schema, semantic, intent lock, cross-agent consistency, confidence, action classification). Agents without contracts continue to work as direct function calls — the change is purely additive.

### Added

- **Pipeline validator** (`@otaip/core/pipeline-validator`) — six-gate runtime with `PipelineOrchestrator`, session-scoped intent lock, cross-agent consistency checker, confidence gate (floors: query 0.7 / reversible 0.9 / irreversible 0.95 / reference 0.9), action classifier with approval-token enforcement for irreversible mutations, and a 3-retry-per-gate budget
- **Zod → JSON Schema bridge** backed by Zod 4's native `z.toJSONSchema()` — single source of truth for both runtime validation and LLM tool definitions, no new dependencies
- **Shared semantic validators** — `validateFutureDate`, `validateIataCode`, async `resolveAirportStrict`, `resolveAirlineStrict`, `resolveFareBasisStrict`
- **`ReferenceDataProvider` interface** in `@otaip/core` with concrete `ReferenceAgentDataProvider` in `@otaip/agents-reference` wrapping the Stage 0 agents (no duplicated dataset)
- **Channel capability registry** — `ChannelCapability` types in `@otaip/core`, `CapabilityRegistry` class in `@otaip/connect`, manifests next to each of the 6 adapters (Amadeus, Sabre, Navitaire, TripPro, HAIP, Duffel)
- **9 agent contracts** covering the end-to-end demo flow (search → price → book → ticket):
  - 0.1 `AirportCodeResolver`, 0.2 `AirlineCodeMapper`, 0.3 `FareBasisDecoder` (reference agents)
  - 1.1 `AvailabilitySearch`, 2.1 `FareRuleAgent`, 2.4 `OfferBuilderAgent` (query)
  - 3.1 `GdsNdcRouter` (query), 3.2 `PnrBuilder` (mutation_reversible), 4.1 `TicketIssuance` (mutation_irreversible)
- **Sprint A end-to-end integration test** in `@otaip/agents-ticketing` proving every one of the six gates fires at least once across a full offline run, plus targeted rejection cases (unknown airport → semantic gate; destination drift → intent-lock gate; past date → semantic gate; ticketing without approval → action-class gate)

### Fixed

- **`OfferEvaluatorAgent` time bomb** — `evaluateOffers()` now accepts an optional `evaluation_time?: string` (ISO 8601). Fixtures dated 2026-04-14 were silently expiring in CI once wall-clock time passed `expires_at`. Default remains `new Date()` so existing callers are unaffected.

### Scope narrowing

- `GdsNdcRouter` (3.1) gets the contract and is now a platform citizen; the internals swap from lookup-table to registry-driven weighted scoring lands in Sprint B (callers unchanged, 467-line test fixture set updates will come with it)

### Tests

- 59 new tests across 9 files (pipeline validator units, capability registry, Sprint A E2E)
- Full suite: 2796 passing, 3 skipped, 0 failing

## 0.3.0 — Stage 9: Platform Upgrade

### Added
- **Schema-Aware Tool Interface** — Zod-validated tool definitions with runtime input/output checking (`packages/core/src/tool-interface/`)
- **Agent Execution Loop** — Deterministic message→tool→response cycle with typed state transitions (`packages/core/src/agent-loop/`)
- **Lifecycle Hooks** — Pre/post hooks on agent actions for logging, metrics, and guardrails (`packages/core/src/lifecycle/`)
- **Context Budget Manager** — Token-aware context management with pluggable compaction strategies (`packages/core/src/context/`)
- **Retry with Jitter** — Shared retry engine with exponential backoff and full jitter, replacing inline retry in BaseAdapter (`packages/core/src/retry/`)
- **Sub-Agent Spawning** — Parent agents can spawn scoped child agents with controlled tool access (`packages/core/src/sub-agent/`)

### Changed
- `BaseAdapter.withRetry()` now uses the shared retry engine from `@otaip/core` (adds jitter, no breaking API changes)
- All package versions bumped from 0.2.x to 0.3.0
