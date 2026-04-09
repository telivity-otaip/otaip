# ADR-005: Adapter Pattern for Distribution

## Status
Accepted

## Context
Airlines distribute inventory through multiple channels: GDS (Amadeus, Sabre, Travelport), NDC (direct airline APIs), and aggregators (Duffel, Kiwi). Each has different APIs, authentication, data formats, and capabilities. OTAIP agents need to work with any source without being coupled to a specific one.

## Decision
A `DistributionAdapter` interface in `@otaip/core` defines the contract: `search()`, optional `price()`, and `isAvailable()`. Each supplier gets its own adapter implementation. Agents accept adapters via dependency injection. The Connect framework (`@otaip/connect`) provides a higher-level `ComplexAdapter` interface for suppliers that support booking, ticketing, and cancellation.

## Consequences
- Agents are source-agnostic — same fare construction logic works with Duffel, Sabre, or Amadeus data
- New suppliers can be added without changing existing agents
- Each adapter encapsulates supplier-specific quirks (auth, pagination, error codes)
- Testing uses mock adapters (MockDuffelAdapter) — no real API calls in unit tests
- Slight overhead: each new supplier requires a new adapter package
