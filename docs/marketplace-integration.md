# Distribution and marketplace integration

**Current status:** EXTREMIS now ships a capability installer, lockfile, update/removal commands, archive handling, and a static security scanner. It also ships a shared Node.js service, MCP server, CLI, and JavaScript SDK. It does **not** yet operate a hosted marketplace or provide a completed native adapter for every agent host.

## Product direction

Keep capability packages portable and host-neutral. Let EXTREMIS manage source resolution, integrity, installation scope, and lifecycle state; let an agent host or marketplace own its native discovery paths, UI, permissions prompts, and runtime-specific features.

A marketplace should distribute versioned, inspectable packages—not paste every capability instruction into every model session.

## Package structure

A capability package is a directory containing:

- `SKILL.md`: portable instructions and required frontmatter.
- `capability.json`: optional EXTREMIS metadata for domain, tools, permissions, dependencies, risk, workflow steps, and verification checks.
- Optional references, assets, and scripts, loaded or executed only when a host explicitly chooses to do so.

The built-in catalog lives under `capabilities/`. User-installed packages are stored under `~/.extremis/capabilities`; project installs use `.extremis/capabilities`.

## Shipped distribution lifecycle

The current CLI provides:

| Operation | Command | Behavior |
| --- | --- | --- |
| Install | `extremis install <source>` | Collect, validate, scan, stage, and install selected capabilities |
| Project install | `extremis install <source> --project` | Store packages and lockfile in the current project |
| Inspect installed | `extremis lock` | List EXTREMIS-managed packages and recorded provenance |
| Verify integrity | `extremis lock --verify` | Detect modified, missing, and untracked packages |
| Update | `extremis update` | Re-fetch locked sources, rescan, and update changed content |
| Remove | `extremis remove <name...>` | Remove managed packages and update the lockfile |
| Scan | `extremis scan <directory>` | Run the static scanner without installing |

Supported source types include local folders, GitHub repository/subdirectory references, Git remotes, individual `SKILL.md` URLs, supported archives, and Agent Skills well-known indexes. Remote HTTPS is preferred. Plain HTTP and SSH Git require explicit opt-ins; local `file://` Git sources are intended for local repositories.

Installation does not execute bundled scripts. Every candidate is collected in memory, validated, scanned, staged, and then installed. Dangerous scan verdicts are blocked; caution findings require explicit acceptance after review. The lockfile records source identity, commit/digest where available, content hash, scan summary, and timestamps.

See [the security model](security.md) for transport policy, trust boundaries, and limitations.

## Integration layers

1. **Portable package format:** the Agent Skills directory convention plus optional EXTREMIS manifest fields.
2. **Shared service:** catalog discovery, search, plan composition, activation, resource reads, tool execution, and verification.
3. **Generic integrations:** MCP server, CLI, and JavaScript SDK.
4. **Host-specific adapters:** translate the shared API into each host's native installation, discovery, approval, and tool conventions. These require independent compatibility tests.
5. **Marketplace service:** a future registry/discovery/distribution layer with maintainer identity, releases, metadata review, and reporting.

The MCP gateway is a generic integration path, not proof that every MCP host supports every optional extension or that a host-specific marketplace adapter is complete.

## Marketplace listing and trust

Every listing should expose:

- maintainer identity and canonical source repository;
- immutable version/tag or resolved commit;
- release date, last review date, and change history;
- license and required attribution;
- included capabilities, workflows, references, scripts, and optional integrations;
- supported hosts and adapter versions, each backed by installation and behavior tests;
- declared permissions, dependencies, risk, and network/data access;
- scanner findings and provenance/integrity metadata;
- evaluation coverage and actual behavioral results, clearly separated from authored fixtures.

Downloads, stars, and popularity may help discovery, but must never be presented as quality certification. A clean static scan is not proof of safety, and a passing routing fixture is not proof that a model follows a capability correctly.

## Remaining roadmap

1. Publish a versioned, discoverable registry with maintainer and release metadata.
2. Define signing and verification for releases and registry metadata; content hashes alone do not authenticate publishers.
3. Build and test host-specific adapters against real host versions and permission UX.
4. Establish a maintained compatibility matrix for MCP clients, SDK consumers, and native host integrations.
5. Add independent behavioral evaluations and a clear review lifecycle.
6. Add marketplace workflows for reporting, delisting, revocation, and security advisories.

Avoid a second package format unless a target host demonstrably requires one. Keep portable instructions separate from hooks, tools, connectors, and agent-runtime features.

## Ecosystem references

- [Agent Skills specification](https://agentskills.io/specification)
- [Vercel Skills CLI](https://github.com/vercel-labs/skills) and [skills.sh](https://skills.sh)
- [Claude Code plugins and marketplaces](https://docs.anthropic.com/en/docs/claude-code/plugins)
- [Anthropic skill authoring guidance](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)
- [Superpowers](https://github.com/obra/superpowers)

Treat external projects as architectural references, not implementation dependencies or evidence of equivalent performance.
