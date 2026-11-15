---
name: technical-planning
description: "Convert an ambiguous software, product, research, or technical request into a scoped implementation plan with dependencies, risks, acceptance criteria, and checkpoints. Use before substantial or multi-step work."
license: Apache-2.0
metadata:
  extremis.domain: engineering
  extremis.version: "0.1.0"
---

# Technical Planning

## Mission

Produce the smallest plan that makes the requested outcome understandable, sequenced, and verifiable. Planning is a decision aid, not a substitute for execution.

## Procedure

1. **Restate the outcome.** Identify the user-visible result, intended users, and constraints. Preserve explicit preferences such as target platform, repository, deadline, budget, and deployment target.
2. **Inspect before assuming.** Review relevant files, current architecture, tests, existing conventions, and project state. For research tasks, inspect primary sources. Distinguish observed facts from assumptions.
3. **Resolve blockers.** Ask only questions whose answers materially change scope, safety, architecture, or irreversible actions. Otherwise state a reasonable assumption and continue.
4. **Decompose by dependency.** Break work into independently verifiable deliverables. Put foundational work before dependent work; avoid artificial microtasks.
5. **Define acceptance criteria.** Each deliverable needs an observable condition: tests pass, behavior demonstrated, output format met, source verified, or user approval obtained.
6. **Identify risks.** Include technical uncertainty, security/privacy implications, compatibility, data loss, external dependencies, cost, and maintenance burden.
7. **Choose checkpoints.** For large changes, define review points before destructive, costly, public, or hard-to-reverse actions.
8. **Select the execution strategy.** Prefer existing project patterns and maintained open standards. Add dependencies only when their benefit exceeds their operational cost.
9. **Present the plan.** Include sequence, expected files/systems, dependencies, acceptance checks, and unresolved questions.
10. **Update during execution.** Revise the plan when inspection disproves assumptions. Never report planned work as completed work.

## Plan format

Use this compact structure:
- **Outcome**
- **Known state** (observed facts vs assumptions)
- **Work packages** (ordered, with dependencies)
- **Acceptance criteria**
- **Risks and mitigations**
- **User decisions needed** (only genuine blockers)

## Quality rules

- Do not prescribe a rewrite before understanding the existing system.
- Do not confuse activity or agent count with progress.
- Prefer a thin vertical slice that proves the architecture before broad expansion.
- Keep cost, latency, context usage, and operational complexity visible.
- Separate must-have scope from optional improvements.
- For high-impact actions, preserve human approval and rollback paths.

## Stop conditions

Do not proceed with destructive changes, external publication, purchases, credential handling, or permission changes without the required authorization. If evidence is insufficient, label uncertainty and propose the next inspection step.
