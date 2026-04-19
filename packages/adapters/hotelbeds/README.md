# @otaip/adapter-hotelbeds

OTAIP distribution adapter for the Hotelbeds APItude bedbank (Hotels API).

> Part of [OTAIP](https://github.com/telivity-otaip/otaip) — the Open Travel AI Platform.

## Installation

```bash
pnpm add @otaip/adapter-hotelbeds
```

## Quick Demo

See it work end-to-end in ~10 seconds against the real Hotelbeds sandbox:

```bash
HOTELBEDS_API_KEY=xxx HOTELBEDS_SECRET=yyy npx tsx demo/index.ts
```

Searches Orlando hotels → books the cheapest room → confirms → cancels. Full lifecycle, sandbox cleaned up at the end. See [`demo/README.md`](./demo/README.md).

## Scope

This package wraps the Hotelbeds **Hotels** API (`/hotel-api/1.0`):

- `availability` — search bookable rates
- `checkRate` — re-verify a `RECHECK` rate before booking
- `book` — confirm a booking
- `getBooking` / `listBookings` — retrieve booked reservations
- `cancelBooking` — simulate or execute a cancellation

The Transfers and Activities APIs are explicitly **not** in scope here — they
are tracked as a follow-up so this adapter stays focused on the bedbank
content path that unblocks the lodging pipeline.

## Configuration

Either pass credentials to the constructor or set environment variables:

| Env var             | Description                       |
| ------------------- | --------------------------------- |
| `HOTELBEDS_API_KEY` | Hotelbeds APItude API key         |
| `HOTELBEDS_SECRET`  | Hotelbeds APItude shared secret   |
| `HOTELBEDS_ENV`     | `test` (default) or `production`  |

The Hotelbeds **test** environment is rate-limited to 50 requests/day. The
adapter does not enforce this client-side; callers are expected to throttle.

## Authentication

Every request carries:

```
Api-key:     <apiKey>
X-Signature: SHA256(apiKey + secret + floor(Date.now() / 1000)).hex
```

The signature is regenerated per request because it embeds the current Unix
timestamp.

## License

Apache-2.0
