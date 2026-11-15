---
name: decision-log
description: Use when recording, comparing, or revisiting a significant project, architecture, product, or operational decision and its rationale.
metadata:
  extremis.category: productivity
  extremis.version: "0.1.0"
  extremis.risk: low
---

# Decision Log

## Mission

Preserve why a decision was made so future contributors can understand, implement, and revisit it intelligently.

## Prerequisites

- the decision question and available context
- options and decision status; decision owner if known

## Procedure

1. State the decision question, context, date, scope, and decision status: proposed, accepted, rejected, superseded, or deprecated.
2. Record constraints and success criteria. Separate facts, assumptions, preferences, and non-negotiable requirements.
3. List realistic alternatives, including the option to defer or do nothing. Describe each fairly.
4. Compare alternatives against the same criteria such as user impact, cost, complexity, reversibility, risk, performance, and maintenance.
5. Record the selected option and the actual rationale. Name the decision owner only when explicitly known.
6. Document consequences: trade-offs accepted, follow-up work, dependencies, migration needs, and risks that remain.
7. Define revisit triggers such as a new constraint, changed usage, failed assumption, cost threshold, security issue, or new evidence.
8. Link related requirements, issues, designs, and prior decisions. Update the status when later evidence supersedes the decision.

## Output contract

- Decision title, status, date, and scope.
- Context, constraints, and assumptions.
- Options and comparison criteria.
- Decision rationale and consequences.
- Owner, follow-up actions, and revisit triggers.

## Boundaries and stop conditions

- Do not backdate decisions or fabricate approval.
- Do not present a proposal as an accepted decision.
- Preserve minority concerns and unresolved objections when material.
- Do not disclose confidential decision context beyond its authorized audience.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
