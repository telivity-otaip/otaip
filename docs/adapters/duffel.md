# Duffel NDC Adapter

> Standalone NDC adapter connecting to the Duffel REST API for multi-airline search, pricing, and booking.

## Capabilities

| Operation | Supported | Notes |
|-----------|-----------|-------|
| Search | &#10003; | `POST /air/offer_requests` |
| Price | &#10003; | Offer price confirmation |
| Book | &#10003; | Order creation with passenger details |
| Cancel | -- | Not yet implemented |
| Health Check | &#10003; | `GET /air/airlines` connectivity test |

**Channel capability manifest:**

```typescript
{
  channelId: 'duffel',
  channelType: 'ndc',
  supportsNdcLevel: 3,
  supportedCarriers: ['*'],
  supportedFunctions: ['search', 'price', 'book_held', 'ticket', 'refund', 'exchange', 'ssr', 'seat_map'],
  reliabilityScore: 0.9,
  latencyScore: 0.78,
  costScore: 0.65,
}
```

Note: The capability manifest declares full NDC functions. The current adapter implements search, price, and book. Ticketing is handled automatically by Duffel where the carrier supports instant issue.

## Authentication

**API token** (Bearer header).

1. Sign up at [duffel.com](https://duffel.com) (free for test mode)
2. Copy your test token from the dashboard (starts with `duffel_test_`)
3. Pass the token when constructing the adapter

The token is sent as `Authorization: Bearer <token>` on every request. The `Duffel-Version` header is included for API versioning.

## Configuration

The Duffel adapter is configured via constructor parameters (not a Zod config object like ConnectAdapter adapters):

```typescript
// Constructor accepts an API key string or a config object
const adapter = new DuffelAdapter(process.env.DUFFEL_API_KEY);
```

The adapter hits `https://api.duffel.com` directly. Test mode vs. live mode is determined by the token prefix (`duffel_test_` vs `duffel_live_`).

## Usage

```typescript
import { DuffelAdapter } from '@otaip/duffel';

const adapter = new DuffelAdapter(process.env.DUFFEL_API_KEY);

// Check health
const available = await adapter.isAvailable();

// Search flights
const response = await adapter.search({
  origin: 'LHR',
  destination: 'JFK',
  departureDate: '2026-06-15',
  passengers: { adults: 1 },
  cabinClass: 'economy',
  maxResults: 10,
});

// Price a specific offer
const priced = await adapter.price({
  offerId: response.offers[0].offer_id,
});

// Book
const booking = await adapter.book({
  offerId: response.offers[0].offer_id,
  passengers: [{
    given_name: 'John',
    family_name: 'Test',
    born_on: '1985-01-01',
    email: 'john@example.com',
    phone_number: '+442080160509',
    type: 'adult',
    gender: 'm',
    title: 'mr',
  }],
});
```

## Sandbox Setup

Duffel provides a free test environment with synthetic airline data:

1. Go to [duffel.com](https://duffel.com) and create an account
2. From the dashboard, navigate to API tokens
3. Copy the **test mode** token (prefixed `duffel_test_`)
4. Set in your `.env`: `DUFFEL_API_KEY=duffel_test_...`
5. Test mode returns simulated offers from a "Duffel Airways" test airline

No credit card required for test mode.

## Internal Details

- **Implements `DistributionAdapter`** (from `@otaip/core`), not `ConnectAdapter` (from `@otaip/connect`). This is a standalone adapter package.
- **Native fetch**: Uses Node.js 24+ global `fetch` -- no HTTP client dependency
- **Decimal math**: All monetary calculations use `decimal.js`
- **Duration parsing**: `parseDurationToMinutes()` converts ISO 8601 durations (e.g., "PT5H30M") to minutes
- **Cabin class mapping**: Maps Duffel cabin classes (economy, premium_economy, business, first) to OTAIP types
- **Mock adapter**: `mock-duffel-adapter.ts` provides a deterministic mock for testing

## Tests

32 tests across two test files:
- `duffel-adapter.test.ts` -- 27 tests covering search, price, book, health check, error handling
- `duffel-e2e.test.ts` -- 5 tests for end-to-end flow validation (mocked)

All tests use mocked HTTP responses.

## Known Limitations

- **No cancel**: Order cancellation is not yet implemented in the adapter
- **No exchange/refund**: Post-booking service operations are not implemented
- **No seat selection**: Seat map and ancillary selection are not exposed
- **Test carrier only**: In test mode, only Duffel's synthetic airline returns results. Live mode requires a production token with carrier agreements.
- **Separate package**: Lives in `packages/adapters/duffel/`, not in `packages/connect/`. Implements a different interface (`DistributionAdapter` vs `ConnectAdapter`).

## Source Files

```
packages/adapters/duffel/src/
  duffel-adapter.ts      -- DuffelAdapter class (live API)
  mock-duffel-adapter.ts -- Mock adapter for testing
  capabilities.ts        -- Channel capability manifest
  index.ts               -- Package exports
  __tests__/
    duffel-adapter.test.ts
    duffel-e2e.test.ts
```
