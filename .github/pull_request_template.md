## What does this PR do?

<!-- One or two sentences. Link the issue if there is one. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New agent or adapter
- [ ] Enhancement to existing agent
- [ ] Domain logic correction
- [ ] Documentation
- [ ] Infrastructure / CI
- [ ] Refactor (no behavior change)

## Checklist

- [ ] `pnpm test` passes (all tests, not just mine)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes with zero errors
- [ ] No `any` types without a justification comment
- [ ] No floating point for currency — use string-based decimal or `decimal.js`
- [ ] Agent spec in `agents/specs/` updated if behavior changed
- [ ] New domain logic has a source (IATA doc, ATPCO category, industry reference, or operational experience cited in comment)
- [ ] Tests encode domain knowledge, not just `expect(result).toBeDefined()`

## Domain impact

<!-- If this changes travel industry logic, explain what changes and why.
     If this is purely technical (refactor, docs, CI), write "N/A". -->

## Test plan

<!-- How did you verify this works? What test cases did you add? -->
