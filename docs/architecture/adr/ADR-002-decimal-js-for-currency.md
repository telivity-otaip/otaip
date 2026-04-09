# ADR-002: decimal.js for All Financial Math

## Status
Accepted

## Context
IEEE 754 floating point cannot represent all decimal fractions exactly. `0.1 + 0.2 !== 0.3` in JavaScript. In airline settlement, a rounding error of even one cent across millions of transactions creates real discrepancies that trigger ADMs and regulatory issues.

## Decision
All monetary calculations in OTAIP use `decimal.js`. No floating point arithmetic for currency, tax, commission, or any value that represents money. Every agent package that handles financial data depends on `decimal.js`.

## Consequences
- Exact decimal arithmetic matching BSP/ARC settlement expectations
- Slightly more verbose code (`new Decimal(amount).plus(tax)` vs `amount + tax`)
- Additional dependency (~30KB), but universal and well-maintained
- Developers must use Decimal for all financial fields — enforced by code review and TypeScript types where possible
