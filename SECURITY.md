# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | Yes       |
| < 0.2   | No        |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email security@telivity.app with:

- Description of the vulnerability
- Steps to reproduce
- Impact assessment (what can an attacker do?)
- Affected package(s) and version(s)

We will acknowledge receipt within 48 hours and provide an initial assessment within 5 business days.

## Scope

OTAIP agents process travel booking data including PNR records, fare calculations, passenger information, and payment routing. Security issues in these areas are high priority.

Areas of concern:

- **Agent input validation** — injection or bypass of validation in any agent's `execute()` method
- **Payment routing** — any issue in the Hotel Booking Agent (4.5) or Payment Processing Agent (3.7) that could cause incorrect payment routing or data exposure
- **PII handling** — passenger names, passport numbers, contact details flowing through agents
- **Adapter authentication** — credential handling in distribution adapters (Duffel, Sabre, etc.)
- **Supply chain** — vulnerabilities in direct dependencies

## Out of Scope

- Vulnerabilities in development-only dependencies (esbuild dev server, etc.) that don't affect production use
- Issues that require physical access to the machine running OTAIP
- Social engineering attacks

## Disclosure

We follow coordinated disclosure. We'll work with you on a timeline and credit you in the advisory unless you prefer to remain anonymous.
