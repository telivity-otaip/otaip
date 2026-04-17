# Changelog

## 0.6.0 — Sprint H: Multi-Adapter, OOSD-Native, Full Distribution

The mid-term build plan is complete. Navitaire gains native ONE Order operations, Duffel bridges its order model to OTAIP's AIDM-aligned types, and the Reference OTA searches multiple adapters in parallel with source attribution.

### Added

- **Navitaire OrderOperations** — `NavitaireOrderOperations` class implements the full AIDM 24.1 `OrderOperations` interface: `orderCreate`, `orderRetrieve`, `orderChange`, `orderCancel`, `orderViewHistory`. Mock in-memory implementation with `NAV-ORD-*` IDs, status lifecycle, and `OrderEvent` tracking. Navitaire is ONE Order certified; this lets OTAIP speak to them natively.
- **Duffel Order Bridge** — `DuffelOrderBridge` class bridges Duffel's native order model to OTAIP's AIDM-aligned `Order` types. `DFL-ORD-*` IDs, double-cancel prevention, passenger/payment/offer-item mapping.
- **ChannelCapability Order fields** — `supportsOrders?: boolean` and `orderOperations?: ('create' | 'retrieve' | 'change' | 'cancel')[]` on `ChannelCapability`. `GdsNdcRouter` can use these to decide PNR vs Order path per channel.
- **Multi-adapter search in Reference OTA** — `MultiSearchService` fans out search requests to multiple `DistributionAdapter` instances via `Promise.allSettled`, merges results with `adapterSource` attribution, includes per-source status with timing and error reporting. Activated via `ADAPTERS` env var (comma-separated) or `?multi=true` query param.
- **Updated capability manifests** — Navitaire and Duffel now declare `supportsOrders: true` and the full set of order operations.
- **docs/adapters/oosd-navitaire.md** — Navitaire ONE Order adapter documentation.
- **docs/offers-and-orders.md** — updated with Sprint H completion section.

### Tests

- 33 new tests (15 Navitaire + 10 Duffel + 8 multi-search). 2985 total passing, 0 failing.

### Build plan complete

| Sprint | Version | Delivered |
|---|---|---|
| A | v0.3.2 | Pipeline validator, 9 agent contracts, capability registry |
| B | v0.3.2.1 | Tool bridge, catalog generator, EventStore, PnrRetrieval |
| C | v0.3.3 | Fallback chain, governance agents, CLI |
| D+E | v0.3.4 | Docs overhaul, Reference OTA search flow |
| F | v0.5.0 | Reference OTA booking, payment, ticketing |
| G | v0.5.1 | Offers & Orders data model (AIDM 24.1) |
| H | v0.6.0 | OOSD-native adapters, multi-adapter search |

Final stats: **76 agents, 2985 tests, 16 workspace packages, 6 adapters, 14 contracted agents, 2 OOSD-native adapters.**

## 0.5.1 — Sprint G: ONE Order Ready — PNR + Orders Coexist

Native Offers & Orders data model in `@otaip/core`, aligned with IATA AIDM 24.1 terminology. PNR and Order models coexist through a unified `BookingReference` bridge — agents accept either and let the adapter decide the underlying model.

### Added

- **Order/Offer types** — `Offer`, `OfferItem`, `Order`, `OrderItem`, `Service` (atomic unit: flight, seat, baggage, meal, lounge, insurance, ancillary), `OrderPassenger` with `TravelDocument` + `LoyaltyInfo`, `TicketDocument` (ET, EMD-A, EMD-S), `OrderPayment`, `Money` (decimal string + ISO 4217)
- **AIDM 24.1 message names** — `OrderCreate`, `OrderRetrieve`, `OrderChange`, `OrderCancel` on the `OrderOperations` interface. Adapters that support ONE Order implement this directly.
- **OrderEvent** — event-driven status changes for Orders (`order.created`, `order.confirmed`, `order.ticketed`, `order.changed`, `order.cancelled`, `order.payment_received`, `order.payment_failed`, `order.refunded`). Queue management stays PNR-only.
- **BookingReference bridge** — `PnrReference | OrderReference` union type with constructors (`createPnrReference`, `createOrderReference`), type guards (`isPnrReference`, `isOrderReference`), accessors (`getBookingIdentifier`, `getBookingOwner`), and `pnrPassengerToOrderPassenger()` converter.
- **Zod schemas** for every Order/Offer type — ready for `zodToJsonSchema()` LLM tool generation.
- **docs/offers-and-orders.md** — explains the dual model, AIDM alignment, bridge utilities, and Sprint H roadmap (Navitaire as OOSD adapter target).

### Design decisions

- JSON, not XML. AIDM concepts, not the AIDM XML schema.
- Queue management stays PNR-only. Orders use `OrderEvent`.
- No agent modifications in this release — types and bridge only. Agent integration via `BookingReference` lands in Sprint H.
- Navitaire is the target OOSD adapter for Sprint H — they're ONE Order certified and the adapter already exists.

### Tests

- 47 new tests (30 schema validation + 17 bridge utilities). 2952 total passing, 0 failing.

## 0.5.0 — Sprint F: Reference OTA — Book, Pay, Fly

The reference OTA is now a complete booking application. Users can search flights, select an offer, enter passenger details, pay, and receive a ticket — the full travel e-commerce lifecycle running on OTAIP agents.

### Added

- **Booking flow** — `POST /api/book` creates a booking from a search offer with passenger details (title, name, DOB, gender) and contact info. Validates the offer exists in the search cache before booking. Returns a booking reference.
- **Payment flow** — `POST /api/pay` processes a mock payment against a booking reference. Structured for future Stripe integration (PaymentService abstraction) but ships with a mock that always succeeds. No external payment SDK dependency.
- **Ticketing flow (Option B)** — `POST /api/ticket` checks booking status first. If already ticketed, returns existing ticket numbers (idempotent). If not, generates mock 13-digit ticket numbers and updates status. Ticketed bookings cannot be cancelled.
- **Booking management** — `GET /api/booking/:ref` retrieves booking details. `POST /api/cancel` cancels confirmed (not yet ticketed) bookings.
- **4 frontend pages** — passenger details form (`book.html`), payment summary + Pay Now (`payment.html`), full confirmation with tickets + itinerary (`confirmation.html`), booking lookup + cancel (`manage.html`). Plain HTML + vanilla JS + Pico CSS.
- **OtaAdapter interface** — extends `DistributionAdapter` with `book()`, `getBooking()`, `cancelBooking()`. MockOtaAdapter extends MockDuffelAdapter with in-memory booking store, reference generation, and status lifecycle (confirmed → ticketed/cancelled).
- **14 integration tests** — booking CRUD, payment, idempotent ticketing, cancellation rules, 2 full end-to-end flows (search → book → pay → ticket, search → book → cancel).

### Tests

- 2905 total passing (14 new + 2891 existing), 0 failing

## 0.3.4 — Sprint D+E: Docs Overhaul + Reference OTA

Two sprints shipped together: Sprint D rewrites all documentation so the platform's scope is visible at a glance. Sprint E ships a deployable reference OTA that proves OTAIP works end to end — fork it, add your Duffel token, search real flights.

### Sprint D — Documentation Overhaul

- **README.md rewrite** — 6-adapter comparison table with exact test counts (456 total), 75-agent domain overview across 12 stages, pipeline contract system explanation, CLI usage examples, "Build on OTAIP" section
- **docs/architecture.md** — 4 Mermaid diagrams: high-level architecture, pipeline gate sequence, tool bridge flow, EventStore integration
- **docs/agents.md** — complete table of all 75 agents with ID, class name, description, contract status (14 contracted)
- **docs/getting-started.md** — clone to working demo in 5 minutes
- **docs/adapters/{amadeus,sabre,navitaire,trippro,duffel,haip}.md** — 6 adapter docs with capabilities, auth, config, usage, test counts, limitations
- **Agent ID collision fix** — PluginManager keeps 9.5, governance agents renumbered to 9.6-9.9

### Sprint E — Reference OTA: Search Flow

- **Fastify server** (`examples/ota/`) — `POST /api/search`, `GET /api/offers/:id`, `GET /health`
- **Services** — SearchService orchestrates AirportCodeResolver → AvailabilitySearch; OfferService caches offer details
- **Adapter config** — DuffelAdapter when `DUFFEL_API_TOKEN` is set, MockDuffelAdapter when not (works out of the box with zero config)
- **Frontend** — plain HTML + vanilla JS + Pico CSS via CDN. Search form with IATA validation, results page with sort-by-price/duration/departure, offer details with price breakdown. No React, no build step.
- **10 integration tests** using Fastify inject + MockDuffelAdapter

### Monorepo fix

- **exports.types → src/index.ts** — 14 packages had `exports["."].types` pointing to `./dist/index.d.ts` (only exists after build). Changed all to `./src/index.ts` matching `@otaip/core`'s pattern. `pnpm -r run typecheck` now works without a prior build step.

### Tests

- 2891 total passing (10 new OTA tests + 2881 existing), 0 failing

## 0.3.3 — Sprint C: Governance Agents, Fallback Chain, CLI

The OTAIP build plan is now complete. Sprint C ships the final three steps: the fallback chain engine for automatic channel recovery, four governance agents that monitor the platform's own performance, and a CLI tool for zero-code developer access.

### Added

- **Fallback chain engine** (`executeFallbackChain()`) — when the primary routing channel fails, automatically tries each fallback in order. Skips channels whose circuit breaker is open (integrates with ApiAbstraction agent 3.5). Returns a full audit trail of every attempt with durations and error details. 6 tests.
- **Performance Audit Agent (9.5)** — reads EventStore `agent.executed` events, computes success rate, error rate, avg/p95/p99 latency, identifies degraded agents (error rate >15% or p95 >8000ms). AgentContract from day one. 10 tests.
- **Routing Audit Agent (9.6)** — reads `routing.decided` + `routing.outcome` events, correlates by session, computes per-channel success rates and fallback frequency. AgentContract from day one. 7 tests.
- **Recommendation Agent (9.7)** — takes performance + routing audit reports as input, applies deterministic rules, produces typed recommendations (`route_adjustment`, `adapter_health`, `capacity`, `config_update`). All `auto_applicable: false` in v1. Confidence based on data volume. AgentContract from day one. 10 tests.
- **Alert Agent (9.8)** — configurable threshold monitoring with defaults from the master plan: GDS error rate 5%/15% (warning/critical), NDC 10%/25%, adapter latency p95 >8000ms, 3+ consecutive failures, pipeline rejection rate >20%. AgentContract from day one. 13 tests.
- **CLI tool** (`@otaip/cli`) — new package with 6 commands: `otaip search`, `otaip price`, `otaip book`, `otaip adapters`, `otaip agents` (lists all 75 agents with contract status), `otaip validate` (dry-run pipeline validation). Table format by default, `--json` for machine output, `--verbose` for gate details.

### Fixed

- **Semver compliance** — version `0.3.2.1` (4-part, not valid semver) broke pnpm's `workspace:*` matching. All packages now use proper 3-part semver `0.3.3`.
- **Unused import** in `chain-engine.ts` (`FallbackStatus`).
- **CLI ESLint config** — typescript-eslint can't resolve workspace deps when CWD is a nested package. CLI excluded from root lint glob; covered by `pnpm typecheck` instead.

### Tests

- 46 net new tests across 5 files (2881 total passing, 0 failing)

### Build plan status

All six steps from the master plan are now shipped:

| Step | Deliverable | Sprint |
|---|---|---|
| 1 | Pipeline validator (6 gates) | A (v0.3.2) |
| 2 | LLM tool layer (bridge + catalog) | B (v0.3.2.1) |
| 3 | Routing (capability registry + fallback chain) | A + C |
| 4 | EventStore | B (v0.3.2.1) |
| 5 | Governance agents (4 agents) | C (v0.3.3) |
| 6 | CLI tool | C (v0.3.3) |

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
