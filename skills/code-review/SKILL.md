---
name: code-review
description: Use when reviewing a pull request, patch, commit, or proposed code change for correctness, regressions, maintainability, performance, and operational risks before it is accepted or shipped.
metadata:
  extremis.category: software-engineering
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Code Review

## Mission

Find defects that matter to users and operators. Review the change against its intent and surrounding contracts, not against personal style preferences.

## Prerequisites

- the proposed diff or changed files
- repository context; tests or runtime access recommended

## Procedure

1. Establish the review target: base and head revisions, stated intent, affected users, compatibility constraints, and whether the review is read-only.
2. Read the full diff, then inspect surrounding code and call sites. Trace changed behavior through its inputs, state transitions, persistence, APIs, and error paths.
3. Check correctness first: boundary conditions, nullability, concurrency, ordering, retries, idempotency, data integrity, and backward compatibility.
4. Check security and privacy defensively: authentication and authorization boundaries, input validation, output encoding, secret handling, sensitive logging, and least privilege.
5. Check reliability and operations: failure handling, timeouts, resource cleanup, observability, migration/rollback behavior, and deployment assumptions.
6. Run or inspect relevant tests. Identify missing tests for changed contracts and distinguish confirmed failures from unverified risks.
7. Report only actionable findings. Each finding must cite a file and line or symbol, explain concrete impact, state confidence, and suggest a minimal remedy.
8. Summarize residual risks and checks performed. If no material defect is found, say that this review found none within the inspected scope rather than declaring the change bug-free.

## Output contract

- Findings ordered by severity with path and line references.
- A concise explanation of impact and reproduction or reasoning.
- Missing regression coverage and verification status.
- A review-scope statement and residual uncertainties.

## Boundaries and stop conditions

- Do not modify the patch unless the user explicitly asks for fixes.
- Do not invent vulnerabilities from hypothetical inputs without a plausible path through the code.
- Do not treat formatting preferences as correctness blockers.
- Never expose secrets found during review; redact them and recommend rotation through the proper owner.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
