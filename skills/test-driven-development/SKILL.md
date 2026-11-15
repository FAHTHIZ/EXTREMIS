---
name: test-driven-development
description: Use when implementing or changing software behavior, adding a feature, fixing a defect, or refactoring code where a regression test can express the intended contract.
metadata:
  extremis.category: software-engineering
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Test-Driven Development

## Mission

Turn requirements into executable examples, then make the smallest implementation that satisfies them without weakening existing guarantees.

## Prerequisites

- repository access
- project test tooling or an explicitly documented verification alternative

## Procedure

1. Clarify the behavior, inputs, outputs, invariants, and failure cases. Identify the smallest externally observable contract before choosing an implementation.
2. Inspect the existing test framework, fixtures, conventions, and relevant implementation. Reuse the project's established tools rather than introducing a new test stack.
3. Write one focused test for one behavior. Prefer assertions on public behavior and stable outputs over private methods, call counts, or implementation details.
4. Run that test before changing production code. Confirm it fails for the intended reason. If it passes already or fails due to setup, correct the test or environment before proceeding.
5. Implement the minimum coherent change that makes the test pass. Avoid speculative options, unrelated refactors, broad exception swallowing, or weakening assertions.
6. Run the focused test again, then neighboring tests and the broader suite where feasible. Preserve and report unrelated baseline failures instead of hiding them.
7. Refactor only while the relevant tests remain green. Remove temporary scaffolding and inspect the final diff for accidental scope expansion.
8. Report the behavior covered, the red/green evidence, commands run, results, and known gaps. Never claim an unrun check passed.

## Output contract

- A focused test that expresses the intended behavior.
- A minimal implementation or a clear explanation of why implementation is blocked.
- Exact test commands and observed outcomes.
- A regression-risk note when coverage is incomplete.

## Boundaries and stop conditions

- If a test cannot be run, label the verification limitation and use the strongest available static or manual check.
- Do not delete, skip, xfail, or weaken a test merely to obtain a green run.
- Do not run destructive integration tests against real user data or production systems without explicit authorization.
- For generated code or configuration-only changes where TDD is unsuitable, document the alternative verification strategy.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
