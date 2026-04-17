# OTAIP Demos

Interactive booking demos powered by Claude + OTAIP agents.

## Prerequisites

```bash
pnpm install          # from repo root
cp .env.example .env  # or create .env manually
```

## Credentials

Each demo requires different credentials in `.env` at the repo root:

| Demo | Credentials needed |
|---|---|
| `book:full` | `ANTHROPIC_API_KEY` |
| `book` | `ANTHROPIC_API_KEY` + `DUFFEL_API_KEY` |
| `book:amadeus` | `ANTHROPIC_API_KEY` + Amadeus sandbox keys |
| `book:sabre` | `ANTHROPIC_API_KEY` + Sabre sandbox keys |
| `book:direct` | `DUFFEL_API_KEY` only (no LLM) |

### Getting an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-...`

## Running

```bash
# Full pipeline demo (Sprint B) — contract-driven tools, 6-gate validator, EventStore
pnpm --filter @otaip/demo book:full

# Original Duffel demo — LLM + Duffel sandbox
pnpm --filter @otaip/demo book

# Direct booking (no LLM) — Duffel sandbox only
pnpm --filter @otaip/demo book:direct

# Amadeus sandbox
pnpm --filter @otaip/demo book:amadeus

# Sabre sandbox
pnpm --filter @otaip/demo book:sabre
```

## Full Pipeline Demo (`book:full`)

The `book-flight-full.ts` demo shows the Sprint A/B architecture end-to-end:

1. **Agent contracts** define Zod schemas — single source of truth for both runtime validation and LLM tool definitions
2. **Catalog generator** produces Anthropic tool definitions from contracts (no hand-written JSON)
3. **`agentToTool()` bridge** wraps each agent so every tool call runs through the **6-gate pipeline validator**:
   - Schema conformance (Zod)
   - Semantic validation (airport/carrier/date checks)
   - Intent lock (can't change destination mid-flow)
   - Cross-agent consistency (can't fabricate offer IDs)
   - Confidence gating (must meet threshold for action type)
   - Action classification (irreversible actions need approval)
4. **EventStore** logs every agent execution with duration, confidence, and gate results
5. **Pipeline summary** printed at the end shows the full invocation history

### What you'll see

```
============================================================
OTAIP Full Pipeline Demo
Contract-driven tools · 6-gate pipeline validator · EventStore logging
============================================================

Tools available: availability_search, fare_rule_agent, gds_ndc_router, pnr_builder, pnr_retrieval

--- Agent step 1 ---
[TOOL CALL] availability_search
{ "origin": "LHR", "destination": "AMS", ... }
[RESULT] { "offers": [...], "total_raw_offers": 5, ... }

--- Agent step 2 ---
[TOOL CALL] gds_ndc_router
...

============================================================
Pipeline Summary
============================================================
Session: sess_...
Intent: LHR → AMS on 2026-04-30
Invocations: 3
  1.1 [ok] intent_lock:pass schema_in:pass semantic_in:pass cross_agent:pass ...
  3.1 [ok] intent_lock:pass schema_in:pass ...
  3.2 [ok] intent_lock:pass schema_in:pass ...

EventStore: 3 agent.executed events logged
  Total duration: 250ms | Avg: 83ms | p95: 150ms
```

If the LLM sends a bad input (wrong airport code, fabricated offer ID, changed destination), the pipeline catches it and returns a structured error the LLM can use to self-correct.
