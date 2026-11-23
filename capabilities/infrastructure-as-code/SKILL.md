---
name: infrastructure-as-code
description: "Use when writing, reviewing or refactoring infrastructure as code such as Terraform, OpenTofu, Pulumi or CloudFormation: module structure, state and environments, security defaults, drift, plan review and safe apply."
license: Apache-2.0
metadata:
  extremis.domain: engineering
  extremis.version: "0.1.0"
---

# Infrastructure As Code

## Mission

Write and review Terraform and other IaC with secure defaults, pinned versions and safe applies.

## Prerequisites

- the IaC files and the target environment
- a plan output for changes to existing infrastructure

## Procedure

1. Identify the environment, state backend, provider versions and who applies changes. Refuse to review an apply against production without a plan.
2. Run `iac.terraform_lint` and `security.secret_scan`. Fix critical and high findings: public buckets and databases, open ingress, disabled encryption, wildcard IAM, hard-coded credentials.
3. Pin `required_version`, provider versions and module refs. Use a remote backend with locking and encryption; separate state per environment.
4. Structure modules around one responsibility with typed variables with input checks, sensitive outputs marked, and no hidden provider configuration inside modules.
5. Read the plan: every destroy or replace must be expected. Look for forced replacement from changed immutable fields and add `moved` blocks for refactors instead of destroy/create.
6. Protect stateful resources with deletion protection, `prevent_destroy` where appropriate, backups and final snapshots.
7. Apply through CI with a reviewed plan artifact, least-privilege credentials and drift detection on a schedule.

## Output contract

- Findings by severity with file and line
- Corrected configuration or patch
- Plan review: creates, updates, replacements and destroys with explanation
- State, environment and apply-process recommendations

## Boundaries and stop conditions

- Do not run apply or destroy; produce the plan review and changes for a human to apply.
- Never paste real credentials or state files into output; state can contain secrets.
- Lint findings are heuristics; confirm against provider documentation for edge cases.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
