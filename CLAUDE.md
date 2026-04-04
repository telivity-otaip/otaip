# OTAIP — Claude Code Constitution

## Core Rule
**DO NOT INVENT DOMAIN LOGIC.** All travel domain knowledge comes from files in `docs/knowledge-base/`. If something is ambiguous or missing, write a `// TODO: DOMAIN_QUESTION: {question}` comment and move on. Do not guess. Do not fill gaps from "general knowledge." Hotel and airline domains have edge cases that seem obvious but aren't.

## When Blocked
If you lack domain input to proceed: refactor, clean, document existing code, then surface the blocking question. Never invent travel industry behavior.

## Tech Stack
- TypeScript (strict mode — all strict flags ON)
- Node.js >=20
- pnpm 9.15+ (workspace monorepo)
- Vitest for testing
- tsup for building
- ESLint + Prettier for linting/formatting
- ESM modules (type: "module")

## Agent Contract
Every agent implements:
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
Imported from `@otaip/core`.

## Error Handling
Use existing error classes from `@otaip/core`:
- `AgentNotInitializedError` — execute() before initialize()
- `AgentInputValidationError` — bad input (with field + reason)
- `AgentDataUnavailableError` — external source down
- `AgentError` — base class for custom errors

## Agent File Structure
Follow the pattern in `packages/agents/reference/src/airport-code-resolver/`:
```
{agent-name}/
  types.ts          — all input/output/internal types
  {logic}.ts        — core business logic (pure functions)
  index.ts          — Agent interface implementation
  __tests__/
    {agent}.test.ts  — vitest tests
```

## Rules
- No `any` types without explicit justification comment
- No secrets or API keys in code
- No hardcoded credentials
- Every agent needs tests
- Agents are stateless
- Use existing error classes, don't create new ones unless necessary
- Mock external APIs in tests — never call real APIs from tests

## Domain Knowledge
- Air: `docs/knowledge-base/` (existing)
- Lodging: `docs/knowledge-base/lodging.md`
- Agent definitions: `docs/agents/`

## Repository Structure
```
packages/
  core/             — base types, errors, shared utilities
  agents/
    reference/      — airport-code-resolver (reference implementation)
    lodging/        — Stage 20: hotel booking lifecycle (7 agents)
```
