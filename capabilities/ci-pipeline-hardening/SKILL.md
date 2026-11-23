---
name: ci-pipeline-hardening
description: "Use when reviewing or hardening CI/CD pipelines such as GitHub Actions: token permissions, script injection, pull_request_target, third-party action pinning, secrets handling, runner isolation, artifact and cache integrity, and supply-chain provenance."
license: Apache-2.0
metadata:
  extremis.domain: security
  extremis.version: "0.1.0"
---

# CI Pipeline Hardening

## Mission

Harden CI/CD workflows against injection, token abuse and supply-chain attacks.

## Prerequisites

- the workflow files (for example .github/workflows/*.yml)
- which workflows publish, deploy or hold secrets

## Procedure

1. Inventory workflows, triggers, the secrets each uses and what each can publish or deploy. Mark the ones reachable from forks or comments.
2. Run `ci.workflow_lint` on every workflow and `security.secret_scan` on the repository. Triage critical findings first: script injection and pull_request_target checkouts of untrusted code.
3. Fix injection by moving untrusted event fields into `env:` and quoting them; never interpolate them into `run:` or `script:`.
4. Set a top-level `permissions:` block with read-only defaults and grant write scopes per job. Use OIDC instead of long-lived cloud keys where the provider supports it.
5. Pin third-party actions to full commit SHAs with the version in a comment, and let Dependabot update them. Set `persist-credentials: false` on checkout when the job does not push.
6. Isolate risky work: never run fork pull requests on self-hosted runners; split untrusted builds from privileged publishing with `workflow_run` and artifacts treated as untrusted.
7. Protect releases: required reviews, environment protection rules, provenance or signing for published artifacts, and timeouts on every job.
8. Re-run the lint and record remaining accepted risks with owners.

## Output contract

- Workflow inventory with triggers, secrets and privileges
- Findings by severity with file and line
- Patches or exact changes for each finding
- Accepted risks with owners

## Boundaries and stop conditions

- Do not print or move secrets while auditing; reference them by name.
- Do not disable checks to make a pipeline pass.
- Static linting misses logic flaws; review privileged workflows by hand.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
