# EXTREMIS

<p align="center">
  <strong>One intelligence. Endless capabilities.</strong>
</p>

<p align="center">
  A portable, quality-controlled capability library for AI agents.
</p>

EXTREMIS is an evolving ecosystem of specialist skills, workflows, references, and (where genuinely necessary) deterministic helpers. It is designed to make capable AI agents more useful across domains without tying the library to one model vendor or host application.

The goal is not to install thousands of prompts or pretend that instructions can replace tools. The goal is to help an agent discover the right expertise, load only what it needs, and perform work with clear methods, evidence, and checks.

## What EXTREMIS is

- **A portable skill library.** Skills use the open Agent Skills format wherever possible.
- **A capability catalog.** Skills are organized, described, versioned, and validated so a selector can find the right ones.
- **A composition layer.** Related skills can be combined into a task-specific workflow without loading the entire library.
- **A quality system.** Each skill has explicit scope, prerequisites, expected outputs, failure modes, and evaluation cases appropriate to its risk.
- **A host-neutral foundation.** Core instructions avoid assuming one vendor's tools, commands, or filesystem layout.

## What EXTREMIS is not

- A model, an agent runtime, or a source of model weights.
- A replacement for browsers, shells, APIs, databases, credentials, or other real tools.
- A guarantee that an agent is an expert in every discipline.
- A reason to load every skill into every conversation.

A skill supplies procedures and domain context. The host agent still needs the relevant tools, permissions, data, and model capability to carry those procedures out.

## How it works

1. **Discover** — inspect the task and retrieve a small set of candidate skills using metadata and keywords (and, where available, semantic retrieval).
2. **Select** — check task fit, prerequisites, trust, host compatibility, risk, and conflicts.
3. **Compose** — load the minimum useful instructions and any directly referenced resources.
4. **Execute** — follow the workflow using only tools actually available to the host and permissions actually granted by the user.
5. **Verify** — check outputs against stated acceptance criteria; distinguish verified results from assumptions.
6. **Improve** — evaluate failures and user feedback before changing a skill; do not silently broaden its scope.

This progressive-disclosure approach follows the Agent Skills convention: lightweight metadata first, full instructions when activated, and references or assets only when needed.

## Repository layout

```text
EXTREMIS/
├── skills/                 # Canonical portable skills (one directory per skill)
├── docs/                   # Architecture, authoring, compatibility, and governance
├── registry/               # Machine-readable catalog and taxonomy
├── scripts/                # Deterministic maintenance and validation tools
├── tests/                  # Tests for repository tooling and quality gates
├── .github/workflows/      # Continuous validation
├── CONTRIBUTING.md
└── SECURITY.md
```

The canonical skill source is `skills/<skill-name>/SKILL.md`. Optional `references/`, `scripts/`, and `assets/` belong inside that skill directory and should be added only when they materially improve reliability.

## First capability set

The initial library focuses on skills that make future work safer and more repeatable:

| Skill | Purpose |
| --- | --- |
| [Skill Authoring](skills/skill-authoring/SKILL.md) | Create, revise, and evaluate portable skills |
| [Technical Planning](skills/technical-planning/SKILL.md) | Turn ambiguous work into scoped, verifiable plans |
| [Repository Audit](skills/repository-audit/SKILL.md) | Inspect an existing codebase before proposing changes |
| [Debugging](skills/debugging/SKILL.md) | Diagnose defects from evidence and verify the fix |
| [Research Synthesis](skills/research-synthesis/SKILL.md) | Build source-grounded answers with explicit uncertainty |

These are foundational skills, not a claim that the library is already comprehensive.

## Compatibility

EXTREMIS targets the open [Agent Skills specification](https://agentskills.io/specification). Hosts may add optional extensions for UI metadata, invocation controls, tool permissions, or runtime behavior. Such extensions must remain optional and must not be mistaken for portable guarantees.

See [Host compatibility](docs/host-compatibility.md).

## Quality principles

- Narrow scope and explicit activation triggers.
- Clear preconditions, inputs, outputs, and stop conditions.
- No invented tools, permissions, facts, or successful outcomes.
- Evidence before conclusions; verification before completion claims.
- Progressive disclosure and a deliberate context budget.
- Security-conscious handling of untrusted content and external instructions.
- Tests that check useful behavior, not just the presence of headings.

See [Skill quality](docs/skill-quality.md) and [Contributing](CONTRIBUTING.md).

## Project status

EXTREMIS is in its foundation stage. The first skills and repository validation tooling are being established before the catalog expands into additional professional and technical domains. A skill is not considered mature merely because its Markdown file exists.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a skill or changing the catalog. Security-sensitive reports should follow [SECURITY.md](SECURITY.md).

## License

A project license has not yet been selected. Until a license is added, do not assume the contents may be reused, redistributed, or incorporated into other projects. Third-party material will only be included with compatible licensing and clear attribution.
