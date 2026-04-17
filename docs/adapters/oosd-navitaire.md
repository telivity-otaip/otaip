# Navitaire — ONE Order (OOSD) Adapter

Navitaire's dotREZ platform is ONE Order certified, meaning it natively supports the IATA AIDM offer/order model rather than traditional PNR-based booking. OTAIP's `NavitaireOrderOperations` class implements the `OrderOperations` interface to expose this capability.

## How it differs from PNR-based Navitaire operations

The existing `NavitaireAdapter` (in `@otaip/connect`) implements the `ConnectAdapter` interface using Navitaire's session-stateful booking flow: sell, add passengers, add contact, add payment, commit. This creates a PNR (record locator).

`NavitaireOrderOperations` uses the AIDM 24.1 order model instead:

| PNR model (`NavitaireAdapter`) | Order model (`NavitaireOrderOperations`) |
|---|---|
| Creates a PNR with record locator | Creates an Order with `NAV-ORD-*` ID |
| Multi-step stateful flow | Single `orderCreate()` call |
| Status via booking retrieve | Status via `OrderEvent` stream |
| Cancel by deleting journeys | Cancel via `orderCancel()` |
| No change tracking | Full event history via `orderViewHistory()` |

## OrderOperations methods

| Method | Navitaire dotREZ endpoint (real) | Description |
|---|---|---|
| `orderCreate(offer, passengers, payment)` | `POST /api/nsk/v4/orders` | Create order from an offer |
| `orderRetrieve(orderId)` | `GET /api/nsk/v4/orders/{id}` | Retrieve an existing order |
| `orderChange(change)` | `PUT /api/nsk/v4/orders/{id}` | Add/remove/modify order items |
| `orderCancel(orderId, reason?)` | `DELETE /api/nsk/v4/orders/{id}` | Cancel an order |
| `orderViewHistory(orderId)` | `GET /api/nsk/v4/orders/{id}/events` | Retrieve event history |

## Channel capabilities

```typescript
{
  channelId: 'navitaire',
  channelType: 'lcc',
  supportsOrders: true,
  orderOperations: ['create', 'retrieve', 'change', 'cancel'],
}
```

The `supportsOrders` flag tells the `GdsNdcRouter` to use the Order path instead of the PNR path when routing through Navitaire.

## Mock implementation

The current implementation is a mock — no real Navitaire API calls are made. Orders are stored in an in-memory `Map`. This follows the same pattern as the existing `NavitaireAdapter` mock.

The mock generates realistic order IDs (`NAV-ORD-XXXXXX`), maps offer items to order items, records events for each lifecycle action, and validates state transitions (e.g., double-cancel throws).

## Usage

```typescript
import { NavitaireOrderOperations } from '@otaip/connect';
import type { Offer, OrderPassenger, OrderPayment } from '@otaip/core';

const ops = new NavitaireOrderOperations();

// Create an order
const order = await ops.orderCreate(offer, passengers, payment);
console.log(order.orderId); // "NAV-ORD-A1B2C3"

// Retrieve it
const retrieved = await ops.orderRetrieve(order.orderId);

// View history
const events = await ops.orderViewHistory(order.orderId);
// [{ type: 'order.created', ... }]

// Cancel
const cancelled = await ops.orderCancel(order.orderId, 'Customer request');
```
