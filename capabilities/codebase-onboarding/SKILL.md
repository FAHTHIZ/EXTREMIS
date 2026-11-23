---
name: codebase-onboarding
description: "Use when getting oriented in an unfamiliar repository or explaining a codebase to someone new: architecture map, entry points, data flow, build and test commands, conventions, risky areas and a first-week guide."
license: Apache-2.0
metadata:
  extremis.domain: software-engineering
  extremis.version: "0.1.0"
---

# Codebase Onboarding

## Mission

Map an unfamiliar repository into architecture, entry points, commands and a starter guide.

## Prerequisites

- read access to the repository

## Procedure

1. Map the repository with `code.repo_map`: languages, top-level layout, size by area, and generated or vendored folders to ignore.
2. Read the README, contributing guide, build files and CI configuration to find the real build, test, lint and run commands. Prefer what CI runs over what the README says when they differ.
3. Find the entry points: binaries, servers, CLI commands, jobs, exported packages. Trace one representative request or command end to end through the main modules.
4. List dependencies that shape the architecture with `code.dependency_inventory` (framework, database client, queue, auth).
5. Note conventions: module boundaries, error handling, configuration, testing style, naming. Point to one good example file for each.
6. Mark risky areas: code without tests, large files that change often, security-sensitive paths, and known TODOs.
7. Write the guide: a one-paragraph summary, an architecture diagram in text or Mermaid, commands, a request walkthrough, conventions, risky areas and three good first tasks. Check its links with `docs.markdown_check`.

## Output contract

- One-paragraph summary of what the code does
- Architecture map and diagram
- Verified build, test and run commands
- Request walkthrough, conventions with example files, risky areas and first tasks

## Boundaries and stop conditions

- Mark commands you could not run as unverified.
- Do not expose secrets or internal hostnames found in the repository.
- Describe the code as it is; label guesses about intent as guesses.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
