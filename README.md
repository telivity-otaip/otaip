# OTAIP â Open Travel AI Platform

**The composable AI agent stack for the travel industry.**

OTAIP is an open source agent orchestration platform that encodes travel industry domain knowledge â fare rules, GDS/NDC protocols, ATPCO categories, BSP/ARC settlement logic â into typed, testable TypeScript agents. Plug in your distribution credentials. Get a full booking engine.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/telivity-otaip/otaip/actions/workflows/ci.yml/badge.svg)](https://github.com/telivity-otaip/otaip/actions)
[![Tests](https://img.shields.io/badge/tests-1816%20passing-brightgreen)](https://github.com/telivity-otaip/otaip/actions)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

---

## What's shipped

| Stage | Package | Agents | Tests | Status |
|-------|---------|--------|-------|--------|
| Stage 0 â Reference Data | `@otaip/agents-reference` | 7 | 204 | â Complete |
| Stage 1 â Search & Shop | `@otaip/agents-search` | 8 | 213 | â Complete |
| Stage 2 â Select & Price | `@otaip/agents-pricing` | 5 | 160 | â Complete |
| Stage 3 â Book & Order | `@otaip/agents-booking` | 7 | 269 | â Complete |
| Stage 4 â Ticket & Fulfill | `@otaip/agents-ticketing` | 5 | 160 | â Complete |
| Stage 5 â Change & Exchange | `@otaip/agents-exchange` | 6 | 197 | â Complete |
| Stage 6 â Refund & ADM | `@otaip/agents-settlement` | 6 | 289 | â Complete |
| Stage 7 â BSP/ARC Settlement | `@otaip/agents-reconciliation` | 6 | 193 | â Complete |
| Stage 8 â TMC & Agency Ops | `@otaip/agents-tmc` | 5 | 101 | â Complete |
| Stage 9 â Platform & Integration | `@otaip/agents-platform` | 5 | 97 | â Complete |

*4 agents marked coming soon (1.8, 2.6, 2.7, 7.4) â stubs exported, pending domain input or future phase.*

**62 agents. 1816 tests. All green.**

---

## Architecture

```
âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
â                      Your Application                        â
ââââââââââââââââââââââââââââ¬âââââââââââââââââââââââââââââââââââ
                           â
ââââââââââââââââââââââââââââ¼âââââââââââââââââââââââââââââââââââ
â                        @otaip/core                           â
â          Agent interface Â· Types Â· Error standards           â
ââââ¬âââââââââââ¬âââââââââââ¬âââââââââââ¬âââââââââââ¬âââââââââââââââ
   â          â          â          â          â
   â¼          â¼          â¼          â¼          â¼
Stage 0    Stage 1    Stage 2    Stage 3    Stage 4
Reference  Search &   Select &   Book &     Ticket &
Data       Shop       Price      Order      Fulfill
           â
           â¼
    ââââââââââââââââ
    â Distribution â
    â   Adapters   â
    â              â
    â Duffel       â
    â Amadeus      â
    â Sabre        â
    â Verteil      â
    â Accelya      â
    ââââââââââââââââ
           â
   â¼          â¼          â¼
Stage 5    Stage 6    Stage 7
Change &   Refund &   BSP/ARC
Exchange   ADM        Settlement
```

All agents implement the `Agent<TInput, TOutput>` interface from `@otaip/core`:

```typescript
interface Agent<TInput, TOutput> {
  initialize(): Promise<void>;
  execute(input: TInput): Promise<TOutput>;
  health(): Promise<HealthStatus>;
}
```

---

## Packages

| Package | Description |
|---------|-------------|
| `@otaip/core` | Agent interface, distribution adapter interface, shared types and errors |
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
| `@otaip/adapter-duffel` | MockDuffelAdapter for local testing (3 mock routes) |

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

Requirements: Node 20+, pnpm 9+.

---

## Stage 0 â Reference Data

The foundation. Pure TypeScript, static datasets, zero external dependencies.

| Agent | Description |
|-------|-------------|
| Agent 0.1 â Airport/City Code Resolver | 48K airports from OurAirports, 22 metro area mappings (LON, NYC, PARâ¦), IATA/ICAO/FAA lookup |
| Agent 0.2 â Airline Code & Alliance Mapper | IATA/ICAO code mapping, alliance membership, codeshare partner resolution |
| Agent 0.3 â Fare Basis Code Decoder | Fare basis string parsing: booking class, cabin, season, AP/advance purchase, min/max stay |
| Agent 0.4 â Class of Service Mapper | Booking class â cabin mapping per airline, RBD hierarchy, fare family association |
| Agent 0.5 â Equipment Type Resolver | IATA equipment codes, aircraft family/body type, typical seating configs by cabin, widebody detection |
| Agent 0.6 â Currency & Tax Code Resolver | ISO 4217, BSP settlement currencies, tax code lookup (30 countries, 50 tax codes) |
| Agent 0.7 â Country & Regulatory Resolver | APIS requirements by country (required fields, advance hours), visa requirement by nationality/destination, destination risk levels |

```typescript
import { AirportCodeResolver } from '@otaip/agents-reference';

const resolver = new AirportCodeResolver();
await resolver.initialize();

const result = await resolver.execute({ query: 'LON' });
// â { airports: ['LHR', 'LGW', 'LCY', 'STN', 'LTN', 'SEN'], type: 'metro' }
```

---

## Stage 1 â Search & Shop

Multi-source availability and fare shopping across distribution adapters.

| Agent | Description |
|-------|-------------|
| Agent 1.1 â Availability Search | Parallel multi-adapter search, dedup, segment filtering, codeshare expansion |
| Agent 1.2 â Schedule Lookup | SSIM schedule parsing, operating/marketing flight resolution, codeshare detection |
| Agent 1.3 â Connection Builder | 4-level MCT hierarchy (IATA/airport/terminal/carrier), connection quality scoring |
| Agent 1.4 â Fare Shopping | Fare family comparison, ADT/CHD/INF pricing, branded fare normalization |
| Agent 1.5 â Ancillary Shopping | Available ancillaries per flight: baggage, seats, meals, lounge, WiFi â RFIC codes AâI, per-passenger/per-segment pricing |
| Agent 1.6 â Multi-Source Aggregator | Combine results from multiple adapters, dedup by flight key, keep_cheapest/keep_all/keep_first strategies, partial failure handling |
| Agent 1.7 â Hotel/Car Search | Hotel and car rental search scaffold â defines HotelAdapter/CarAdapter interfaces for future implementors |
| Agent 1.8 â AI Travel Advisor | *Coming soon* â consumer-facing natural language travel search (requires LLM integration) |

The search agents use a plug-in adapter model. Install any distribution adapter and wire it in:

```typescript
import { AvailabilitySearchAgent } from '@otaip/agents-search';
import { DuffelAdapter } from '@otaip/adapter-duffel';

const agent = new AvailabilitySearchAgent({
  adapters: [new DuffelAdapter({ apiKey: process.env.DUFFEL_API_KEY })],
});
```

---

## Stage 2 â Select & Price

ATPCO-compliant pricing logic. All financial math uses `decimal.js` â no floating point for currency.

| Agent | Description |
|-------|-------------|
| Agent 2.1 â Fare Rule Agent | ATPCO categories 1-20, advance purchase, min/max stay, blackout dates, penalties |
| Agent 2.2 â Fare Construction Agent | NUC Ã ROE, TPM/MPM mileage proration, HIP/BHC/CTM checks, IATA rounding rules |
| Agent 2.3 â Tax Calculation Agent | 30 countries, 50 tax codes, exemption engine (diplomatic, infant, transit, frequent flyer) |
| Agent 2.4 â Offer Builder | Assembles air + ancillaries + taxes into a complete priced offer (NDC Offer model), TTL management, in-memory store, `decimal.js` |
| Agent 2.5 â Corporate Policy Validation | Validates an offer against corporate travel policy â cabin class, fare ceiling, blocked carriers, advance booking, bypass codes |
| Agent 2.6 â Dynamic Pricing | *Coming soon* â continuous/dynamic pricing for offer-based airline models (Tier 4) |
| Agent 2.7 â Revenue Management | *Coming soon* â yield optimization and demand forecasting (Tier 4) |

---

## Stage 3 â Book & Order

PNR construction and booking management across GDS and NDC sources.

| Agent | Description |
|-------|-------------|
| Agent 3.5 â API Abstraction | Circuit breaker, exponential backoff retry, per-provider rate limiting, error normalization (10 providers) |
| Agent 3.1 â GDS/NDC Router | Airline â channel mapping for 30 carriers, NDC version selection (21.3/22.1/23.1), codeshare routing logic |
| Agent 3.2 â PNR Builder | GDS command generation for Amadeus/Sabre/Travelport, SSR/OSI codes, DOCS, infant PNR, group bookings |
| Agent 3.3 â PNR Validation | 13 pre-ticketing checks: segment status, TTL expiry, APIS completeness, duplicate detection, married segment integrity |
| Agent 3.4 â Queue Management | Priority scoring, action code routing, GDS queue command stubs (Amadeus/Sabre/Travelport) |
| Agent 3.6 â Order Management | NDC Order lifecycle (create/modify/cancel/fulfil), GDS PNR bridge, full status history, `decimal.js` |
| Agent 3.7 â Payment Processing | FOP validation and instruction generation, PCI raw card detection, GDS FOP string format, payment record store |

---

## Stage 4 â Ticket & Fulfill

Electronic ticket issuance, EMD handling, void windows, and passenger communication.

| Agent | Description |
|-------|-------------|
| Agent 4.1 â Ticket Issuance | 13-digit ETR generation, conjunction tickets (>4 segments â /1/2/3), 30 airline numeric prefixes, BSP reporting, commission calculation |
| Agent 4.2 â EMD Management | EMD-A/EMD-S full lifecycle, RFIC codes AâG (seat/baggage/meal/lounge/rebooking/upgrade/ancillary), RFISC passthrough, `decimal.js` totals |
| Agent 4.3 â Void Agent | Coupon status pre-check, carrier-specific void windows (e.g. FR/U2/W6 = 0h), BSP/ARC cutoff enforcement |
| Agent 4.4 â Itinerary Delivery | Multi-channel delivery: HTML email, plain-text email, SMS (160-char segment splitting), WhatsApp structured blocks |
| Agent 4.5 â Document Verification | Passenger name match, DOB validation, passport number regex per nationality, 6-month validity check, visa requirement stub |

All Stage 4 financial math uses `decimal.js`.

---

## Stage 5 â Change & Exchange

Voluntary change, ticket reissue, and involuntary rebook per ATPCO and regulatory requirements.

| Agent | Description |
|-------|-------------|
| Agent 5.1 â Change Management | ATPCO Category 31, 7 fare rule patterns, free 24h window (US DOT), waiver bypass, residual value calculation, BASIC/non-refundable rejection |
| Agent 5.2 â Exchange/Reissue | Residual-first reissue logic, tax carryforward (same O/D), GDS exchange commands (Amadeus/Sabre/Travelport), conjunction ticket reference, BSP audit trail |
| Agent 5.3 â Involuntary Rebook | >60-minute delay trigger, routing change detection, EU261/2004 compensation flags (31 countries), US DOT 220% rule, alliance/interline protection, original routing credit |
| Agent 5.4 â Disruption Response | Impact assessment, priority scoring (CRITICAL/HIGH/STANDARD), response plan with REBOOK/WAITLIST/REFUND_OFFER/NOTIFY_ONLY actions |
| Agent 5.5 â Self-Service Rebooking | Passenger-facing rebooking within fare rules â eligibility check, fee calculation (FLEX waiver, schedule change waiver), options builder |
| Agent 5.6 â Waitlist Management | Priority queue by tier+cabin+time, clearance likelihood scoring, auto-confirm, alternative suggestions when likelihood LOW |

---

## Stage 6 â Refund & ADM Prevention

BSP/ARC refund processing and pre-ticketing ADM prevention checks.

| Agent | Description |
|-------|-------------|
| Agent 6.1 â Refund Processing | ATPCO Category 33, 7 fare basis rule patterns, full/partial/tax-only refund types, prorated partial refunds, commission recall, waiver bypass, conjunction all-or-none enforcement, BSP + ARC reporting |
| Agent 6.2 â ADM Prevention | 9 pre-ticketing checks: duplicate detection, fare basis/booking class mismatch, passive segment abuse (HX/UN/NO/UC), married segment integrity, TTL buffer, commission vs contracted rate, endorsement validation, tour code, net remit flag |
| Agent 6.3 â ADM/ACM Processing | Full ADM lifecycle (receive/assess/dispute/accept/escalate), 15-day dispute window, 5-day urgency warning, ACM application, deadline-sorted pending queue |
| Agent 6.4 â Customer Communication | Disruption and change notifications (8 types), multi-channel (email/SMS/WhatsApp), SMS segment splitting, template variable substitution |
| Agent 6.5 â Feedback & Complaint | Complaint tracking, US DOT compensation (primary: denied boarding 200%/400% with caps), EU261 (secondary: distance-band amounts, 50% reduction logic), DOT complaint record generation |
| Agent 6.6 â Loyalty & Mileage | Accrual by booking class + status multiplier, OneWorld/SkyTeam/StarAlliance partner tables, redemption eligibility by distance band, status match logic |

---

## Stage 7 â BSP & ARC Settlement

BSP HOT file and ARC IAR reconciliation with discrepancy detection and dispute tracking.

| Agent | Description |
|-------|-------------|
| Agent 7.1 â BSP Reconciliation | HOT file parsing (EDI X12 + fixed-width ASCII), agency-to-BSP matching, discrepancy detection (missing/duplicate/amount/commission/currency/ADM/ACM), pattern detection (>=10 samples), remittance deadline warning, `decimal.js` throughout |
| Agent 7.2 â ARC Reconciliation | IAR parsing (EDI X12/CSV/XML), commission rate validation against airline contracts, ADM dispute window tracking (15-day window, 5-day expiry warning), net remittance calculation, duplicate detection, pattern detection |
| Agent 7.3 â Commission Management | Override agreement tracking by airline + agency + fare basis (wildcard matching), back-end incentive tiers, effective date ranges, commission calculation vs contracted rate, variance flagging, `decimal.js` throughout |
| Agent 7.4 â Interline Settlement | *Coming soon* â prorate calculation, SIS (IATA Simplified Invoicing & Settlement), interline partner billing (pending domain input) |
| Agent 7.5 â Financial Reporting | 9 report types (revenue by route/carrier/period, agency P&L, commission summary, refund liability, unused ticket exposure, spend by traveler/department/supplier), injected data source, `decimal.js` aggregation |
| Agent 7.6 â Revenue Accounting | Coupon lift tracking (OPENâUSED on departure), revenue recognition at lift event, deferred revenue for future travel, proration across conjunctive tickets, `decimal.js` throughout |

---

## Stage 8 â TMC & Agency Operations

Traveler profiles, corporate policy enforcement, mid-office automation, reporting, and duty of care.

| Agent | Description |
|-------|-------------|
| Agent 8.1 â Traveler Profile | CRUD + search, 15 IATA SPML meal codes, SSR injection (DOCS/FQTV/MEAL/SEAT), passport 6-month expiry warning, duplicate detection by email + passport |
| Agent 8.2 â Corporate Account | Cabin policy by domestic/intl/duration, advance booking hard+soft thresholds, fare limits, negotiated fare matching, blacklisted airline rejection, approval threshold, out-of-policy blocking |
| Agent 8.3 â Mid-Office Automation | 6 PNR checks: TTL deadlines (urgent <1h, high <4h), completeness (APIS/contact/FOP), duplicate detection, passive segment abuse (HX/UN/NO/UC), corporate policy, married segment integrity |
| Agent 8.4 â Reporting & Analytics | 9 report types (booking volume, revenue, top routes, agent productivity, policy compliance, spend by traveler/department/supplier, unused tickets), multi-dimension filtering, `decimal.js` aggregation |
| Agent 8.5 â Duty of Care | Traveler location by airport + time window, itinerary lookup, static destination risk (20 countries, 4 levels), mark-as-accounted-for (idempotent), corporate filtering |

---

## Stage 9 â Platform & Integration

Orchestration, knowledge retrieval, observability, audit, and plugin management.

| Agent | Description |
|-------|-------------|
| Agent 9.1 â Orchestrator | 5 workflow pipelines (search_to_price, book_to_ticket, full_booking, exchange_flow, refund_flow), injectable StepExecutor, stop_on_error, timeout with partial result, per-step duration tracking |
| Agent 9.2 â Knowledge Retrieval | Keyword-overlap relevance scoring (0â1), 15 seed documents across 8 travel topics, topic filtering, max_results, query_time_ms |
| Agent 9.3 â Monitoring & Alerting | P50/P95 latency percentiles, error rate %, health thresholds (healthy/degraded/down), auto-fire alerts on state transition, idempotent acknowledge, SLA report with availability % |
| Agent 9.4 â Audit & Compliance | Event logging with retention rules (2555d IATA/PCI, 1095d GDPR), PII redaction (passport/DOB/card/phone/email, nested), GDPR right-to-erasure, compliance issue flagging (4 types, 4 severities) |
| Agent 9.5 â Plugin Manager | Register/unregister/enable/disable, semver validation, duplicate detection, capability discovery (enabled-only), 3 seed plugins (Duffel, Amadeus, expense reporter) |

---

## Distribution adapters

OTAIP is source-agnostic. Agents work with any distribution source via the `DistributionAdapter` interface from `@otaip/core`. You bring the credentials.

**Aggregator adapters (Phase 1):**

| Package | Coverage | API type |
|---------|----------|----------|
| `@otaip/adapter-duffel` | NDC-participating airlines | REST |
| `@otaip/adapter-amadeus` | Full-service carriers via GDS | REST |
| `@otaip/adapter-sabre` | Full-service carriers via GDS | SOAP |
| `@otaip/adapter-verteil` | AF, Finnair, SAS, Oman Air + others | REST (pure NDC) |
| `@otaip/adapter-accelya` | LH Group, American NDC | REST (Farelogix-based) |

**Direct airline adapters (roadmap):** American, Delta, United, Lufthansa, Air France-KLM, and 45 more â each as `@otaip/adapter-{iata-code}`. See [ADAPTER_TARGET_LIST.md](docs/architecture/ADAPTER_TARGET_LIST.md).

---

## Project structure

```
otaip/
âââ packages/
â   âââ core/                    # @otaip/core â Agent interface, types, errors
â   âââ agents-reference/        # @otaip/agents-reference â Stage 0
â   âââ agents-search/           # @otaip/agents-search â Stage 1
â   âââ agents-pricing/          # @otaip/agents-pricing â Stage 2
â   âââ agents-booking/          # @otaip/agents-booking â Stage 3
â   âââ agents-ticketing/        # @otaip/agents-ticketing â Stage 4
â   âââ agents-exchange/         # @otaip/agents-exchange â Stage 5
â   âââ agents-settlement/       # @otaip/agents-settlement â Stage 6
â   âââ agents-reconciliation/   # @otaip/agents-reconciliation â Stage 7
â   âââ agents-tmc/              # @otaip/agents-tmc â Stage 8
â   âââ agents-platform/         # @otaip/agents-platform â Stage 9
â   âââ adapter-duffel/          # @otaip/adapter-duffel â MockDuffelAdapter
âââ agents/
â   âââ TAXONOMY.md              # Full 62-agent taxonomy
â   âââ specs/                   # YAML specs for all agents
âââ docs/
â   âââ architecture/            # ADRs, adapter target list
â   âââ engineering/             # Build queue, briefs
âââ knowledge-base/              # Travel domain knowledge (maintained by Telivity)
âââ pnpm-workspace.yaml
âââ package.json
```

---

## Contributing

Travel domain knowledge is what makes these agents valuable. If you work in airline distribution, GDS/NDC, or TMC operations and you find something wrong â open an issue.

Before writing code, read [CONTRIBUTING.md](CONTRIBUTING.md). The key rules:

- No domain logic without a spec. Every agent has a YAML spec in `agents/specs/` that defines its behavior. If the spec is wrong, fix the spec first.
- TypeScript strict. No `any`. No floating point for currency.
- Tests must encode domain knowledge. A test that says `expect(result).toBeDefined()` is not a test.

---

## License

Apache 2.0. Build on it, fork it, ship it commercially. See [LICENSE](LICENSE).

---

**Built by [Telivity](https://telivity.app)** â the commercial hosting, support, and enterprise layer on top of OTAIP.
