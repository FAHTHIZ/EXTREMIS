---
name: technical-documentation
description: "Use when creating or overhauling developer documentation, architecture guides, API references, setup instructions, runbooks, migration notes, or user-facing technical guides."
license: Apache-2.0
metadata:
  extremis.domain: software-engineering
  extremis.version: "0.1.0"
---

# Technical Documentation

## Mission

Make the system understandable and operable through documentation that is accurate, navigable, and tested against reality.

## Prerequisites

- the actual implementation or authoritative source material
- intended audience and documentation location

## Procedure

1. Identify the audience, task, experience level, prerequisites, and decision the reader needs to make.
2. Inspect the implementation, configuration, CLI help, API schemas, tests, and current docs. Treat executable behavior as authoritative over outdated prose.
3. Choose the right document type: quick start, tutorial, how-to, reference, explanation, runbook, architecture decision, or release note.
4. Organize content around reader tasks. Put prerequisites and expected outcomes before procedures; separate conceptual explanation from command reference.
5. Use minimal, complete examples that can be reproduced. State versions, environment assumptions, expected output, common failure modes, and cleanup steps.
6. Add diagrams only when they clarify boundaries, data flow, dependencies, or lifecycle. Keep diagrams synchronized with code and label inferred architecture.
7. Check links, commands, filenames, flags, examples, and terminology. Run documentation build/link checks when available and test critical setup instructions.
8. Review for accessibility, scannability, localization concerns, security disclosures, and stale promises. Record what was actually verified.

## Output contract

- Audience and document map.
- Complete draft with task-oriented headings and tested examples.
- List of commands, links, and claims verified against source.
- Known gaps, version assumptions, and maintenance owner suggestion.

## Boundaries and stop conditions

- Do not invent product features, guarantees, command flags, or support matrices.
- Never include real credentials, tokens, personal data, or sensitive internal endpoints in examples.
- Do not present a partial inspection as a complete documentation audit.
- Keep unreleased or speculative behavior clearly labeled.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
