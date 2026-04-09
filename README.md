# OTAIP — Open Travel AI Platform

The full airline and hotel booking lifecycle — search, pricing, booking, ticketing, exchange, refund, and BSP/ARC settlement — modeled as typed, testable agents. Built by airline distribution veterans, not general-purpose AI developers.

**70 agents across 11 domains. 6 supplier adapters. 2,737 tests. TypeScript strict. One interface.**

OTAIP agents encode real industry logic: ATPCO fare rules (Categories 1-33), NUC/ROE fare construction with HIP/BHC/CTM checks, BSP HOT file reconciliation, ADM prevention (9 pre-ticketing checks), NDC/EDIFACT normalization, IRROPS rebooking with EU261 and US DOT compliance, void window enforcement, married segment integrity, and payment-to-ticketing state machines with BSP finality rules.

Adapters connect to Amadeus, Sabre, Navitaire, TripPro/Mondee, Duffel, and HAIP. You bring your own credentials.

```bash
pnpm add @otaip/core @otaip/agents-booking @otaip/connect
```

Every agent implements `Agent<TInput, TOutput>`. Typed inputs, typed outputs, confidence scores. No framework lock-in, no LLM required — deterministic domain logic that composes in pipelines.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/telivity-otaip/otaip/actions/workflows/ci.yml/badge.svg)](https://github.com/telivity-otaip/otaip/actions)
[![Tests](https://img.shields.io/badge/tests-2737%20passing-brightgreen)](https://github.com/telivity-otaip/otaip/actions)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

---

## What's shipped

| Stage | Package | Agents | Tests | Status |
|-------|---------|--------|-------|--------|
| Stage 0 - Reference Data | `@otaip/agents-reference` | 7 | 204 | Complete |
| Stage 1 - Search & Shop | `@otaip/agents-search` | 8 | 213 | Complete |
| Stage 2 - Select & Price | `@otaip/agents-pricing` | 5 | 160 | Complete |
| Stage 3 - Book & Order | `@otaip/agents-booking` | 7 | 380 | Complete |
| Stage 4 - Ticket & Fulfill | `@otaip/agents-ticketing` | 5 | 160 | Complete |
| Stage 5 - Change & Exchange | `@otaip/agents-exchange` | 6 | 197 | Complete |
| Stage 6 - Refund & ADM | `@otaip/agents-settlement` | 6 | 289 | Complete |
| Stage 7 - BSP/ARC Settlement | `@otaip/agents-reconciliation` | 6 | 193 | Complete |
| Stage 8 - TMC & Agency Ops | `@otaip/agents-tmc` | 5 | 101 | Complete |
| Stage 9 - Platform & Integration | `@otaip/agents-platform` | 5 | 97 | Complete |
| Stage 20 - Lodging | `@otaip/agents-lodging` | 7 | 158 | Complete |

*7 agents marked coming soon (1.8, 2.6, 2.7, 5.4, 5.5, 5.6, 7.4) — stubs exported, pending domain input or future phase.*

**70 agents. 10 core runtime modules. 2,737 tests. All green.**

---

## Architecture

```
+-------------------------------------------------------------+
|                      Your Application                        |
+----------------------------+---------------------------------+
                             |
+----------------------------v---------------------------------+
|                        @otaip/core                           |
|  Agent interface - Tool registry - Agent loop - Lifecycle hooks - Context budget - Retry - Sub-agent - Types |
+---+----------+----------+----------+----------+--------------+
    |          |          |          |          |
    v          v          v          v          v          v
 Stage 0    Stage 1    Stage 2    Stage 3    Stage 4    Stage 20
 Reference  Search &   Select &   Book &     Ticket &   Lodging
 Data       Shop       Price      Order      Fulfill    (Hotel Pipeline)
            |
            v
     +--------------+
     | Distribution |
     |   Adapters   |
     |              |
     | Duffel (NDC) |
     | + Connect:   |
     | Sabre, Amad- |
     | eus, Navit-  |
     | aire, TripPro|
     | HAIP (hotel) |
     +--------------+
            |
    v          v          v
 Stage 5    Stage 6    Stage 7
 Change &   Refund &   BSP/ARC
 Exchange   ADM        Settlement
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

---

## Packages

| Package | Description |
|---------|-------------|
| `@otaip/core` | Agent interface, tool registry, agent execution loop, lifecycle hooks, context budget manager (with tiktoken), retry engine, sub-agent spawning, telemetry (OpenTelemetry bridge), persistence adapter, rate limiter, cache adapter, auth middleware interface, agent mixins (idempotent/cancellable/checkpointable) |
| `@otaip/agents-reference` | Stage 0: Airport/city codes, airline codes, fare basis, booking class, currency |
| `@otaip/agents-search` | Stage 1: Availability search, schedule lookup, connection builder, fare shopping |
| `@otaip/agents-pricing` | Stage 2: Fare rules (ATPCO Cat 1-20), fare construction (NUC/ROE/HIP/BHC), tax calculation |
| `@otaip/agents-booking` | Stage 3: API abstraction, GDS/NDC router, PNR builder, PNR validation, queue management |
| `@otaip/agents-ticketing` | Stage 4: Ticket issuance, EMD management, void, itinerary delivery, document verification |
| `@otaip/agents-exchange` | Stage 5: Change management (Cat 31), exchange/reissue, involuntary rebook (EU261/US DOT) |
| `@otaip/agents-settlement` | Stage 6: Refund processing (Cat 33, BSP+ARC), ADM prevention (9 pre-ticketing checks) |
| `@otaip/agents-reconciliation` | Stage 7: BSP reconciliation (HOT file), ARC reconciliation (IAR), discrepancy detection, ADM/ACM dispute tracking |
| `@otaip/agents-tmc` | Stage 8: Traveler profiles, corporate accounts, mid-office automation, reporting, duty of care |
| `@otaip/agents-platform` | Stage 9: Orchestrator, knowledge retrieval, monitoring & alerting, audit & compliance, plugin manager |
| `@otaip/agents-lodging` | Stage 20: Hotel search, property deduplication, content normalization, rate comparison, booking, modification/cancellation, confirmation verification |
| `@otaip/adapter-duffel` | Duffel NDC adapter - MockDuffelAdapter for testing, live DuffelAdapter for real API calls |
| `@otaip/connect` | Universal supplier adapter framework - Sabre GDS (BFM v5 + Booking Management v1), Navitaire (New Skies/dotREZ, session-stateful), TripPro. Channel generators: ChatGPT (Custom GPT via OpenAPI 3.1), Claude (MCP Server). Full white-label support. See [usage guide](packages/connect/GUIDE.md) |

---

## Quick start

```bash
# Clone and install
git clone https://github.com/telivity-otaip/otaip.git
cd otaip
pnpm install

# Download reference datasets (48K airports, 22 metro area mappings)
pnpm run data:download

# Run all tests
pnpm test

# Typecheck
pnpm typecheck

# Lint
pnpm lint
```

Requirements: Node 24+, pnpm 10+.

---

## Stage 0 - Reference Data

The foundation. Pure TypeScript, static datasets, zero external dependencies.

| Agent | Description |
|-------|-------------|
| Agent 0.1 - Airport/City Code Resolver | 48K airports from OurAirports, 22 metro area mappings (LON, NYC, PAR...), IATA/ICAO/FAA lookup |
| Agent 0.2 - Airline Code & Alliance Mapper | IATA/ICAO code mapping, alliance membership, codeshare partner resolution |
| Agent 0.3 - Fare Basis Code Decoder | Fare basis string parsing: booking class, cabin, season, AP/advance purchase, min/max stay |
| Agent 0.4 - Class of Service Mapper | Booking class to cabin mapping per airline, RBD hierarchy, fare family association |
| Agent 0.5 - Equipment Type Resolver | IATA equipment codes, aircraft family/body type, typical seating configs by cabin, widebody detection |
| Agent 0.6 - Currency & Tax Code Resolver | ISO 4217, BSP settlement currencies, tax code lookup (30 countries, 50 tax codes) |
| Agent 0.7 - Country & Regulatory Resolver | APIS requirements by country (required fields, advance hours), visa requirement by nationality/destination, destination risk levels |

```typescript
import { AirportCodeResolver } from '@otaip/agents-reference';

const resolver = new AirportCodeResolver();
await resolver.initialize();

const result = await resolver.execute({ data: { code: 'LON' } });
// => { data: { airports: ['LHR', 'LGW', 'LCY', 'STN', 'LTN', 'SEN'], type: 'metro' }, confidence: 0.95 }
```

---

## Stage 1 - Search & Shop

Multi-source availability and fare shopping across distribution adapters.

| Agent | Description |
|-------|-------------|
| Agent 1.1 - Availability Search | Parallel multi-adapter search, dedup, segment filtering, codeshare expansion |
| Agent 1.2 - Schedule Lookup | SSIM schedule parsing, operating/marketing flight resolution, codeshare detection |
| Agent 1.3 - Connection Builder | 4-level MCT hierarchy (IATA/airport/terminal/carrier), connection quality scoring |
| Agent 1.4 - Fare Shopping | Fare family comparison, ADT/CHD/INF pricing, branded fare normalization |
| Agent 1.5 - Ancillary Shopping | Available ancillaries per flight: baggage, seats, meals, lounge, WiFi - RFIC codes A-I, per-passenger/per-segment pricing |
| Agent 1.6 - Multi-Source Aggregator | Combine results from multiple adapters, dedup by flight key, keep_cheapest/keep_all/keep_first strategies, partial failure handling |
| Agent 1.7 - Hotel/Car Search | Hotel and car rental search scaffold - defines HotelAdapter/CarAdapter interfaces for future implementors |
| Agent 1.8 - AI Travel Advisor | *Coming soon* - consumer-facing natural language travel search (requires LLM integration) |

The search agents use a plug-in adapter model. Install any distribution adapter and wire it in:

```typescript
import { AvailabilitySearchAgent } from '@otaip/agents-search';
import { DuffelAdapter } from '@otaip/adapter-duffel';

const agent = new AvailabilitySearchAgent({
  adapters: [new DuffelAdapter({ apiKey: process.env.DUFFEL_API_KEY })],
});
```

---

## Stage 2 - Select & Price

ATPCO-compliant pricing logic. All financial math uses `decimal.js` - no floating point for currency.

| Agent | Description |
|-------|-------------|
| Agent 2.1 - Fare Rule Agent | ATPCO categories 1-20, advance purchase, min/max stay, blackout dates, penalties |
| Agent 2.2 - Fare Construction Agent | NUC x ROE, TPM/MPM mileage proration, HIP/BHC/CTM checks, IATA rounding rules |
| Agent 2.3 - Tax Calculation Agent | 30 countries, 50 tax codes, exemption engine (diplomatic, infant, transit, frequent flyer) |
| Agent 2.4 - Offer Builder | Assembles air + ancillaries + taxes into a complete priced offer (NDC Offer model), TTL management, in-memory store, `decimal.js` |
| Agent 2.5 - Corporate Policy Validation | Validates an offer against corporate travel policy - cabin class, fare ceiling, blocked carriers, advance booking, bypass codes |
| Agent 2.6 - Dynamic Pricing | *Coming soon* - continuous/dynamic pricing for offer-based airline models (Tier 4) |
| Agent 2.7 - Revenue Management | *Coming soon* - yield optimization and demand forecasting (Tier 4) |

---

## Stage 3 - Book & Order

PNR construction and booking management across GDS and NDC sources.

| Agent | Description |
|-------|-------------|
| Agent 3.5 - API Abstraction | Circuit breaker, exponential backoff retry, per-provider rate limiting, error normalization (10 providers) |
| Agent 3.1 - GDS/NDC Router | Airline to channel mapping for 30 carriers, NDC version selection (21.3/22.1/23.1), codeshare routing logic |
| Agent 3.2 - PNR Builder | GDS command generation for Amadeus/Sabre/Travelport, SSR/OSI codes, DOCS, infant PNR, group bookings |
| Agent 3.3 - PNR Validation | 13 pre-ticketing checks: segment status, TTL expiry, APIS completeness, duplicate detection, married segment integrity |
| Agent 3.4 - Queue Management | Priority scoring, action code routing, GDS queue command stubs (Amadeus/Sabre/Travelport) |
| Agent 3.6 - Order Management | NDC Order lifecycle (create/modify/cancel/fulfil), GDS PNR bridge, full status history, payment-to-ticketing state machine with BSP-based conflict resolution, `decimal.js` |
| Agent 3.7 - Payment Processing | FOP validation and instruction generation, PCI raw card detection, GDS FOP string format, payment record store |

---

## Stage 4 - Ticket & Fulfill

Electronic ticket issuance, EMD handling, void windows, and passenger communication.

| Agent | Description |
|-------|-------------|
| Agent 4.1 - Ticket Issuance | 13-digit ETR generation, conjunction tickets (>4 segments = /1/2/3), 30 airline numeric prefixes, BSP reporting, commission calculation |
| Agent 4.2 - EMD Management | EMD-A/EMD-S full lifecycle, RFIC codes A-G (seat/baggage/meal/lounge/rebooking/upgrade/ancillary), RFISC passthrough, `decimal.js` totals |
| Agent 4.3 - Void Agent | Coupon status pre-check, carrier-specific void windows (e.g. FR/U2/W6 = 0h), BSP/ARC cutoff enforcement |
| Agent 4.4 - Itinerary Delivery | Multi-channel delivery: HTML email, plain-text email, SMS (160-char segment splitting), WhatsApp structured blocks |
| Agent 4.5 - Document Verification | Passenger name match, DOB validation, passport number regex per nationality, 6-month validity check, visa requirement stub |

All Stage 4 financial math uses `decimal.js`.

---

## Stage 5 - Change & Exchange

Voluntary change, ticket reissue, and involuntary rebook per ATPCO and regulatory requirements.

| Agent | Description |
|-------|-------------|
| Agent 5.1 - Change Management | ATPCO Category 31, 7 fare rule patterns, free 24h window (US DOT), waiver bypass, residual value calculation, BASIC/non-refundable rejection |
| Agent 5.2 - Exchange/Reissue | Residual-first reissue logic, tax carryforward (same O/D), GDS exchange commands (Amadeus/Sabre/Travelport), conjunction ticket reference, BSP audit trail |
| Agent 5.3 - Involuntary Rebook | >60-minute delay trigger, routing change detection, EU261/2004 compensation flags (31 countries), US DOT 220% rule, alliance/interline protection, original routing credit |
| Agent 5.4 - Disruption Response | *Stub* - pending domain input on disruption priority rules and carrier-specific response procedures |
| Agent 5.5 - Self-Service Rebooking | *Stub* - pending domain input on change fee structures, fare ineligibility rules, and self-service rebooking policy |
| Agent 5.6 - Waitlist Management | *Stub* - pending domain input on waitlist priority scoring and clearance procedures |

---

## Stage 6 - Refund & ADM Prevention

BSP/ARC refund processing and pre-ticketing ADM prevention checks.

| Agent | Description |
|-------|-------------|
| Agent 6.1 - Refund Processing | ATPCO Category 33, 7 fare basis rule patterns, full/partial/tax-only refund types, prorated partial refunds, commission recall, waiver bypass, conjunction all-or-none enforcement, BSP + ARC reporting |
| Agent 6.2 - ADM Prevention | 9 pre-ticketing checks: duplicate detection, fare basis/booking class mismatch, passive segment abuse (HX/UN/NO/UC), married segment integrity, TTL buffer, commission vs contracted rate, endorsement validation, tour code, net remit flag |
| Agent 6.3 - ADM/ACM Processing | Full ADM lifecycle (receive/assess/dispute/accept/escalate), 15-day dispute window, 5-day urgency warning, ACM application, deadline-sorted pending queue |
| Agent 6.4 - Customer Communication | Disruption and change notifications (8 types), multi-channel (email/SMS/WhatsApp), SMS segment splitting, template variable substitution |
| Agent 6.5 - Feedback & Complaint | Complaint tracking, US DOT compensation (primary: denied boarding 200%/400% with caps), EU261 (secondary: distance-band amounts, 50% reduction logic), DOT complaint record generation |
| Agent 6.6 - Loyalty & Mileage | Accrual by booking class + status multiplier, OneWorld/SkyTeam/StarAlliance partner tables, redemption eligibility by distance band, status match logic |

---

## Stage 7 - BSP & ARC Settlement

BSP HOT file and ARC IAR reconciliation with discrepancy detection and dispute tracking.

| Agent | Description |
|-------|-------------|
| Agent 7.1 - BSP Reconciliation | HOT file parsing (EDI X12 + fixed-width ASCII), agency-to-BSP matching, discrepancy detection (missing/duplicate/amount/commission/currency/ADM/ACM), pattern detection (>=10 samples), remittance deadline warning, `decimal.js` throughout |
| Agent 7.2 - ARC Reconciliation | IAR parsing (EDI X12/CSV/XML), commission rate validation against airline contracts, ADM dispute window tracking (15-day window, 5-day expiry warning), net remittance calculation, duplicate detection, pattern detection |
| Agent 7.3 - Commission Management | Override agreement tracking by airline + agency + fare basis (wildcard matching), back-end incentive tiers, effective date ranges, commission calculation vs contracted rate, variance flagging, `decimal.js` throughout |
| Agent 7.4 - Interline Settlement | *Coming soon* - prorate calculation, SIS (IATA Simplified Invoicing & Settlement), interline partner billing (pending domain input) |
| Agent 7.5 - Financial Reporting | 9 report types (revenue by route/carrier/period, agency P&L, commission summary, refund liability, unused ticket exposure, spend by traveler/department/supplier), injected data source, `decimal.js` aggregation |
| Agent 7.6 - Revenue Accounting | Coupon lift tracking (OPEN to USED on departure), revenue recognition at lift event, deferred revenue for future travel, proration across conjunctive tickets, `decimal.js` throughout |

---

## Stage 8 - TMC & Agency Operations

Traveler profiles, corporate policy enforcement, mid-office automation, reporting, and duty of care.

| Agent | Description |
|-------|-------------|
| Agent 8.1 - Traveler Profile | CRUD + search, 15 IATA SPML meal codes, SSR injection (DOCS/FQTV/MEAL/SEAT), passport 6-month expiry warning, duplicate detection by email + passport |
| Agent 8.2 - Corporate Account | Cabin policy by domestic/intl/duration, advance booking hard+soft thresholds, fare limits, negotiated fare matching, blacklisted airline rejection, approval threshold, out-of-policy blocking |
| Agent 8.3 - Mid-Office Automation | 6 PNR checks: TTL deadlines (urgent <1h, high <4h), completeness (APIS/contact/FOP), duplicate detection, passive segment abuse (HX/UN/NO/UC), corporate policy, married segment integrity |
| Agent 8.4 - Reporting & Analytics | 9 report types (booking volume, revenue, top routes, agent productivity, policy compliance, spend by traveler/department/supplier, unused tickets), multi-dimension filtering, `decimal.js` aggregation |
| Agent 8.5 - Duty of Care | Traveler location by airport + time window, itinerary lookup, static destination risk (20 countries, 4 levels), mark-as-accounted-for (idempotent), corporate filtering |

---

## Stage 9 - Platform & Integration

Orchestration, knowledge retrieval, observability, audit, and plugin management.

| Agent | Description |
|-------|-------------|
| Agent 9.1 - Orchestrator | 5 workflow pipelines (search_to_price, book_to_ticket, full_booking, exchange_flow, refund_flow), injectable StepExecutor, stop_on_error, timeout with partial result, per-step duration tracking |
| Agent 9.2 - Knowledge Retrieval | Keyword-overlap relevance scoring (0-1), 15 seed documents across 8 travel topics, topic filtering, max_results, query_time_ms |
| Agent 9.3 - Monitoring & Alerting | P50/P95 latency percentiles, error rate %, health thresholds (healthy/degraded/down), auto-fire alerts on state transition, idempotent acknowledge, SLA report with availability % |
| Agent 9.4 - Audit & Compliance | Event logging with retention rules (2555d IATA/PCI, 1095d GDPR), PII redaction (passport/DOB/card/phone/email, nested), GDPR right-to-erasure, compliance issue flagging (4 types, 4 severities) |
| Agent 9.5 - Plugin Manager | Register/unregister/enable/disable, semver validation, duplicate detection, capability discovery (enabled-only), 3 seed plugins (Duffel, Amadeus, expense reporter) |

---

## Stage 20 - Lodging

> **Numbering scheme:** Stages 0–19 = Air, 20–29 = Lodging, 30–39 = Car Rental (future), 40–49 = Rail (future).

Hotel booking lifecycle from search through post-stay verification.

| Agent | Description |
|-------|-------------|
| Agent 20.1 - Hotel Search Aggregator | Parallel multi-source search with per-adapter timeouts, partial results on failure |
| Agent 20.2 - Property Deduplication | Multi-algorithm scoring (Jaro-Winkler, Levenshtein, Haversine), Union-Find grouping, configurable thresholds |
| Agent 20.3 - Content Normalization | Room type taxonomy, amenity mapping (11 categories), photo quality scoring |
| Agent 20.4 - Rate Comparison | String-based decimal arithmetic, mandatory fee calculation, rate parity detection |
| Agent 20.5 - Hotel Booking | Three-layer confirmation codes (CRS/PMS/channel), virtual card dual folio, payment routing |
| Agent 20.6 - Modification & Cancellation | Free mod vs cancel/rebook classification, California 24hr rule, stepped penalty calculation |
| Agent 20.7 - Confirmation Verification | CRS↔PMS cross-check, waitlist/tentative escalation, pre-check-in verification |

```typescript
import { PropertyDeduplicationAgent } from '@otaip/agents-lodging';

const dedup = new PropertyDeduplicationAgent();
await dedup.initialize();

const result = await dedup.execute({
  data: {
    properties: rawHotelResults,  // same hotel from 4 different sources
    thresholds: { autoMerge: 0.85, review: 0.65 },
  },
});
// → Deduplicated properties with merged content, best photos, unified amenities
```

---

## Distribution adapters

OTAIP is source-agnostic. Agents work with any distribution source via the `DistributionAdapter` interface from `@otaip/core`. You bring the credentials.

**Implemented:**

| Package | Coverage | API type | Status |
|---------|----------|----------|--------|
| `@otaip/adapter-duffel` | NDC-participating airlines | REST | Implemented (requires your credentials) |
| `@otaip/connect` (Sabre) | Full-service carriers via GDS | REST (Sabre APIs v5/v1) | Implemented (requires your credentials) |
| `@otaip/connect` (Navitaire) | LCCs via Navitaire (New Skies/dotREZ) | REST (session-stateful) | Implemented (requires your credentials) |
| `@otaip/connect` (Amadeus) | Amadeus Self-Service airlines | REST (Self-Service v2) | Implemented (requires your credentials) |
| `@otaip/connect` (TripPro) | TripPro/Mondee carriers | REST + SOAP | Implemented (requires your credentials) |
| `@otaip/connect` (HAIP) | Hotel PMS via HAIP Connect API | REST | Implemented (requires your credentials) |

**Roadmap:**

| Package | Coverage | API type |
|---------|----------|----------|
| `@otaip/adapter-verteil` | AF, Finnair, SAS, Oman Air + others | REST (pure NDC) |
| `@otaip/adapter-accelya` | LH Group, American NDC | REST (Farelogix-based) |

**Direct airline adapters (roadmap):** American, Delta, United, Lufthansa, Air France-KLM, and 45 more - each as `@otaip/adapter-{iata-code}`. See [ADAPTER_TARGET_LIST.md](docs/architecture/ADAPTER_TARGET_LIST.md).

---

## Project structure

```
otaip/
+-- packages/
|   +-- core/                    # @otaip/core - Agent interface, tool registry, agent loop, lifecycle, context, retry, sub-agent
|   +-- agents/
|   |   +-- reference/           # @otaip/agents-reference - Stage 0
|   |   +-- search/              # @otaip/agents-search - Stage 1
|   |   +-- pricing/             # @otaip/agents-pricing - Stage 2
|   |   +-- booking/             # @otaip/agents-booking - Stage 3
|   |   +-- ticketing/           # @otaip/agents-ticketing - Stage 4
|   |   +-- exchange/            # @otaip/agents-exchange - Stage 5
|   |   +-- settlement/          # @otaip/agents-settlement - Stage 6
|   |   +-- reconciliation/      # @otaip/agents-reconciliation - Stage 7
|   |   +-- lodging/             # @otaip/agents-lodging - Stage 20
|   +-- agents-tmc/              # @otaip/agents-tmc - Stage 8
|   +-- agents-platform/         # @otaip/agents-platform - Stage 9
|   +-- adapters/
|   |   +-- duffel/              # @otaip/adapter-duffel - Mock + live Duffel NDC adapter
|   +-- connect/                 # @otaip/connect - Sabre, Amadeus, Navitaire, TripPro, HAIP adapters + ChatGPT/Claude channel generators
+-- agents/
|   +-- TAXONOMY.md              # Full agent taxonomy
|   +-- specs/                   # YAML specs for all agents
+-- docs/
|   +-- agents/                  # Per-agent API reference (all 70 agents)
|   +-- architecture/            # ADRs, adapter status, auth boundary
|   +-- deployment/              # Docker, OTel, deployment guide
|   +-- operations/              # Scaling, failure modes
|   +-- engineering/             # Build queue, briefs
+-- knowledge-base/              # Travel domain knowledge (maintained by Telivity)
+-- pnpm-workspace.yaml
+-- package.json
```

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/GETTING_STARTED.md) | Clone, install, run your first agent |
| [Agent API Reference](docs/agents/README.md) | Input/output types and examples for all 70 agents |
| [Adapter Status](docs/architecture/ADAPTER_STATUS.md) | What each distribution adapter supports |
| [Deployment Guide](docs/deployment/DEPLOYMENT.md) | Docker, environment variables, OpenTelemetry setup |
| [Auth Boundary](docs/architecture/AUTH_BOUNDARY.md) | Authentication is your app's job — here's how to wire it |
| [Scaling Guide](docs/operations/SCALING.md) | Stateless agents, horizontal scaling, bottlenecks |
| [Failure Modes](docs/operations/FAILURE_MODES.md) | What happens when things go wrong, per stage |
| [Architecture Decisions](docs/architecture/adr/) | 5 ADRs explaining key design choices |

---

## Development Model

Domain knowledge and architecture by [Telivity](https://telivity.app). Implementation built with [Claude Code](https://claude.com/claude-code) (Anthropic). All domain logic reviewed against IATA, ATPCO, and ICAO source standards.

---

## Contributing

Travel domain knowledge is what makes these agents valuable. If you work in airline distribution, GDS/NDC, or TMC operations and you find something wrong - open an issue.

Before writing code, read [CONTRIBUTING.md](CONTRIBUTING.md). The key rules:

- No domain logic without a spec. Every agent has a YAML spec in `agents/specs/` that defines its behavior. If the spec is wrong, fix the spec first.
- TypeScript strict. No `any`. No floating point for currency.
- Tests must encode domain knowledge. A test that says `expect(result).toBeDefined()` is not a test.

---

## License

Apache 2.0. Build on it, fork it, ship it commercially. See [LICENSE](LICENSE).

---

**Built by [Telivity](https://telivity.app)** - the commercial hosting, support, and enterprise layer on top of OTAIP.
