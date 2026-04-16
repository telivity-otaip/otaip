# Changelog

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
