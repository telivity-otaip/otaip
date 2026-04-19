# Hotelbeds Adapter Demo

Walk the full Hotelbeds Hotels API lifecycle in one command, against the real test sandbox.

## Quick Start

1. Get sandbox API credentials from <https://developer.hotelbeds.com>.
2. Run:

```bash
HOTELBEDS_API_KEY=your-key HOTELBEDS_SECRET=your-secret npx tsx demo/index.ts
```

Or search a specific destination:

```bash
HOTELBEDS_API_KEY=your-key HOTELBEDS_SECRET=your-secret npx tsx demo/index.ts --destination LON
```

## What it does

1. Auth handshake against `/status`
2. Searches hotels (2 nights, 8 weeks out, 2 adults)
3. Shows the top 3 results with stars, price/night, and meal plan
4. Picks the cheapest BOOKABLE rate (or the cheapest RECHECK rate after re-validating)
5. Books the room with test holder data
6. Retrieves the booking confirmation
7. Simulates cancellation to show the cancel fee
8. Cancels the booking — leaves the sandbox clean

Full lifecycle in roughly ten seconds. If anything fails after the booking is created, the demo attempts a cleanup cancellation so it never leaves a dangling reservation.

## Sandbox quota

Hotelbeds caps the test sandbox at **50 requests per day**. The demo uses ~7 requests per run. Don't loop it.

## Credentials

Sign up at <https://developer.hotelbeds.com> for an API key and secret. The demo only reads them from `HOTELBEDS_API_KEY` and `HOTELBEDS_SECRET` — never put them in code or commit them to a repo.
