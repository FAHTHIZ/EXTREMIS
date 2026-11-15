---
name: repository-audit
description: Audit an existing software repository before making changes. Use when asked to inspect code quality, architecture, bugs, security posture, dependencies, duplication, test coverage, or readiness for a feature or release.
metadata:
  extremis.category: software-engineering
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Repository Audit

## Mission

Describe what is actually in the repository, what works, what is risky, and what should change—using evidence from the checked-out revision.

## Procedure

1. Confirm repository identity, branch/ref, working-tree state, and requested scope. Record the commit inspected.
2. Map the project: languages, entry points, package manifests, build/test commands, runtime boundaries, CI, docs, and major subsystems.
3. Read architecture and dependency boundaries before judging individual files. Trace important flows from entry point through implementation and tests.
4. Run the existing test, lint, type-check, and build commands when feasible. Record exact commands and outcomes. Do not imply a command ran if it did not.
5. Inspect for:
   - duplicated or competing implementations;
   - dead code and stale compatibility layers;
   - broken or misleading interfaces;
   - unsafe input handling, secrets exposure, permission gaps, and injection risks;
   - dependency health and license concerns;
   - missing tests, docs, error handling, and observability;
   - performance and portability problems.
6. Trace each finding to a file and relevant symbol/line. Explain impact and confidence.
7. Classify severity by realistic exploitability or user impact, not dramatic wording.
8. Separate confirmed defects from hypotheses and cleanup opportunities.
9. Recommend an ordered remediation plan. Prefer small foundational replacements over stacking another layer on top.
10. Re-run targeted checks after any remediation and report residual risk.

## Finding format

For each finding include:
- **Title and severity**
- **Evidence:** path, symbol/line, reproduction or command output
- **Impact:** who or what is affected
- **Confidence:** confirmed, likely, or needs reproduction
- **Recommendation:** minimal coherent fix
- **Verification:** test or observation that would prove the fix

## Audit rules

- Never claim a full audit from a partial file sample.
- Do not infer runtime behavior solely from filenames or README claims.
- Do not treat a passing build as proof of security or correctness.
- Preserve existing user changes; inspect diffs before editing.
- Avoid speculative rewrites and dependency additions without evidence.
- Report unavailable tooling and uninspected areas plainly.

## Stop conditions

Stop before destructive edits if the target ref or working tree is unclear, or if changes could erase user work. Security testing must remain authorized and bounded to the supplied repository and environment.
