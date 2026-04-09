# ADR-003: Stage Numbering System

## Status
Accepted

## Context
OTAIP covers multiple travel verticals (air, hotel, car, rail) and multiple lifecycle phases (search through settlement). We needed a numbering scheme that organizes agents by domain and lifecycle while leaving room for growth.

## Decision
Stages 0-9 for air travel (the core domain), with higher ranges reserved for other verticals:
- 0-9: Air (reference, search, price, book, ticket, exchange, settlement, reconciliation, TMC, platform)
- 20-29: Lodging (hotel booking lifecycle)
- 30-39: Car Rental (future)
- 40-49: Rail (future)

Within each stage, agents are numbered sequentially (e.g., 1.1, 1.2, ..., 1.8).

## Consequences
- Clear mental model: stage number tells you the domain and lifecycle phase
- Room for 10 agents per air stage, extensible if needed
- Non-air verticals have their own namespace (no collision)
- Gaps between ranges (10-19) are reserved for future air stages
