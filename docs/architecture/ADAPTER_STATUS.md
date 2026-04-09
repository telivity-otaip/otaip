# Adapter Status

## Standalone Adapters

| Adapter | Package | Search | Price | Book | Ticket | Cancel | Status |
|---------|---------|--------|-------|------|--------|--------|--------|
| Duffel | `@otaip/adapter-duffel` | Yes | Yes | Yes | No | No | Implemented (requires credentials) |

## Connect Framework Adapters

All Connect adapters are fully implemented with real HTTP calls, request/response mapping, authentication, and unit tests.

| Adapter | Search | Price | Book | Ticket | Cancel | Lines of Mapping | Auth |
|---------|--------|-------|------|--------|--------|------------------|------|
| Sabre (GDS) | Yes | Yes | Yes | Yes | Yes | ~707 | OAuth2 |
| Amadeus | Yes | Yes | Yes | No | No | ~491 | SDK (OAuth) |
| Navitaire | Yes | Yes | Yes | Yes | Yes | ~680 | JWT + Session |
| TripPro/Mondee | Yes | Yes | Yes | Yes | Yes | ~337 | API Key + Token |
| HAIP (Hotel PMS) | Yes | N/A | Yes | N/A | Yes | ~434 | Auth header |

## Channel Generators

| Channel | Format | Valid | Tests |
|---------|--------|-------|-------|
| ChatGPT (Custom GPT) | OpenAPI 3.1 | Yes | Yes |
| Claude (MCP Server) | MCP Protocol | Yes | Yes |

## Roadmap

| Adapter | Coverage | API Type |
|---------|----------|----------|
| Verteil | AF, Finnair, SAS, Oman Air + others | REST (pure NDC) |
| Accelya | LH Group, American NDC | REST (Farelogix-based) |

## Notes

- All Connect adapters have been tested against mock/sandbox APIs. Production validation requires your own credentials.
- The Duffel adapter has both a MockDuffelAdapter (for testing) and a live DuffelAdapter.
- Navitaire uses stateful sessions — the adapter manages session lifecycle automatically.
- HAIP is hotel-only (PMS integration for property management).
