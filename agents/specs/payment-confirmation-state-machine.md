# Payment-to-Confirmation State Machine Spec

**Agent:** 3.6 (Order Management)
**Domain:** Air ONLY
**Status:** Implemented

## Problem

The gap between "payment captured" and "ticket issued" is an orphan state with real money at risk. Agent 3.6 needs to track this gap, detect conflicts (late confirmation during refund), and resolve them using BSP reporting status.

## OrderState Model

Three independent status fields:

```typescript
interface OrderState {
  payment_status: 'PENDING' | 'CAPTURED' | 'REFUND_INITIATED' | 'REFUNDED' | 'REFUND_REVERSED';
  confirmation_status: 'PENDING' | 'AWAITING' | 'CONFIRMED' | 'TIMEOUT' | 'RETRY' | 'FAILED';
  reconciliation_status: 'CLEAN' | 'CONFLICT' | 'RESOLVED';
}
```

## Valid State Transitions

### Payment Status
- PENDING → CAPTURED
- CAPTURED → REFUND_INITIATED
- REFUND_INITIATED → REFUNDED
- REFUNDED → REFUND_REVERSED

### Confirmation Status
- PENDING → AWAITING
- AWAITING → CONFIRMED | TIMEOUT
- TIMEOUT → RETRY | FAILED
- RETRY → CONFIRMED | TIMEOUT
- CONFIRMED → (terminal)
- FAILED → (terminal)

### Reconciliation Status
- CLEAN → CONFLICT
- CONFLICT → RESOLVED
- RESOLVED → (terminal)

## Domain Rules

1. **BSP refund finality**: Once reported to BSP, irreversible. Same-day void is the only reversal.
2. **GDS has NO idempotency keys**: Session-based dedup only (30-min sessions).
3. **NDC has built-in duplicate detection**: 24-hour window.
4. **"Confirmation" = ticket issued**, not PNR created.
5. **Void ≠ Refund**: Void erases before settlement; refund reverses after settlement.
6. **Conflict resolution priority**: BSP reporting status → void window → manual intervention. Fixed order, no judgment.

## Conflict Resolution Paths

When a ticket confirmation arrives while a refund is in progress:

- **Path A (BSP reported)**: Keep refund, void ticket. Refund is final.
- **Path B (not reported, void window open)**: Void refund, keep ticket.
- **Path C (not reported, void window closed)**: Manual intervention required.

## Test Scenarios

1. Happy path — PENDING → CAPTURED → AWAITING → CONFIRMED
2. Delayed confirmation — AWAITING → TIMEOUT → RETRY → CONFIRMED
3. Failed confirmation — all retries exhausted → FAILED → REFUND_INITIATED → REFUNDED
4. Late confirmation during refund — conflict detection + 3 BSP-based resolution paths
5. Duplicate retry prevention — idempotency key enforcement
6. Double refund prevention — race condition guard
7. Change request gate check — canAcceptChange false unless CONFIRMED
8. Refund window expiry — cannot refund before confirmation FAILED
9. Audit trail completeness — every transition logged, immutable, reconstructable
10. Concurrent order isolation — orders don't leak state

## Files

```
packages/agents/booking/src/order-management/
├── order-state.ts              — Types, transition maps, InvalidStateTransitionError
├── state-machine.ts            — PaymentConfirmationStateMachine class
├── conflict-resolver.ts        — BSP-based conflict resolution
└── __tests__/
    ├── mocks.ts                — Shared test mocks
    ├── order-state.test.ts     — State model unit tests
    ├── state-machine.test.ts   — Tests 1-3, 5-8, 10
    ├── conflict-resolver.test.ts — Test 4 (3 resolution paths)
    └── payment-confirmation.integration.test.ts — Test 9 + full flows
```
