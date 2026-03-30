# Contributing to OTAIP

Thank you for your interest in contributing to the Open Travel AI Platform.

## Requirements

- Node.js >= 20
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- TypeScript strict mode — no `any` types, no implicit returns

## Development Workflow

```bash
pnpm install
pnpm run data:download    # fetch reference datasets
pnpm run lint             # ESLint with type-checked rules
pnpm run typecheck        # TypeScript strict
pnpm test                 # vitest
```

**CI must pass before merge.** The pipeline runs lint, typecheck, data download, and tests on every push and PR.

## Adding a New Agent

1. **Write a spec first.** Create a YAML spec in `agents/specs/` following the existing format. Specs define input/output types, reference data sources, confidence scoring, and test cases.

2. **Get domain review.** Travel domain logic must come from industry experts, published standards (IATA, ATPCO, ISO), or authoritative data sources. Do not invent domain rules.

3. **Implement the agent.** Follow the structure in `packages/agents/reference/src/airport-code-resolver/`:
   - `types.ts` — Input/output types with JSDoc
   - `data.ts` or `data-loader.ts` — Reference data
   - `resolver.ts` or equivalent — Core logic
   - `index.ts` — Agent class implementing `Agent<TInput, TOutput>` from `@otaip/core`
   - `__tests__/*.test.ts` — 15+ tests minimum

4. **Re-export** from `packages/agents/reference/src/index.ts`.

5. **Run the full CI locally** before pushing:
   ```bash
   pnpm run lint && pnpm run typecheck && pnpm test
   ```

## Code Standards

- **TypeScript strict** — `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`
- **No `any`** — use `unknown`, proper types, or generics
- **ESM imports** — use `.js` extensions in import paths
- **Agent interface** — every agent implements `initialize()`, `execute()`, `health()`
- **Error handling** — use `AgentNotInitializedError`, `AgentInputValidationError`, `AgentDataUnavailableError` from `@otaip/core`
- **Confidence scores** — 1.0 exact match, 0.5-0.9 partial, 0 not found

## Domain Knowledge

Where domain input is needed but not yet available, mark it with a `TODO` comment:

```typescript
// TODO: [NEEDS DOMAIN INPUT] Carrier-specific fare filing data
// required for complete booking class mappings.
```

Do not invent travel industry logic. Incorrect domain rules in airline systems can cause real operational issues. When in doubt, leave a `TODO` and document what source would provide the correct data.

## Commit Messages

Use clear, imperative commit messages:
- `Add Agent 0.2: Airline Code & Alliance Mapper`
- `Fix IATA code lookup for decommissioned airports`
- `Update Star Alliance membership list`

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
