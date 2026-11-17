---
name: security-assessment
description: "Use when running a complete defensive security assessment of a system you are authorized to review: repository audit, threat model, code review, privacy check and a prioritized remediation report."
license: Apache-2.0
metadata:
  extremis.domain: security
  extremis.version: "0.1.0"
  extremis.kind: workflow
---

# Security Assessment

## Mission

Workflow: audit, threat model, secure code review, privacy review and remediation plan. This workflow coordinates other EXTREMIS capabilities; activate each step's capability when you reach it rather than loading them all up front.

## Prerequisites

- written authorization for the system in scope
- repository or architecture access

## Steps

1. **audit** (`repository-audit`): Map the codebase, dependencies, secrets and container configuration. Tools: `code.repo_map`, `code.dependency_inventory`, `security.secret_scan`.
2. **threats** (`threat-modeling`): Identify assets, trust boundaries and the most likely threats. After: audit.
3. **code** (`secure-code-review`): Check the code paths behind each high-priority threat for vulnerable patterns. After: threats. Tools: `security.code_patterns`.
4. **privacy** (`privacy-impact-review`, optional): Check personal-data flows, retention and exposure. After: audit. Tools: `privacy.pii_scan`.
5. **report** (`technical-documentation`): Write a findings report ordered by severity with owners and fixes. After: code, privacy.

Steps without an `after` list can run in parallel. Skip an optional step only when its input does not exist, and say so in the output.

## Done when

- Scope and authorization are stated
- Each finding has evidence, severity, CWE where relevant and a fix
- Residual risks have an owner

## Output

A short summary of each completed step, the evidence it produced (tool output or file references), anything skipped and why, and the final deliverable.

## Guardrails

- Do not mark a step done without its evidence.
- Stop and report if a step finds a blocking problem; do not continue to later steps as if it passed.
- Keep scope to what the requester is authorized to change or assess.
