# Stage 9 — Platform Upgrade Plan

**Created:** 2026-04-05
**Status:** Session 1 complete (plan document)

---

## Build Order

| Session | Module | Dependencies | Status |
|---------|--------|-------------|--------|
| 2 | Module 1 — Schema-Aware Tool Interface | None | **Complete** |
| 3 | Module 5 — Retry with Jitter | None | **Complete** |
| 4 | Module 4 — Context Budget Manager | None | **Complete** |
| 5 | Module 2 — Agent Loop | Module 1 | **Complete** |
| 6 | Module 3 — Lifecycle Hooks | Module 2 | **Complete** |
| 7 | Module 6 — Sub-Agent Spawning + v0.3.0 release | Modules 2, 3 | Pending |

---

## Module 1 — Schema-Aware Tool Interface

**Location:** `packages/core/src/tool-interface/`
**PR:** `feat(core): add schema-aware tool interface`
**Complexity:** Medium (~300 LOC + tests)
**Dependencies:** None (foundation module)

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/tool-interface/types.ts` | `ToolDefinition<TInput, TOutput>` — Zod schema for input/output, name, description, `isEnabled()` |
| `packages/core/src/tool-interface/validator.ts` | `validateToolInput()` / `validateToolOutput()` — runtime schema checking using Zod |
| `packages/core/src/tool-interface/registry.ts` | `ToolRegistry` — register tools, lookup by name, list enabled tools |
| `packages/core/src/tool-interface/index.ts` | Barrel export |
| `packages/core/src/tool-interface/__tests__/tool-interface.test.ts` | Unit tests |

### Modified Files

| File | Change |
|------|--------|
| `packages/core/src/index.ts` | Add exports for tool-interface module |
| `packages/core/package.json` | Add `zod` as dependency (already in connect/agents-platform) |

### Acceptance Criteria

- [ ] `ToolDefinition` type supports Zod schemas for input and output
- [ ] `validateToolInput()` returns typed errors with field-level detail on validation failure
- [ ] `validateToolOutput()` validates agent responses before returning to caller
- [ ] `ToolRegistry` supports register, lookup by name, and listing enabled tools
- [ ] `isEnabled()` callback controls runtime tool availability
- [ ] All tests pass via `pnpm vitest run`
- [ ] Exports accessible from `@otaip/core`

---

## Module 2 — Agent Loop

**Location:** `packages/core/src/agent-loop/`
**PR:** `feat(core): add agent execution loop`
**Complexity:** High (~500 LOC + tests)
**Dependencies:** Module 1 (Tool Interface)

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/agent-loop/types.ts` | `LoopState`, `LoopMessage`, `LoopConfig`, `StopCondition`, typed state transitions (idle → running → tool_call → tool_result → complete/error) |
| `packages/core/src/agent-loop/loop.ts` | `AgentLoop` class — deterministic message→tool→response cycle; accepts `ToolRegistry`, dispatches tool calls, enforces max iterations and stop conditions |
| `packages/core/src/agent-loop/index.ts` | Barrel export |
| `packages/core/src/agent-loop/__tests__/agent-loop.test.ts` | Unit tests with mock tools |

### Modified Files

| File | Change |
|------|--------|
| `packages/core/src/index.ts` | Add exports for agent-loop module |

### Acceptance Criteria

- [ ] `AgentLoop` processes messages, detects tool_use blocks, dispatches to registered tools via `ToolRegistry`
- [ ] Tool inputs validated via Module 1 before execution
- [ ] Tool outputs validated via Module 1 before appending to conversation
- [ ] State machine transitions are typed and deterministic (idle → running → tool_call → tool_result → complete/error)
- [ ] Configurable `maxIterations` stop condition prevents infinite loops
- [ ] Custom `StopCondition` callback support
- [ ] Loop emits structured events (for Module 3 hooks to consume)
- [ ] All tests pass

---

## Module 3 — Lifecycle Hooks

**Location:** `packages/core/src/lifecycle/`
**PR:** `feat(core): add lifecycle hooks`
**Complexity:** Medium (~250 LOC + tests)
**Dependencies:** Module 2 (Agent Loop)

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/lifecycle/types.ts` | `LifecycleEvent` enum (beforeToolCall, afterToolCall, onError, onComplete, onLoopStart, onLoopEnd), `HookHandler` type, `HookContext` |
| `packages/core/src/lifecycle/hook-registry.ts` | `HookRegistry` — register/unregister hooks per event, execute in registration order, support sync and async handlers |
| `packages/core/src/lifecycle/index.ts` | Barrel export |
| `packages/core/src/lifecycle/__tests__/lifecycle.test.ts` | Unit tests |

### Modified Files

| File | Change |
|------|--------|
| `packages/core/src/agent-loop/loop.ts` | Integrate `HookRegistry` — call `beforeToolCall` / `afterToolCall` / `onError` / `onComplete` at appropriate points in the loop |
| `packages/core/src/index.ts` | Add exports for lifecycle module |

### Acceptance Criteria

- [ ] `HookRegistry` supports registering multiple handlers per lifecycle event
- [ ] `beforeToolCall` hooks can inspect and optionally block tool execution (return `{ block: true, reason: string }`)
- [ ] `afterToolCall` hooks receive tool result for logging/metrics
- [ ] `onError` hooks receive the error and loop context
- [ ] `onComplete` hooks fire when loop reaches final answer
- [ ] Hooks execute in registration order, errors in hooks don't crash the loop (logged and skipped)
- [ ] `AgentLoop` integration works end-to-end
- [ ] All tests pass

---

## Module 4 — Context Budget Manager

**Location:** `packages/core/src/context/`
**PR:** `feat(core): add context budget manager`
**Complexity:** Medium (~350 LOC + tests)
**Dependencies:** None (can parallel with Modules 1-3)

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/context/types.ts` | `ContextBudgetConfig`, `CompactionStrategy`, `TokenCounter` interface, `ContextEntry` |
| `packages/core/src/context/budget-manager.ts` | `ContextBudgetManager` — track token usage per message, `shouldCompact()` at configurable threshold (default 90%), `compact()` with pluggable strategies |
| `packages/core/src/context/strategies.ts` | Built-in compaction strategies: `truncateOldest`, `dropLargeToolOutputs`, `summarize` (placeholder — requires LLM call) |
| `packages/core/src/context/index.ts` | Barrel export |
| `packages/core/src/context/__tests__/context-budget.test.ts` | Unit tests |

### Modified Files

| File | Change |
|------|--------|
| `packages/core/src/index.ts` | Add exports for context module |

### Acceptance Criteria

- [ ] `ContextBudgetManager` tracks token count per entry and total
- [ ] `shouldCompact()` returns true when usage exceeds configurable threshold
- [ ] `compact()` applies strategies in priority order until under budget
- [ ] `truncateOldest` removes oldest entries first (preserving N most recent)
- [ ] `dropLargeToolOutputs` replaces entries exceeding a size threshold with summaries
- [ ] `TokenCounter` interface allows pluggable token counting (default: character-based estimate, replaceable with tiktoken)
- [ ] "Hot tail" — most recent N entries are never compacted
- [ ] All tests pass

---

## Module 5 — Retry with Jitter

**Location:** `packages/core/src/retry/`
**PR:** `feat(core): add retry with jitter engine`
**Complexity:** Low (~150 LOC + tests)
**Dependencies:** None (can parallel)

### Reusable Patterns

The existing `BaseAdapter.withRetry()` at `packages/connect/src/base-adapter.ts:39-74` implements exponential backoff without jitter. This module extracts retry into core and adds jitter.

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/retry/types.ts` | `RetryConfig` (maxRetries, baseDelayMs, maxDelayMs, jitterFactor), `RetryableError` interface, `RetryStrategy` |
| `packages/core/src/retry/retry.ts` | `withRetry<T>(config, fn, isRetryable?)` — standalone retry function with exponential backoff + full jitter (`delay * random(0.5, 1.5)`) |
| `packages/core/src/retry/index.ts` | Barrel export |
| `packages/core/src/retry/__tests__/retry.test.ts` | Unit tests verifying jitter distribution, max delay cap, retry count |

### Modified Files

| File | Change |
|------|--------|
| `packages/core/src/index.ts` | Add exports for retry module |
| `packages/connect/src/base-adapter.ts` | Replace inline retry logic with `withRetry` from `@otaip/core` (preserving the existing `RetryConfig` shape for backward compat) |

### Acceptance Criteria

- [ ] `withRetry()` implements exponential backoff: `baseDelayMs * 2^attempt`
- [ ] Jitter applied via full-jitter strategy: `delay * random(0.5, 1.5)`
- [ ] Delay capped at `maxDelayMs`
- [ ] Custom `isRetryable` predicate support
- [ ] `BaseAdapter.withRetry()` refactored to use the new core utility (no behavior change for existing adapters beyond adding jitter)
- [ ] `ConnectError` and existing error detection preserved
- [ ] All existing adapter tests continue to pass
- [ ] New unit tests verify jitter bounds and retry behavior

---

## Module 6 — Sub-Agent Spawning

**Location:** `packages/core/src/sub-agent/`
**PR:** `feat(core): add sub-agent spawning`
**Complexity:** High (~450 LOC + tests)
**Dependencies:** Module 2 (Agent Loop), Module 3 (Lifecycle Hooks)

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/sub-agent/types.ts` | `SubAgentConfig`, `SubAgentResult`, `SpawnOptions` (scoped tool list, context subset, max iterations), `SubAgentHandle` |
| `packages/core/src/sub-agent/spawner.ts` | `SubAgentSpawner` — creates child `AgentLoop` instances with scoped `ToolRegistry` and `HookRegistry`; collects results; enforces no recursive spawning (max depth = 1) |
| `packages/core/src/sub-agent/index.ts` | Barrel export |
| `packages/core/src/sub-agent/__tests__/sub-agent.test.ts` | Unit tests |

### Modified Files

| File | Change |
|------|--------|
| `packages/core/src/index.ts` | Add exports for sub-agent module |

### Acceptance Criteria

- [ ] `SubAgentSpawner.spawn()` creates a child `AgentLoop` with scoped tools and context
- [ ] Parent receives structured `SubAgentResult` when child completes
- [ ] Tool scoping — child only sees tools explicitly granted in `SpawnOptions`
- [ ] Context scoping — child receives a subset of parent context (not full history)
- [ ] Max depth enforcement — sub-agents cannot spawn further sub-agents
- [ ] Lifecycle hooks from parent `HookRegistry` propagate to child (configurable)
- [ ] Timeout support — child aborted if exceeding configured duration
- [ ] All tests pass

---

## Release

| Field | Value |
|-------|-------|
| **Current version** | 0.2.1 |
| **Target version** | 0.3.0 |
| **Version bump session** | Session 7 (after all 6 modules land) |
| **Scope** | All `package.json` files across the monorepo bumped together |

### Package.json Files to Bump

- `package.json` (root)
- `packages/core/package.json`
- `packages/connect/package.json`
- `packages/agents-platform/package.json`
- `packages/agents-tmc/package.json`
- `packages/adapters/duffel/package.json`
- `demo/package.json`

### CHANGELOG.md Entry (Session 7)

Created at repo root. Covers all 6 modules as a single Stage 9 release:

```markdown
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
```

### Verification

After Session 7:
1. `pnpm install` — no workspace resolution errors
2. `pnpm build` — all packages compile
3. `pnpm test` — all tests pass (existing + new)
4. `grep -r '"version"' packages/*/package.json` — all show `0.3.0`
5. `CHANGELOG.md` exists at repo root with Stage 9 entry
