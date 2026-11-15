---
name: skill-authoring
description: Design, write, revise, or evaluate portable Agent Skills. Use when creating a new skill, improving an existing SKILL.md, reviewing skill quality, or deciding whether a capability belongs in a skill, workflow, tool, or runtime.
metadata:
  extremis.category: meta
  extremis.version: "0.1.0"
  extremis.risk: low
---

# Skill Authoring

## Mission

Create small, reliable, portable capability packages that change an agent's procedure—not its underlying model, permissions, or available tools.

## Choose the right artifact

- **Skill:** reusable instructions and domain procedure loaded on demand.
- **Workflow:** a coordinated sequence of multiple skills or roles.
- **Tool/integration:** executable access to an API, filesystem, browser, database, or other external capability.
- **Hook:** automation tied to a host lifecycle event.
- **Runtime feature:** scheduling, isolation, permissions, agent orchestration, or persistent state.
- **Reference:** factual material that is useful but not itself a procedure.

Do not disguise a missing tool as a skill. State required capabilities explicitly.

## Authoring procedure

1. Identify a recurring task from a real use case. State the user intent that should activate it.
2. Define one primary outcome. Split unrelated outcomes into separate skills.
3. Specify required inputs, available-tool assumptions, prerequisites, and hard stop conditions.
4. Write a precise description beginning with a trigger such as "Use when…". Include important near-misses that should not activate it.
5. Put the shortest reliable procedure in this file. Move detailed material to focused `references/` files and load them only when needed.
6. Include decision points, failure handling, and a verifiable output contract.
7. Separate facts from assumptions. Require sources for changing or consequential claims.
8. Add evaluation cases for normal, edge, failure, and non-trigger scenarios.
9. Validate naming, frontmatter, references, licensing, and portability.
10. Review the skill as untrusted instruction content: it must not request secrets, bypass approvals, or override host/system policies.

## Required quality checklist

- One coherent purpose and accurate activation description.
- Explicit prerequisites and unavailable-tool behavior.
- Concrete steps rather than generic motivational advice.
- Expected output and completion criteria.
- Failure and escalation behavior.
- No claims of capabilities the host may not have.
- No hidden permission expansion or unsafe autonomous side effects.
- Relevant evaluations and provenance for borrowed material.

## Output contract

When creating or revising a skill, provide:
- the complete skill directory/file changes;
- a short purpose and trigger summary;
- prerequisites and known host limitations;
- evaluation cases and validation results;
- provenance/license notes for external material.

Do not mark a skill production-ready solely because it passes frontmatter validation. Content quality and behavior need review.

## Stop conditions

Stop and ask for clarification when the requested capability is ambiguous in a way that changes safety, permissions, or the deliverable. If the task requires an unavailable integration, explain the gap rather than inventing a workaround.
