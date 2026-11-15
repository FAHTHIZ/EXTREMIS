# Marketplace integration plan

**Status:** design guidance only. EXTREMIS does not currently ship a custom installer, marketplace service, or runtime plugin.

## Product direction

Keep the skill library portable, then let a host agent project install it through one command and expose its capabilities in that project's native marketplace. The marketplace should distribute a versioned package, not paste every instruction into every session.

## Package layers

1. **Portable skill content:** `skills/<skill-name>/SKILL.md`, with optional `references/`, `scripts/`, and `assets/` loaded only when needed.
2. **Catalog metadata:** stable skill IDs, descriptions, domains, versions, prerequisites, risk, maturity, provenance, and evaluation references.
3. **Host adapter:** translates portable package metadata into the host's supported discovery path and plugin format. Host-specific hooks, commands, sub-agents, and connectors remain separate artifacts.
4. **Optional integrations:** executable tools or connectors with explicit permissions, declared network/data access, and independent versioning. A skill must never pretend to grant these capabilities.

## Installer and lifecycle requirements

- Support install, list, update, remove, and inspect operations.
- Support project-local and user-global installation where the host permits it.
- Pin installs to an immutable tag or commit and record installed package versions in a lockfile.
- Store content hashes for package files and verify integrity before installation and after updates.
- Preserve user changes; use atomic updates with rollback rather than partially replacing a working installation.
- Do not execute bundled scripts during installation. Show their purpose and require the host's normal approval path before use.
- Resolve only declared dependencies. Detect incompatible versions, missing prerequisites, and conflicting skills.
- Make install/update output auditable: package source, version, commit, files changed, and host target.

## Marketplace listing and trust

Every listing should expose:
- package maintainer and source repository;
- package version, release date, and last review date;
- license and required attribution;
- supported host/adapter versions, each backed by an install and behavior test;
- included skills and optional integrations;
- declared permissions, dependencies, risk, and network access;
- provenance and change history;
- evaluation coverage and actual benchmark results, clearly separated.

Downloads, stars, or popularity can help discovery, but must not be presented as quality certification. Distinguish author-provided fixtures from independently run behavioral results.

## Security model

Treat third-party skill content as untrusted instructions. Validate metadata and file paths, block path traversal, cap archive sizes, and verify hashes. Keep installation separate from execution. Require explicit user approval for external integrations, sensitive data access, or actions with meaningful side effects. Do not allow a package to override host/system policies or silently widen permissions.

## Suggested integration sequence

1. Select the target host's documented marketplace/package format and decide the project license.
2. Define and publish a versioned EXTREMIS package manifest and JSON schema.
3. Build a thin installer/adapter that maps the portable skill catalog into the host.
4. Add immutable releases, lockfile support, hashes, rollback, and package audit output.
5. Publish a marketplace listing with host compatibility and evaluation evidence.
6. Add discovery/ranking only after selection quality and behavioral evaluation are measurable.

## Ecosystem references

- [Agent Skills specification](https://agentskills.io/specification)
- [Vercel Skills CLI](https://github.com/vercel-labs/skills) and [skills.sh](https://skills.sh)
- [Claude Code plugins and marketplaces](https://docs.anthropic.com/en/docs/claude-code/plugins)
- [Anthropic skill authoring guidance](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)
- [Superpowers](https://github.com/obra/superpowers)

The exact marketplace format should be chosen only after inspecting the target OSS project's current plugin architecture. Do not create a second incompatible package format prematurely.
