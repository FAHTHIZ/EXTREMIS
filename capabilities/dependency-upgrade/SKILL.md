---
name: dependency-upgrade
description: "Use when upgrading dependencies, frameworks, language runtimes or SDKs, or migrating off a deprecated library: inventory, changelog and breaking-change review, staged upgrade plan, codemods, test evidence and rollback."
license: Apache-2.0
metadata:
  extremis.domain: software-engineering
  extremis.version: "0.1.0"
---

# Dependency Upgrade

## Mission

Plan and execute dependency and framework upgrades with evidence and rollback.

## Prerequisites

- the manifest and lock files
- a runnable test suite

## Procedure

1. Inventory dependencies with `code.dependency_inventory`: current and target versions, direct versus transitive, and which are runtime-critical.
2. Read the changelogs and migration guides between current and target for each major bump. List breaking changes that touch this codebase, with the call sites.
3. Order the upgrade: runtime and build tooling first, then frameworks, then leaf libraries. Never jump several majors of a framework in one step when its guide says to go one at a time.
4. Establish a baseline: run the tests and record the report with `test.parse_report`; note existing failures so they are not blamed on the upgrade.
5. Upgrade in small commits, one package or one group at a time. Use official codemods where they exist and review their diff.
6. Fix deprecations and type errors, rerun the tests, and compare reports with the baseline. Add tests for behaviour the changelog says changed.
7. Check bundle size, startup time or performance for framework upgrades, and the lock file diff for unexpected new packages.
8. Write release notes with `release.changelog`, the rollback path (revert commit, previous lock file) and anything left on an old version with the reason.

## Output contract

- Upgrade plan: order, versions and breaking changes per step
- Diffs or commits per step
- Test results before and after
- Release notes, rollback and deferred items

## Boundaries and stop conditions

- Do not mix an upgrade with unrelated refactors in the same commit.
- Do not delete or skip failing tests to finish an upgrade.
- Flag new install scripts or unexpected transitive packages for review.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
