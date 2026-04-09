# ADR-004: YAML Specs as Source of Truth

## Status
Accepted

## Context
Travel domain logic is complex and domain experts (airline operations, GDS specialists) are not always TypeScript developers. We needed a way for domain experts to define agent behavior without writing code, and for developers to have a clear specification to implement against.

## Decision
Every agent has a YAML specification in `agents/specs/` that defines its behavior: input/output types, domain rules, test cases, and edge cases. The spec is written (or reviewed) by domain experts before implementation begins. Code implements the spec; tests encode it.

## Consequences
- Domain experts can review and contribute without reading TypeScript
- Clear separation between "what should it do" (spec) and "how does it do it" (code)
- Specs serve as living documentation
- Spec-first development prevents engineers from inventing domain logic
- Adds overhead: spec must be written before code, and kept in sync
