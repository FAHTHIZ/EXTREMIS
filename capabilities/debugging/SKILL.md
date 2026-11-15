---
name: debugging
description: "Diagnose and fix a reproducible software defect, failing test, crash, regression, or unexpected behavior. Use when the user reports a bug or an existing check fails."
license: Apache-2.0
metadata:
  extremis.domain: software-engineering
  extremis.version: "0.1.0"
---

# Debugging

## Mission

Find the cause of the observed failure, make the smallest sound correction, and demonstrate that the defect is fixed without introducing a regression.

## Procedure

1. Capture the exact symptom, expected behavior, actual behavior, environment, relevant inputs, and reproduction steps.
2. Inspect repository state and recent changes. Preserve unrelated user modifications.
3. Reproduce the failure before editing when feasible. Save the exact command, logs, stack trace, and failing test.
4. Narrow the fault using evidence: inspect the call path, inputs, state transitions, boundaries, and recent changes. Change one plausible cause at a time.
5. Form a falsifiable root-cause hypothesis. Prefer a minimal diagnostic or regression test over speculative edits.
6. Implement the smallest coherent fix. Avoid suppressing errors, weakening assertions, skipping tests, or adding broad fallbacks that hide the defect.
7. Add or update a regression test that fails before the fix and passes after it.
8. Run the targeted test, then relevant neighboring tests, lint/type checks, and build when practical.
9. Inspect the final diff for unrelated changes, accidental debug code, secrets, and weakened validation.
10. Report root cause, changed files, exact checks and outcomes, and any remaining uncertainty.

## Diagnostic discipline

- Separate symptom, trigger, root cause, and contributing conditions.
- Distinguish a confirmed reproduction from a plausible explanation.
- Do not randomly change multiple subsystems at once.
- Do not declare success from a test that does not exercise the reported path.
- If the bug cannot be reproduced, gather evidence and state the limits; do not invent a fix.
- For flaky failures, repeat enough to characterize frequency and preserve logs.

## Safety and data integrity

Back up or preserve user data before migrations or repair operations. Do not run destructive commands, reset databases, delete files, or rotate credentials without explicit authorization. Treat logs and crash dumps as potentially sensitive.

## Completion contract

A fix is complete only when the root cause is explained, a relevant regression check passes (or the limitation is explicit), and the final diff is reviewed.
