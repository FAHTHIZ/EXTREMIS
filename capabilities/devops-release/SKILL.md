---
name: devops-release
description: "Use when preparing a software build, CI/CD pipeline, deployment, release, rollback, environment configuration, artifact signing, or operational handover."
license: Apache-2.0
metadata:
  extremis.domain: software-engineering
  extremis.version: "0.1.0"
---

# DevOps and Release Engineering

## Mission

Move a change from source to a verifiable release through repeatable builds, controlled promotion, and recovery planning.

## Prerequisites

- repository and deployment context
- release target, environment, and authorization for any deployment

## Procedure

1. Confirm release scope, version, target platforms, environments, users affected, change window, and the authority permitted to deploy.
2. Inspect build scripts, CI workflows, dependency locks, configuration, secrets handling, artifact outputs, and existing release conventions.
3. Define reproducible build inputs and provenance: source revision, toolchain versions, dependency resolution, artifact identity, and checksums where useful.
4. Run automated validation: tests, lint/type checks, packaging, compatibility checks, security scanning, and any required manual acceptance.
5. Separate build, staging, approval, and production promotion. Use least-privilege credentials and environment-specific protections.
6. Prepare migration sequencing, feature flags, backups where appropriate, rollback or roll-forward steps, and clear stop conditions.
7. Verify observability before rollout: health checks, error rates, latency, logs, alerts, and user-visible smoke tests.
8. Promote gradually when supported. Monitor the defined signals and pause or roll back when thresholds are crossed.
9. Record the deployed revision, artifacts, operator/approval, time, results, incidents, and known limitations. Never infer deployment success from a green build.

## Output contract

- Release scope and source revision.
- Build/test/package evidence.
- Promotion and approval gates.
- Rollback/roll-forward and monitoring plan.
- Release record and post-release checks.

## Boundaries and stop conditions

- Do not deploy, publish, or alter production resources without explicit user authorization.
- Never print or commit secrets; use the host's secure secret mechanism.
- Do not disable CI/security checks to force a release.
- Use least privilege and approved recovery procedures for high-impact changes.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
