# OTAIP Architecture

> Contract-driven agent platform for travel distribution, powered by pipeline validation and LLM orchestration.

## High-Level Architecture

```mermaid
graph TB
    subgraph "LLM Layer"
        LLM["Claude / Any LLM"]
    end

    subgraph "Agent Layer (75 agents)"
        REF["Stage 0: Reference<br/>7 agents"]
        SEARCH["Stage 1: Search<br/>9 agents"]
        PRICE["Stage 2: Pricing<br/>7 agents"]
        BOOK["Stage 3: Booking<br/>9 agents"]
        TICKET["Stage 4: Ticketing<br/>5 agents"]
        EXCH["Stage 5: Exchange<br/>6 agents"]
        SETTLE["Stage 6: Settlement<br/>7 agents"]
        RECON["Stage 7: Reconciliation<br/>6 agents"]
        TMC["Stage 8: TMC<br/>6 agents"]
        PLAT["Stage 9: Platform<br/>10 agents"]
        LODGE["Stage 20: Lodging<br/>7 agents"]
        CORE["Core: Offer Evaluator<br/>1 agent"]
    end

    subgraph "Pipeline Infrastructure"
        PV["Pipeline Validator<br/>6 gates"]
        TB["Tool Bridge<br/>agentToTool()"]
        CR["Capability Registry"]
        ES["EventStore"]
    end

    subgraph "Adapter Layer"
        AMADEUS["Amadeus GDS"]
        SABRE["Sabre GDS"]
        NAV["Navitaire LCC"]
        TP["TripPro Aggregator"]
        DUFFEL["Duffel NDC"]
        HAIP["HAIP Hotel PMS"]
    end

    subgraph "Suppliers"
        S1["Airlines"]
        S2["Hotels"]
    end

    LLM -->|"tool_use"| TB
    TB -->|"runAgent()"| PV
    PV -->|"execute()"| REF & SEARCH & PRICE & BOOK & TICKET & EXCH & SETTLE & RECON & TMC & PLAT & LODGE & CORE
    PV -->|"logs"| ES
    SEARCH & BOOK --> CR
    CR --> AMADEUS & SABRE & NAV & TP & DUFFEL & HAIP
    AMADEUS & SABRE & NAV & TP --> S1
    DUFFEL --> S1
    HAIP --> S2
```

## Pipeline Validator Gate Sequence

Every agent invocation passes through six gates. Gates 1-3 run before `execute()`, gates 4-6 run after.

```mermaid
sequenceDiagram
    participant LLM
    participant Bridge as Tool Bridge
    participant PV as Pipeline Validator
    participant Agent
    participant ES as EventStore

    LLM->>Bridge: tool_use(agent_input)
    Bridge->>PV: runAgent(session, agentId, input)

    Note over PV: Gate 1: Intent Lock
    PV->>PV: checkIntentRelevance()
    PV->>PV: checkIntentDrift()

    Note over PV: Gate 2: Schema In
    PV->>PV: inputSchema.safeParse(input)

    Note over PV: Gate 3: Semantic In
    PV->>PV: contract.validate(input, ctx)

    Note over PV: Gate 4: Cross-Agent Consistency
    PV->>PV: checkCrossAgentConsistency(input, priorOutputs)

    PV->>Agent: execute(input)
    Agent-->>PV: AgentOutput

    Note over PV: Gate 5: Schema Out + Confidence
    PV->>PV: outputSchema.safeParse(output)
    PV->>PV: checkConfidence(output.confidence, threshold)

    Note over PV: Gate 6: Action Classification
    PV->>PV: checkActionClassification(actionType)

    PV->>ES: append(agent.executed event)
    PV-->>Bridge: RunAgentResult
    Bridge-->>LLM: tool_result
```

### Gate Details

| Gate | Name | Runs | Purpose |
|------|------|------|---------|
| 1 | Intent Lock | Before execute | Verifies the agent is relevant to the session intent and no drift occurred |
| 2 | Schema In | Before execute | Zod `safeParse` on the input data against `contract.inputSchema` |
| 3 | Semantic In | Before execute | Domain-specific validation via `contract.validate()` (airport codes, dates, etc.) |
| 4 | Cross-Agent | Before execute | Checks input fields are consistent with prior agent outputs in the session |
| 5 | Schema Out + Confidence | After execute | Validates output structure and checks `output.confidence >= threshold` |
| 6 | Action Classification | After execute | Enforces approval requirements for irreversible mutations |

### Confidence Floors

Confidence thresholds are enforced per action type. Contracts may declare higher thresholds, never lower.

| Action Type | Floor |
|-------------|-------|
| `query` | 0.70 |
| `mutation_reversible` | 0.90 |
| `mutation_irreversible` | 0.95 |
| Reference data agents | 0.90 (additional) |

## Tool Bridge: Agent to LLM

The tool bridge converts contracted agents into LLM-callable tools without hand-written JSON schemas.

```mermaid
graph LR
    subgraph "Contract Definition"
        AC["AgentContract<br/>inputSchema: z.object(...)<br/>outputSchema: z.object(...)<br/>actionType: 'query'<br/>validate(): semantic checks"]
    end

    subgraph "Bridge"
        ATT["agentToTool()<br/>Zod → JSON Schema<br/>name from AGENT_TOOL_NAMES"]
    end

    subgraph "LLM Interface"
        TD["ToolDefinition<br/>name: 'availability_search'<br/>description: string<br/>inputSchema: Zod<br/>execute(): Promise"]
    end

    subgraph "Anthropic API"
        AT["Anthropic.Tool<br/>name: string<br/>input_schema: JSON Schema<br/>description: string"]
    end

    AC --> ATT
    ATT --> TD
    TD -->|"zodToJsonSchema()"| AT
```

### Contracted Agent Tool Names

These 14 agents have pipeline contracts with Zod schemas:

| Agent ID | Tool Name | Action Type |
|----------|-----------|-------------|
| 0.1 | `airport_code_resolver` | query |
| 0.2 | `airline_code_mapper` | query |
| 0.3 | `fare_basis_decoder` | query |
| 1.1 | `availability_search` | query |
| 2.1 | `fare_rule_agent` | query |
| 2.4 | `offer_builder` | mutation_reversible |
| 3.1 | `gds_ndc_router` | query |
| 3.2 | `pnr_builder` | mutation_reversible |
| 3.8 | `pnr_retrieval` | query |
| 4.1 | `ticket_issuance` | mutation_irreversible |
| 9.6 | `performance_audit` | query |
| 9.7 | `routing_audit` | query |
| 9.8 | `recommendation` | query |
| 9.9 | `alert` | query |

## EventStore

Every agent execution is logged to the EventStore with duration, gate results, and confidence. The store supports six event types:

```mermaid
graph TB
    subgraph "Event Types"
        AE["agent.executed<br/>agentId, confidence, durationMs, gateResults"]
        RD["routing.decided<br/>carrier, channel, reasoning"]
        RO["routing.outcome<br/>channel, success, latencyMs"]
        BC["booking.completed<br/>bookingRef, totalAmount"]
        BF["booking.failed<br/>failurePoint, errorCode"]
        AH["adapter.health<br/>adapterId, status, errorRate"]
    end

    subgraph "EventStore Interface"
        ES["append(event)<br/>query(filter)<br/>aggregate(metric, window)"]
    end

    subgraph "Implementations"
        IM["InMemoryEventStore<br/>(ships with core)"]
        PG["PostgresEventStore<br/>(planned)"]
    end

    AE & RD & RO & BC & BF & AH --> ES
    ES --> IM
    ES -.-> PG
```

Governance agents (9.6 PerformanceAudit, 9.7 RoutingAudit, 9.8 Recommendation, 9.9 Alert) query the EventStore to produce audit reports and recommendations.

## Package Structure

```
packages/
  core/                  @otaip/core — Agent interface, errors, pipeline validator,
                         tool bridge, EventStore, agent loop
  connect/               @otaip/connect — ConnectAdapter interface, BaseAdapter,
                         5 supplier adapters (Amadeus, Sabre, Navitaire, TripPro, HAIP)
  adapters/duffel/       @otaip/duffel — Standalone Duffel NDC adapter
  agents/
    reference/           @otaip/agents-reference — Stage 0 (7 agents)
    search/              @otaip/agents-search — Stage 1 (9 agents)
    pricing/             @otaip/agents-pricing — Stage 2 (7 agents)
    booking/             @otaip/agents-booking — Stage 3 (9 agents, incl. fallback-chain utility)
    ticketing/           @otaip/agents-ticketing — Stage 4 (5 agents)
    exchange/            @otaip/agents-exchange — Stage 5 (6 agents)
    settlement/          @otaip/agents-settlement — Stage 6 (7 agents)
    reconciliation/      @otaip/agents-reconciliation — Stage 7 (6 agents)
    lodging/             @otaip/agents-lodging — Stage 20 (7 agents)
  agents-tmc/            @otaip/agents-tmc — Stage 8 (6 agents)
  agents-platform/       @otaip/agents-platform — Stage 9 (10 agents)
```

## Design Principles

1. **Contract-first**: Agent behavior is declared through `AgentContract` with Zod schemas. No hand-written JSON schemas.
2. **Pipeline-validated**: Every agent call passes through 6 gates. The LLM cannot hallucinate offer IDs, change destinations mid-flow, or ticket without approval.
3. **Event-sourced observability**: Every execution is logged with duration, confidence, and gate results for governance agents to analyze.
4. **Adapter-agnostic**: Agents talk to a `DistributionAdapter` / `ConnectAdapter` interface. Swapping Amadeus for Sabre requires zero agent changes.
5. **Domain-safe**: No invented domain logic. Travel industry edge cases are surfaced as `DOMAIN_QUESTION` comments, not guessed.
