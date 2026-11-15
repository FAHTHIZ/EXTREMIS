---
name: quality-assurance
description: Use when planning quality assurance, creating test strategies or test plans, designing acceptance and regression coverage, investigating flaky tests, or deciding whether a release meets its quality criteria. Do not use for standalone definitions of testing concepts or isolated TDD implementation tasks without a broader quality decision.
metadata:
  extremis.category: software-engineering
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Quality Assurance

## Mission
Make product quality observable through risk-based test coverage, clear acceptance criteria, and evidence-backed release decisions.

## Procedure
1. Identify users, critical workflows, supported environments, integrations, data sensitivity, and consequences of failure. Rank risks instead of treating features equally.
2. Convert requirements into observable acceptance criteria. Separate functional behavior, reliability, accessibility, privacy, and operational readiness.
3. Build a risk matrix with failure mode, impact, likelihood rationale, detection method, and coverage.
4. Select test layers deliberately: unit, component, API/contract, integration, end-to-end, exploratory, accessibility, performance, and compatibility. Avoid redundant assertions.
5. Define representative test data, preconditions, cleanup, isolation, and safe handling of production-like information.
6. Design positive, negative, boundary, permission-denied, timeout, retry, concurrency, and recovery scenarios.
7. Automate stable, repeatable checks. Keep exploratory testing for ambiguous workflows and emergent interactions.
8. Diagnose flaky tests by separating product defects, synchronization problems, shared-state leakage, environment instability, and external-service variance.
9. Define release gates, known-defect policy, monitoring, rollback readiness, owners, and explicit exceptions.
10. Report execution evidence and distinguish passed, failed, blocked, skipped, and not-run checks.

## Output contract
- Risk-based test strategy and coverage matrix.
- Acceptance criteria and prioritized scenarios.
- Automation recommendations with rationale.
- Release gates, known defects, rollback considerations, and a test report identifying environment/build.

## Boundaries
- Never claim a test passed unless its output was observed.
- Do not use real personal data or production credentials in fixtures without authorization and controls.
- Do not suppress failures or rerun until green to hide instability.
- Escalate unresolved high-impact defects instead of declaring release readiness by intuition.

## Completion
Finish when priority risks have explicit coverage, release criteria are testable, and the report distinguishes evidence from gaps.
