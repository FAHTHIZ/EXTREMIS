---
name: feature-delivery
description: "Use when taking a software feature end to end: from requirements through plan, test-first implementation, review and release notes, as one coordinated workflow."
license: Apache-2.0
metadata:
  extremis.domain: software-engineering
  extremis.version: "0.1.0"
  extremis.kind: workflow
---

# Feature Delivery

## Mission

End-to-end workflow: requirements, plan, tests, implementation, review and release. This workflow coordinates other EXTREMIS capabilities; activate each step's capability when you reach it rather than loading them all up front.

## Prerequisites

- a feature request, user story or issue
- repository access and a runnable test command

## Steps

1. **requirements** (`requirements-engineering`): Turn the request into testable acceptance criteria and explicit non-goals.
2. **plan** (`technical-planning`): Choose an approach, list affected modules, risks and a rollback path. After: requirements. Tools: `code.repo_map`.
3. **tests** (`test-driven-development`): Write failing tests that encode each acceptance criterion. After: plan.
4. **implement** (`backend-engineering`): Implement the smallest change that makes the tests pass. After: tests.
5. **review** (`code-review`): Review the diff for defects, missing tests and credentials. After: implement. Tools: `code.diff_stats`, `security.secret_scan`.
6. **release** (`devops-release`): Write the changelog entry and rollout and rollback notes. After: review. Tools: `release.changelog`.

Steps without an `after` list can run in parallel. Skip an optional step only when its input does not exist, and say so in the output.

## Done when

- Every acceptance criterion maps to at least one passing test
- The diff was reviewed and has no unresolved high-severity findings
- A changelog entry and rollback note exist

## Output

A short summary of each completed step, the evidence it produced (tool output or file references), anything skipped and why, and the final deliverable.

## Guardrails

- Do not mark a step done without its evidence.
- Stop and report if a step finds a blocking problem; do not continue to later steps as if it passed.
- Keep scope to what the requester is authorized to change or assess.
