# Scaling Guide

## Architecture characteristics

OTAIP agents are **stateless** by default. Each `execute()` call is self-contained — it takes input, produces output, and holds no state between calls. This makes horizontal scaling straightforward.

## Bottlenecks

The primary bottleneck is **external API rate limits**, not OTAIP computation:

| Supplier | Typical rate limit | OTAIP mitigation |
|----------|-------------------|------------------|
| Duffel | ~100 req/s | `RateLimiter` from `@otaip/core` |
| Sabre | Varies by contract | Circuit breaker in Agent 3.5 |
| Amadeus | ~10 TPS (self-service) | Adapter-level rate limiting |
| Navitaire | Session-based | Session manager in adapter |

## Horizontal scaling

Since agents are stateless:
1. Run multiple instances behind a load balancer
2. Each instance gets its own adapter connections
3. No shared state between instances (by default)

## Stateful agents

Two agents hold state across calls:
- **Agent 2.4 (Offer Builder)**: TTL-managed offer store
- **Agent 3.6 (Order Management)**: Order lifecycle state

For multi-instance deployments, inject a shared `PersistenceAdapter` (Redis, PostgreSQL) instead of the default `InMemoryPersistenceAdapter`.

## Memory profile

Most agents are lightweight (~10MB per agent instance). The main memory consumers are:
- Reference data (airport database): ~50MB shared across agents
- Offer cache (Agent 2.4): grows with active offers, bounded by TTL
- Knowledge base (Agent 9.2): ~1MB for seed documents

## Monitoring

Use the `PlatformHealthAggregator` from `@otaip/agents-platform` to aggregate health across all agents. Wire it to your existing monitoring (Prometheus, Datadog, etc.).

Use the `TelemetryProvider` from `@otaip/core` to emit spans for each agent execution. The `NoopTelemetryProvider` has zero overhead when no backend is configured.
