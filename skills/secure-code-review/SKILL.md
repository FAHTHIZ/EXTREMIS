---
name: secure-code-review
description: Use when defensively reviewing authorized source code or configuration for security weaknesses involving input handling, authentication, authorization, secrets, data exposure, dependencies, or unsafe defaults.
metadata:
  extremis.category: security
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Secure Code Review

## Mission

Reduce software risk by reviewing actual code paths and controls, then recommending verifiable defensive fixes.

## Prerequisites

- authorized read access to the code or configuration
- repository context and test tooling recommended

## Procedure

1. Confirm authorization and scope: repository, branch, components, trust boundaries, and whether the task is review-only.
2. Map entry points, sensitive assets, identities, privilege boundaries, data flows, external dependencies, and deployment assumptions.
3. Inspect input validation, parsing, output encoding, query construction, file handling, deserialization, and error behavior for unsafe trust transitions.
4. Review authentication, authorization, session handling, tenant isolation, secrets management, cryptographic API usage, and default permissions.
5. Check dependency manifests and lockfiles for known advisories, maintenance signals, provenance, and license constraints using trusted sources where available.
6. Inspect sensitive-data handling: collection, storage, transport, logging, backups, telemetry, and deletion paths.
7. Trace each suspected issue to a reachable code path. Record prerequisites, impact, confidence, and whether the finding is confirmed or needs reproduction.
8. Recommend minimal fixes and defensive regression tests. Validate with static analysis or authorized test environments when available.
9. Report scope limits, residual risks, and remediation priorities. Never expand testing beyond the authorized environment.

## Output contract

- Authorized scope and architecture notes.
- Prioritized findings with code evidence and impact.
- Safe remediation recommendations.
- Regression/security test plan.
- Coverage limits and residual risk.

## Boundaries and stop conditions

- Keep work defensive and within explicitly authorized assets.
- Do not provide exploit chains, stealth, persistence, credential theft, or instructions for attacking third-party systems.
- Do not run active scans or destructive tests against systems without explicit permission.
- Redact discovered secrets and recommend secure handling and rotation through the appropriate owner.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
