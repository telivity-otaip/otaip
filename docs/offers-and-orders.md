# Offers & Orders Data Model

OTAIP supports both PNR-based and Order-based booking models. The travel industry is mid-transition — some carriers use GDS PNRs, some are moving to IATA ONE Order. OTAIP speaks both through a unified `BookingReference` bridge.

## AIDM 24.1 Alignment

The Order model follows IATA Airline Industry Data Model (AIDM) 24.1 terminology:

| AIDM Message | OTAIP Method | Description |
|---|---|---|
| `OrderCreate` | `orderCreate()` | Create an order from an offer |
| `OrderRetrieve` | `orderRetrieve()` | Fetch an existing order |
| `OrderChange` | `orderChange()` | Modify an existing order |
| `OrderCancel` | `orderCancel()` | Cancel an order |

Entity names (`Offer`, `OfferItem`, `Order`, `OrderItem`, `Service`) align with AIDM concepts. The implementation is JSON — not the AIDM XML schema.

## Dual Model: PNR + Order

```
BookingReference
├── PnrReference { type: 'pnr', recordLocator, gds? }
└── OrderReference { type: 'order', orderId, owner }
```

Agents accept `BookingReference` and let the adapter decide the underlying model. The `GdsNdcRouter` determines whether a channel is PNR-based or Order-based.

### When to use which

| Scenario | Model | Why |
|---|---|---|
| GDS booking (Amadeus, Sabre) | PNR | GDS systems create PNRs |
| NDC booking (Duffel) | Order | NDC uses offer/order model |
| ONE Order certified (Navitaire) | Order | Native order operations |
| Mixed itinerary (GDS + NDC) | Both | Each segment uses its channel's model |

### Queue management

Queue management stays PNR-only. Orders use event-driven status changes (`OrderEvent`), not queues. The `OrderEventType` union covers the full lifecycle: `order.created`, `order.confirmed`, `order.ticketed`, `order.changed`, `order.cancelled`, `order.payment_received`, `order.payment_failed`, `order.refunded`.

## Data Model

### Service — the atomic unit

Everything sold is a `Service`:

```typescript
interface Service {
  serviceId: string;
  type: 'flight' | 'seat' | 'baggage' | 'meal' | 'lounge' | 'insurance' | 'ancillary';
  flight?: FlightService;    // populated when type='flight'
  description?: string;      // for non-flight services
}
```

### Offer → Order flow

```
1. Airline publishes Offer (with OfferItems containing Services)
2. Customer selects Offer → OrderCreate
3. System creates Order (with OrderItems referencing OfferItems)
4. Payment processed → order.payment_received event
5. Tickets issued → order.ticketed event
6. Customer flies → order.completed
```

### Key types

| Type | Description |
|---|---|
| `Money` | Decimal string amount + ISO 4217 currency |
| `Service` | Atomic sellable unit (flight, seat, bag, etc.) |
| `Offer` | What the airline is selling (OfferItems with prices) |
| `Order` | What the customer bought (OrderItems with status) |
| `OrderPassenger` | Passenger with travel docs, loyalty, contact |
| `TicketDocument` | Issued ticket (ET, EMD-A, EMD-S) |
| `OrderPayment` | Payment record with method + status |
| `OrderEvent` | Status change event (no queues) |
| `BookingReference` | Union: PnrReference \| OrderReference |

## Bridge Utilities

```typescript
import {
  createPnrReference,
  createOrderReference,
  isPnrReference,
  isOrderReference,
  getBookingIdentifier,
  pnrPassengerToOrderPassenger,
} from '@otaip/core';

// Create references
const pnr = createPnrReference('ABC123', 'AMADEUS');
const order = createOrderReference('ORD-001', 'BA');

// Type-safe branching
if (isPnrReference(ref)) {
  // PNR-specific logic (queue management, GDS commands)
} else {
  // Order-specific logic (OrderChange, event-driven status)
}

// Convert PNR passenger data to Order model
const orderPax = pnrPassengerToOrderPassenger(pnrPassenger, 'pax-1');
```

## Zod Schemas

Every type has a corresponding Zod schema for runtime validation and JSON Schema generation:

```typescript
import { orderSchema, offerSchema, orderChangeRequestSchema } from '@otaip/core';

// Validate an order
const result = orderSchema.safeParse(data);

// Generate JSON Schema for LLM tools
import { zodToJsonSchema } from '@otaip/core';
const jsonSchema = zodToJsonSchema(orderSchema);
```

## Sprint H: OOSD Adapter Support (completed)

Sprint H delivered Order-native adapter support for two channels:

### Navitaire — `NavitaireOrderOperations`

Navitaire is ONE Order certified. The `NavitaireOrderOperations` class implements `OrderOperations` natively, mapping dotREZ order endpoints to AIDM 24.1 operations. Orders get `NAV-ORD-*` IDs and full event history tracking. See `docs/adapters/oosd-navitaire.md` for details.

### Duffel — `DuffelOrderBridge`

Duffel already uses orders as its booking primitive. The `DuffelOrderBridge` bridges Duffel's native order model to OTAIP's `Order` types. Orders get `DFL-ORD-*` IDs.

### Channel capabilities

Both adapters now declare `supportsOrders: true` and `orderOperations: ['create', 'retrieve', 'change', 'cancel']` in their capability manifests. The `GdsNdcRouter` uses this flag to decide PNR vs Order path per channel.

### Multi-adapter search

Sprint H also added `MultiSearchService` in `examples/ota/` which fans out search requests to multiple `DistributionAdapter` instances in parallel, merges results with source attribution, and sorts by price. Configure via `ADAPTERS` env var (comma-separated).
