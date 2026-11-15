---
name: backend-engineering
description: Use when implementing or debugging server-side services, protected endpoints, business logic, background jobs, authentication boundaries, tenant-scoped data access, persistence, external API clients, and service integrations. Do not use for frontend-only UI work or API contract design without backend implementation.
metadata:
  extremis.category: software-engineering
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Backend Engineering

## Mission

Implement server-side behavior with clear contracts, safe data handling, operational visibility, and tests.

## Prerequisites

- repository and service context
- API, data, and deployment constraints where available

## Procedure

1. Inspect the current service architecture, language/framework, entry points, persistence layer, authentication, configuration, deployment, and test patterns.
2. Define the requested behavior, consumers, request/response contract, state changes, error semantics, and compatibility expectations.
3. Trace existing flows and ownership boundaries before adding new abstractions. Reuse established patterns where they are sound.
4. Validate inputs at trust boundaries, enforce authorization at the resource/action level, and keep tenant or user data isolated.
5. Design transaction boundaries, idempotency, retries, timeouts, concurrency controls, and resource cleanup for the actual workload.
6. Handle external dependency failures explicitly. Avoid unbounded retries, silent fallbacks, and leaking internal details to clients.
7. Add tests for normal behavior, invalid inputs, authorization failures, concurrency or retry behavior where relevant, and persistence invariants.
8. Add useful structured logging and metrics while redacting secrets and unnecessary personal data.
9. Run the relevant tests, static checks, and build. Review migrations, configuration, and deployment effects before reporting completion.

## Output contract

- Service/API behavior and files changed.
- Data and authorization boundaries.
- Failure and retry semantics.
- Relevant tests and validation results.
- Deployment, migration, and compatibility notes.

## Boundaries and stop conditions

- Never log raw credentials, tokens, or unnecessary sensitive user data.
- Do not weaken authentication or authorization to make a test pass.
- Do not run production migrations or external side effects without explicit authorization.
- Do not claim production readiness from unit tests alone.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
