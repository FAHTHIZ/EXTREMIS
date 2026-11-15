---
name: api-design
description: Use when designing or revising an HTTP, RPC, event, or internal service API, including endpoint contracts, request and response schemas, errors, versioning, and compatibility.
metadata:
  extremis.category: software-engineering
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# API Design

## Mission

Create an interface that is understandable to consumers, enforceable by implementations, and evolvable without surprising breakage.

## Prerequisites

- the API's consumers and use cases
- service constraints and existing conventions; protocol documentation where relevant

## Procedure

1. Identify consumers, primary use cases, trust boundaries, data sensitivity, expected scale, and latency or availability expectations.
2. Choose the interaction model and define resource or operation boundaries. Prefer domain language and clear ownership over endpoints that mirror database tables.
3. Specify request and response schemas, required versus optional fields, validation rules, units, timestamps, identifiers, and pagination semantics.
4. Define success and error behavior: status or result codes, stable machine-readable error identifiers, safe messages, retryability, and correlation identifiers.
5. Design authentication and authorization expectations explicitly. Apply least privilege, tenant isolation, input limits, and data minimization.
6. Specify idempotency and concurrency behavior for writes, including duplicate requests, retries, optimistic concurrency, and ordering where relevant.
7. Plan compatibility and evolution: versioning policy, additive changes, deprecation windows, migration notes, and contract tests for consumers.
8. Review examples against the schema, document operational limits and rate policies, and validate the design with representative consumer scenarios before implementation.

## Output contract

- API purpose and consumer assumptions.
- Endpoint or operation inventory with request/response schemas.
- Error, authentication, pagination, idempotency, and versioning contracts.
- Examples, compatibility risks, and contract-test recommendations.

## Boundaries and stop conditions

- Do not invent protocol features unsupported by the chosen transport or framework.
- Do not put credentials or sensitive personal data in URLs, logs, or examples.
- If regulatory or safety-critical data is involved, flag the need for domain and compliance review.
- Mark unresolved design choices instead of silently choosing semantics consumers may depend on.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
