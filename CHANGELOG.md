# Changelog

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
