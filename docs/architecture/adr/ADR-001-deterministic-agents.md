# ADR-001: Deterministic Agents Over ML/LLM

## Status
Accepted

## Context
Travel domain logic (fare construction, tax calculation, GDS commands, regulatory compliance) requires exact, auditable, reproducible results. A fare rule engine that returns different results on the same input is a bug, not a feature. Airlines, BSP, and regulators require deterministic outputs for financial settlement.

## Decision
Most OTAIP agents are deterministic TypeScript — pure functions with typed inputs and outputs, no ML inference. The sole exception is Agent 1.8 (AI Travel Advisor), which uses an injectable LLM provider for natural language understanding only.

## Consequences
- All financial calculations are reproducible and auditable
- Agents can be tested with exact assertions, not probabilistic thresholds
- No model hosting costs, cold start latency, or inference variability
- Domain logic changes require code changes, not model retraining
- The LLM integration point (Agent 1.8) is isolated and optional
