---
name: database-design
description: Use when designing relational or document data models, schemas, indexes, constraints, migrations, retention rules, or data-access boundaries for an application.
metadata:
  extremis.category: software-engineering
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Database Design

## Mission

Design a data model that preserves domain invariants and supports real access patterns without premature complexity.

## Prerequisites

- known entities and application use cases
- read access to current schema and query patterns for existing systems

## Procedure

1. Gather business concepts, lifecycle states, ownership rules, cardinalities, expected query patterns, scale, retention, and data sensitivity.
2. Map entities and relationships. Distinguish identifiers, natural keys, derived attributes, immutable facts, and mutable state.
3. Define types, nullability, uniqueness, check constraints, foreign keys or equivalent integrity mechanisms, and deletion semantics.
4. Design indexes from observed or expected queries. Explain each index's purpose and account for write amplification and storage cost.
5. Define transactions and consistency needs for multi-record changes, concurrent updates, retries, and idempotent writes.
6. Plan migrations as explicit forward steps with compatibility for old and new application versions. Include backup, rollback or roll-forward strategy, and data validation.
7. Review privacy and governance: minimum required fields, access boundaries, encryption expectations, retention, deletion, export, and auditability.
8. Validate with representative queries, constraints, migration tests, and realistic volumes where available. Record assumptions and follow-up measurements.

## Output contract

- Entity/relationship model and schema proposal.
- Constraints and index rationale tied to access patterns.
- Migration and rollback/roll-forward plan.
- Data lifecycle, privacy, and validation checklist.

## Boundaries and stop conditions

- Never execute schema changes on production without explicit authorization and an approved recovery plan.
- Do not store secrets in ordinary application tables without an approved secrets design.
- Do not claim performance improvements without representative measurements.
- Flag data deletion, retention, or jurisdiction questions for qualified review.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
