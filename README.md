# OTAIP — Open Travel AI Platform

**The composable AI agent stack for the travel industry.**

OTAIP is an open source agent orchestration platform that encodes travel industry domain knowledge — fare rules, GDS/NDC protocols, ATPCO categories, BSP/ARC settlement logic — into typed, testable TypeScript agents. Plug in your distribution credentials. Get a full booking engine.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/telivity-otaip/otaip/actions/workflows/ci.yml/badge.svg)](https://github.com/telivity-otaip/otaip/actions)
[![Tests](https://img.shields.io/badge/tests-1067%20passing-brightgreen)](https://github.com/telivity-otaip/otaip/actions)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

---

## What's shipped

| Stage | Package | Agents | Tests | Status |
|-------|---------|--------|-------|--------|
| Stage 0 — Reference Data | `@otaip/agents-reference` | 5 | 144 | ✅ Complete |
| Stage 1 — Search & Shop | `@otaip/agents-search` | 4 | 123 | ✅ Complete |
| Stage 2 — Select & Price | `@otaip/agents-pricing` | 3 | 90 | ✅ Complete |
| Stage 3 — Book & Order | `@otaip/agents-booking` | 5 | 189 | ✅ Complete |
| Stage 4 — Ticket & Fulfill | `@otaip/agents-ticketing` | 5 | 160 | ✅ Complete |
| Stage 5 — Change & Exchange | `@otaip/agents-exchange` | 3 | 104 | ✅ Complete |
| Stage 6 — Refund & ADM | `@otaip/agents-settlement` | 2 | 83 | ✅ Complete |
| Stage 7 — BSP/ARC Settlement | `@otaip/agents-reconciliation` | 2 | 73 | ✅ Complete |
| Stage 8 — TMC & Agency Ops | `@otaip/agents-tmc` | 5 | 101 | ✅ Complete |
| Stage 9 — Platform & Integration | `@otaip/agents-platform` | — | — | 🔜 Next |

**34 agents. 1067 tests. All green.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Your Application                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                        @otaip/core                           │
│          Agent interface · Types · Error standards           │
└──┬──────────┬──────────┬──────────┬──────────┬──────────────┘
   │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼
Stage 0    Stage 1    Stage 2    Stage 3    Stage 4
Reference  Search &   Select &   Book &     Ticket &
Data       Shop       Price      Order      Fulfill
           │
           ▼
    ┌──────────────┐
    │ Distribution │
    │   Adapters   │
    │              │
    │ Duffel       │
    │ Amadeus      │
    │ Sabre        │
    │ Verteil      │
    │ Accelya      │
    └──────────────┘
           │
   ▼          ▼          ▼          ▼
Stage 5    Stage 6    Stage 7    Stage 8
Change &   Refund &   BSP/ARC    TMC &
Exchange   ADM        Settlement Agency Ops
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

## Stage 0 — Reference Data

The foundation. Pure TypeScript, static datasets, zero external dependencies.

| Agent | Description |
|-------|-------------|
| Agent 0.1 — Airport/City Code Resolver | 48K airports from OurAirports, 22 metro area mappings (LON, NYC, PAR…), IATA/ICAO/FAA lookup |
| Agent 0.2 — Airline Code & Alliance Mapper | IATA/ICAO code mapping, alliance membership, codeshare partner resolution |
| Agent 0.3 — Fare Basis Code Decoder | Fare basis string parsing: booking class, cabin, season, AP/advance purchase, min/max stay |
| Agent 0.4 — Class of Service Mapper | Booking class → cabin mapping per airline, RBD hierarchy, fare family association |
| Agent 0.6 — Currency & Tax Code Resolver | ISO 4217, BSP settlement currencies, tax code lookup (30 countries, 50 tax codes) |

```typescript
import { AirportCodeResolver } from '@otaip/agents-reference';

const resolver = new AirportCodeResolver();
await resolver.initialize();

const result = await resolver.execute({ query: 'LON' });
// → { airports: ['LHR', 'LGW', 'LCY', 'STN', 'LTN', 'SEN'], type: 'metro' }
```

---

## Stage 1 — Search & Shop

Multi-source availability and fare shopping across distribution adapters.

| Agent | Description |
|-------|-------------|
| Agent 1.1 — Availability Search | Parallel multi-adapter search, dedup, segment filtering, codeshare expansion |
| Agent 1.2 — Schedule Lookup | SSIM schedule parsing, operating/marketing flight resolution, codeshare detection |
| Agent 1.3 — Connection Builder | 4-level MCT hierarchy (IATA/airport/terminal/carrier), connection quality scoring |
| Agent 1.4 — Fare Shopping | Fare family comparison, ADT/CHD/INF pricing, branded fare normalization |

The search agents use a plug-in adapter model. Install any distribution adapter and wire it in:

```typescript
import { AvailabilitySearchAgent } from '@otaip/agents-search';
import { DuffelAdapter } from '@otaip/adapter-duffel';

const agent = new AvailabilitySearchAgent({
  adapters: [new DuffelAdapter({ apiKey: process.env.DUFFEL_API_KEY })],
});
```

---

## Stage 2 — Select & Price

ATPCO-compliant pricing logic. All financial math uses `decimal.js` — no floating point for currency.

| Agent | Description |
|-------|-------------|
| Agent 2.1 — Fare Rule Agent | ATPCO categories 1-20, advance purchase, min/max stay, blackout dates, penalties |
| Agent 2.2 — Fare Construction Agent | NUC × ROE, TPM/MPM mileage proration, HIP/BHC/CTM checks, IATA rounding rules |
| Agent 2.3 — Tax Calculation Agent | 30 countries, 50 tax codes, exemption engine (diplomatic, infant, transit, frequent flyer) |

---

## Stage 3 — Book & Order

PNR construction and booking management across GDS and NDC sources.

| Agent | Description |
|-------|-------------|
| Agent 3.5 — API Abstraction | Circuit breaker, exponential backoff retry, per-provider rate limiting, error normalization (10 providers) |
| Agent 3.1 — GDS/NDC Router | Airline → channel mapping for 30 carriers, NDC version selection (21.3/22.1/23.1), codeshare routing logic |
| Agent 3.2 — PNR Builder | GDS command generation for Amadeus/Sabre/Travelport, SSR/OSI codes, DOCS, infant PNR, group bookings |
| Agent 3.3 — PNR Validation | 13 pre-ticketing checks: segment status, TTL expiry, APIS completeness, duplicate detection, married segment integrity |
| Agent 3.4 — Queue Management | Priority scoring, action code routing, GDS queue command stubs (Amadeus/Sabre/Travelport) |

---

## Stage 4 — Ticket & Fulfill

Electronic ticket issuance, EMD handling, void windows, and passenger communication.

| Agent | Description |
|-------|-------------|
| Agent 4.1 — Ticket Issuance | 13-digit ETR generation, conjunction tickets (>4 segments → /1/2/3), 30 airline numeric prefixes, BSP reporting, commission calculation |
| Agent 4.2 — EMD Management | EMD-A/EMD-S full lifecycle, RFIC codes A–G (seat/baggage/meal/lounge/rebooking/upgrade/ancillary), RFISC passthrough, `decimal.js` totals |
| Agent 4.3 — Void Agent | Coupon status pre-check, carrier-specific void windows (e.g. FR/U2/W6 = 0h), BSP/ARC cutoff enforcement |
| Agent 4.4 — Itinerary Delivery | Multi-channel delivery: HTML email, plain-text email, SMS (160-char segment splitting), WhatsApp structured blocks |
| Agent 4.5 — Document Verification | Passenger name match, DOB validation, passport number regex per nationality, 6-month validity check, visa requirement stub |

All Stage 4 financial math uses `decimal.js`.

---

## Stage 5 — Change & Exchange

Voluntary change, ticket reissue, and involuntary rebook per ATPCO and regulatory requirements.

| Agent | Description |
|-------|-------------|
| Agent 5.1 — Change Management | ATPCO Category 31, 7 fare rule patterns, free 24h window (US DOT), waiver bypass, residual value calculation, BASIC/non-refundable rejection |
| Agent 5.2 — Exchange/Reissue | Residual-first reissue logic, tax carryforward (same O/D), GDS exchange commands (Amadeus/Sabre/Travelport), conjunction ticket reference, BSP audit trail |
| Agent 5.3 — Involuntary Rebook | >60-minute delay trigger, routing change detection, EU261/2004 compensation flags (31 countries), US DOT 220% rule, alliance/interline protection, original routing credit |

---

## Stage 6 — Refund & ADM Prevention

BSP/ARC refund processing and pre-ticketing ADM prevention checks.

| Agent | Description |
|-------|-------------|
| Agent 6.1 — Refund Processing | ATPCO Category 33, 7 fare basis rule patterns, full/partial/tax-only refund types, prorated partial refunds, commission recall, waiver bypass, conjunction all-or-none enforcement, BSP + ARC reporting |
| Agent 6.2 — ADM Prevention | 9 pre-ticketing checks: duplicate detection, fare basis/booking class mismatch, passive segment abuse (HX/UN/NO/UC), married segment integrity, TTL buffer, commission vs contracted rate, endorsement validation, tour code, net remit flag |

---

## Stage 7 — BSP & ARC Settlement

BSP HOT file and ARC IAR reconciliation with discrepancy detection and dispute tracking.

| Agent | Description |
|-------|-------------|
| Agent 7.1 — BSP Reconciliation | HOT file parsing (EDI X12 + fixed-width ASCII), agency-to-BSP matching, discrepancy detection (missing/duplicate/amount/commission/currency/ADM/ACM), pattern detection (>=10 samples), remittance deadline warning, `decimal.js` throughout |
| Agent 7.2 — ARC Reconciliation | IAR parsing (EDI X12/CSV/XML), commission rate validation against airline contracts, ADM dispute window tracking (15-day window, 5-day expiry warning), net remittance calculation, duplicate detection, pattern detection |

---

## Stage 8 — TMC & Agency Operations

Traveler profiles, corporate policy enforcement, mid-office automation, reporting, and duty of care.

| Agent | Description |
|-------|-------------|
| Agent 8.1 — Traveler Profile | CRUD + search, 15 IATA SPML meal codes, SSR injection (DOCS/FQTV/MEAL/SEAT), passport 6-month expiry warning, duplicate detection by email + passport |
| Agent 8.2 — Corporate Account | Cabin policy by domestic/intl/duration, advance booking hard+soft thresholds, fare limits, negotiated fare matching, blacklisted airline rejection, approval threshold, out-of-policy blocking |
| Agent 8.3 — Mid-Office Automation | 6 PNR checks: TTL deadlines (urgent <1h, high <4h), completeness (APIS/contact/FOP), duplicate detection, passive segment abuse (HX/UN/NO/UC), corporate policy, married segment integrity |
| Agent 8.4 — Reporting & Analytics | 9 report types (booking volume, revenue, top routes, agent productivity, policy compliance, spend by traveler/department/supplier, unused tickets), multi-dimension filtering, `decimal.js` aggregation |
| Agent 8.5 — Duty of Care | Traveler location by airport + time window, itinerary lookup, static destination risk (20 countries, 4 levels), mark-as-accounted-for (idempotent), corporate filtering |

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

**Direct airline adapters (roadmap):** American, Delta, United, Lufthansa, Air France-KLM, and 45 more — each as `@otaip/adapter-{iata-code}`. See [ADAPTER_TARGET_LIST.md](docs/architecture/ADAPTER_TARGET_LIST.md).

---

## Project structure

```
otaip/
├── packages/
│   ├── core/                    # @otaip/core — Agent interface, types, errors
│   ├── agents-reference/        # @otaip/agents-reference — Stage 0
│   ├── agents-search/           # @otaip/agents-search — Stage 1
│   ├── agents-pricing/          # @otaip/agents-pricing — Stage 2
│   ├── agents-booking/          # @otaip/agents-booking — Stage 3
│   ├── agents-ticketing/        # @otaip/agents-ticketing — Stage 4
│   ├── agents-exchange/         # @otaip/agents-exchange — Stage 5
│   ├── agents-settlement/       # @otaip/agents-settlement — Stage 6
│   ├── agents-reconciliation/   # @otaip/agents-reconciliation — Stage 7
│   ├── agents-tmc/              # @otaip/agents-tmc — Stage 8
│   └── adapter-duffel/          # @otaip/adapter-duffel — MockDuffelAdapter
├── agents/
│   ├── TAXONOMY.md              # Full 62-agent taxonomy
│   └── specs/                   # YAML specs for all agents
├── docs/
│   ├── architecture/            # ADRs, adapter target list
│   └── engineering/             # Build queue, briefs
├── knowledge-base/              # Travel domain knowledge (maintained by Telivity)
├── pnpm-workspace.yaml
└── package.json
```

---

## Contributing

Travel domain knowledge is what makes these agents valuable. If you work in airline distribution, GDS/NDC, or TMC operations and you find something wrong — open an issue.

Before writing code, read [CONTRIBUTING.md](CONTRIBUTING.md). The key rules:

- No domain logic without a spec. Every agent has a YAML spec in `agents/specs/` that defines its behavior. If the spec is wrong, fix the spec first.
- TypeScript strict. No `any`. No floating point for currency.
- Tests must encode domain knowledge. A test that says `expect(result).toBeDefined()` is not a test.

---

## License

Apache 2.0. Build on it, fork it, ship it commercially. See [LICENSE](LICENSE).

---

**Built by [Telivity](https://telivity.app)** — the commercial hosting, support, and enterprise layer on top of OTAIP.
