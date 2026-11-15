# EXTREMIS

<p align="center"><strong>One intelligence. Endless capabilities.</strong></p>
<p align="center">A portable, quality-controlled capability library for AI agents.</p>

EXTREMIS is an evolving open capability library for agent hosts. It combines focused skills, workflows, references, evaluation fixtures, and—where a procedure genuinely needs them—deterministic helpers. The core library is designed to remain portable across compatible agent environments rather than depending on one model vendor.

The goal is not to collect the largest possible pile of prompts. The goal is to help an agent discover the right capability, load only what it needs, and carry out work with clear methods, evidence, boundaries, and checks.

## What EXTREMIS is

- **A portable skill library.** Skills follow the open [Agent Skills specification](https://agentskills.io/specification) wherever possible.
- **A curated capability catalog.** Each skill has a scope, prerequisites, risk label, version, and evaluation fixtures.
- **A composable foundation.** Narrow skills can be combined into task-specific workflows without loading the entire library.
- **A quality system.** Skills define expected outputs, failure conditions, and examples of when they should or should not activate.
- **A host-neutral core.** Instructions do not assume that every agent has the same tools, permissions, memory, or subagent features.

## What EXTREMIS is not

- A model, an agent runtime, or a source of model weights.
- A replacement for browsers, shells, APIs, databases, credentials, or other real tools.
- A guarantee that an agent becomes an expert simply by loading instructions.
- A reason to load every skill into every conversation.

A skill supplies reusable procedures and domain context. The host agent still needs the necessary model capability, tools, permissions, data, and user authorization to carry them out.

## Current library

The repository contains **32 skills across 11 catalog domains**. New content in this initial library is authored for EXTREMIS; external projects are referenced as research and compatibility context, not copied as skill text.

### Meta
- [Skill Authoring](skills/skill-authoring/SKILL.md)

### Software engineering
- [Repository Audit](skills/repository-audit/SKILL.md)
- [Debugging](skills/debugging/SKILL.md)
- [Test-Driven Development](skills/test-driven-development/SKILL.md)
- [Code Review](skills/code-review/SKILL.md)
- [API Design](skills/api-design/SKILL.md)
- [Database Design](skills/database-design/SKILL.md)
- [Technical Documentation](skills/technical-documentation/SKILL.md)

### Research
- [Research Synthesis](skills/research-synthesis/SKILL.md)
- [Literature Review](skills/literature-review/SKILL.md)
- [Source Verification](skills/source-verification/SKILL.md)

### Finance
- [Financial Modeling](skills/financial-modeling/SKILL.md)
- [Financial Statement Analysis](skills/financial-statement-analysis/SKILL.md)

### Business
- [Product Discovery](skills/product-discovery/SKILL.md)
- [Market Sizing](skills/market-sizing/SKILL.md)
- [Business Process Mapping](skills/process-mapping/SKILL.md)

### Design
- [UX Audit](skills/ux-audit/SKILL.md)
- [Accessibility Review](skills/accessibility-review/SKILL.md)
- [Design System](skills/design-system/SKILL.md)

### Education
- [Study Coaching](skills/study-coaching/SKILL.md)
- [Learning Experience Design](skills/learning-design/SKILL.md)

### Science
- [Experimental Design](skills/experimental-design/SKILL.md)
- [Scientific Data Analysis](skills/scientific-data-analysis/SKILL.md)

### Engineering
- [Technical Planning](skills/technical-planning/SKILL.md)
- [Systems Engineering](skills/systems-engineering/SKILL.md)
- [Reliability Analysis](skills/reliability-analysis/SKILL.md)

### Security and privacy
- [Secure Code Review](skills/secure-code-review/SKILL.md)
- [Threat Modeling](skills/threat-modeling/SKILL.md)
- [Privacy Impact Review](skills/privacy-impact-review/SKILL.md)

### Productivity
- [Project Management](skills/project-management/SKILL.md)
- [Meeting Synthesis](skills/meeting-synthesis/SKILL.md)
- [Decision Log](skills/decision-log/SKILL.md)

See the full [domain map](docs/domain-map.md), [machine-readable catalog](registry/skills-index.json), [domain registry](registry/domains.json), and [representative landscape review](docs/landscape-review.md).

## How it works

1. **Discover** — retrieve a small set of candidate skills using names, descriptions, domain metadata, and later semantic retrieval.
2. **Select** — check task fit, prerequisites, trust, host compatibility, risk, and conflicts.
3. **Compose** — load the minimum useful instructions and only the references directly needed.
4. **Execute** — follow the workflow using only tools actually available to the host and permissions actually granted by the user.
5. **Verify** — check outputs against acceptance criteria; distinguish verified results from assumptions.
6. **Improve** — review evaluation failures and user feedback before revising a skill; do not silently broaden its scope.

This progressive-disclosure approach keeps discovery lightweight and reduces unnecessary context use.

## Quality and evaluation

Every skill package includes at least five evaluation fixtures covering normal use, incomplete context, non-trigger behavior, and failure or boundary cases. These fixtures are **not benchmark results**: they have not automatically proved that a model follows the skill. Real behavioral evaluation must record the model, host, evaluator, date, test set, and scoring method.

Run the repository checks with:

```bash
python scripts/validate_skills.py
python -m unittest discover -s tests -v
```

A passing structural check does not replace human review or agent-level evaluation. See [skill quality and lifecycle](docs/skill-quality.md).

## Architecture and research

- [Domain map](docs/domain-map.md) — taxonomy and skill coverage.
- [Landscape review](docs/landscape-review.md) — representative competing ecosystems and design lessons.
- [Host compatibility](docs/host-compatibility.md) — what the portable format does and does not guarantee.
- [Skill quality](docs/skill-quality.md) — maturity levels, evaluation principles, and change policy.

## Compatibility

EXTREMIS targets the open [Agent Skills specification](https://agentskills.io/specification). Host-specific install paths, hooks, tool APIs, permission controls, model routing, memory, and subagent behavior are not standardized by the skill format. See [Host compatibility](docs/host-compatibility.md). Compatibility should be marked only after installation and behavior are tested on the named host.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes. Security-sensitive reports should follow [SECURITY.md](SECURITY.md). New skills must be checked for overlap, provenance, license compatibility, prerequisites, and meaningful evaluations.

## Project status

EXTREMIS is in its early library-building stage. The current catalog covers foundational workflows across multiple domains, but it is not exhaustive and skills remain marked as draft until reviewed and behaviorally evaluated. Next priorities include catalog selection, workflow composition, host adapters, automated evaluations, and a safe installer.

## License

A project license has not yet been selected. Until a license is added, do not assume the contents may be reused, redistributed, or incorporated into other projects. Third-party material will only be included with compatible licensing and clear attribution.
