---
name: release-readiness
description: "Use when deciding whether a build is ready to ship: check tests, API compatibility, dependencies, containers, SLO budget and release notes, then give a go or no-go with evidence."
license: Apache-2.0
metadata:
  extremis.domain: software-engineering
  extremis.version: "0.1.0"
  extremis.kind: workflow
---

# Release Readiness

## Mission

Workflow: go/no-go release check across tests, compatibility, security and reliability. This workflow coordinates other EXTREMIS capabilities; activate each step's capability when you reach it rather than loading them all up front.

## Prerequisites

- the release candidate revision
- test report, API specs and SLO data if available

## Steps

1. **tests** (`quality-assurance`): Confirm the test report has no failures or errors. Tools: `test.parse_report`.
2. **compat** (`api-design`, optional): Check API changes for breaking changes and the version bump. Tools: `api.openapi_diff`.
3. **security** (`secure-code-review`): Check for new secrets, flagged dependencies and container issues. Tools: `security.secret_scan`, `code.dependency_inventory`, `container.dockerfile_lint`.
4. **reliability** (`reliability-analysis`, optional): Confirm the error budget allows a release. Tools: `reliability.slo_budget`.
5. **notes** (`devops-release`): Write release notes, rollout plan and rollback trigger. After: tests, compat, security, reliability. Tools: `release.changelog`.

Steps without an `after` list can run in parallel. Skip an optional step only when its input does not exist, and say so in the output.

## Done when

- A go or no-go decision is stated with the evidence behind it
- Every blocking issue has an owner
- A rollback trigger and procedure are written down

## Output

A short summary of each completed step, the evidence it produced (tool output or file references), anything skipped and why, and the final deliverable.

## Guardrails

- Do not mark a step done without its evidence.
- Stop and report if a step finds a blocking problem; do not continue to later steps as if it passed.
- Keep scope to what the requester is authorized to change or assess.
