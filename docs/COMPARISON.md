# How EXTREMIS compares

**Comparison basis:** third-party project details below were reviewed on 2026-11-17 against the projects' public READMEs and repository roots. The EXTREMIS column was refreshed for version 0.4.0 on 2026-11-24. Third-party rows are a dated documentation snapshot, not a claim that every external project's current release still has exactly the same features. Star counts are omitted because they change continuously.

A dash (—) means the feature was not described in the reviewed project documentation; it does not prove the project cannot support it.

| | [anthropics/skills](https://github.com/anthropics/skills) | [obra/superpowers](https://github.com/obra/superpowers) | [vercel-labs/skills](https://github.com/vercel-labs/skills) | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | EXTREMIS 0.4.0 |
|---|---|---|---|---|---|
| What it is | Example and document skills | Skills framework and development methodology | Skills installer CLI | Engineering skill collection | Capability layer: 70 capabilities (64 skills and 6 workflows), 10 agents and 45 tools |
| Claude Code plugin marketplace | Yes | Yes (official and own marketplace) | — | Yes | Yes (repository marketplace) |
| Codex plugin | — | Yes | — | Yes | Yes (repository marketplace) |
| Installs through `npx skills add` | Yes | — | Installer | Yes | Yes (gateway skill, or a capability from `capabilities/`) |
| MCP server | — | — | — | — | Yes: 7 gateway tools, 10 agent prompts, and capability resources |
| Plans and activates capabilities on demand | Host progressive disclosure | Host progressive disclosure plus a SessionStart hook | — | Host progressive disclosure | `extremis_plan` selects and orders capabilities; `extremis_activate` loads the selected instructions |
| Multi-step workflows | — | Yes (documented skill chains) | — | Lifecycle grouping | 6 declared workflows with ordered steps and completion criteria |
| Specialist agents | — | — | — | — | 10 specialist-agent prompts, also exportable as Claude Code subagents |
| Executable verification | — | Verification instructions | — | — | Tool-backed checks plus explicit manual checks |
| Built-in tools | — | — | — | — | 45 permission-gated tools |
| Lockfile and content integrity | — | — | `skills-lock.json` v2 `computedHash` | — | `extremis-lock.json`; content hash matches the skills CLI v2 folder-hash format |
| Search public skill directories | — | — | `npx skills find` | — | `extremis find`: skills.sh, GitHub and discovery indexes; reads and scans leading candidates |
| Install-time security scan | — | — | — | — | Static scanner; dangerous findings block installation |
| Agent Skills well-known index | — | — | Reads indexes | — | Publishes an index and installs from supported indexes |
| Routing evaluation | — | — | — | Routing fixtures | Authored and held-out sets with Hit@k, MRR and false-activation metrics |
| Runtime dependencies | n/a | n/a | Node.js | n/a | No npm runtime dependencies; Node.js 18.17+ for the CLI/MCP server, Python 3.9+ client |

## Patterns EXTREMIS adopted

- **A clear per-host install path.** The README leads with separate routes for Claude Code, Agent Skills hosts, MCP clients, Codex, Node.js, and Python.
- **Portable Agent Skills packages.** Capabilities use the standard `SKILL.md` format, with EXTREMIS-specific runtime metadata kept in `capability.json`.
- **Progressive activation.** A compact catalog is used for discovery; full instructions and tool schemas are loaded only after selection.
- **Host-specific manifests around a portable core.** The repository includes Claude Code and Codex plugin metadata while keeping MCP, CLI, JavaScript, and Python access on the shared service.
- **Evidence over claims.** Routing metrics are labeled as retrieval metrics, and executable checks are separated from manual review.

## Where EXTREMIS is different

The other projects primarily distribute skill instructions, installation workflows, or development methodologies. EXTREMIS also provides a shared runtime layer: deterministic discovery and planning, progressive activation, permission-gated built-in tools, capability installation and integrity tracking, verification checks, specialist-agent prompts, and a federated finder for public skills.

That broader surface has a cost: users run a Node.js process for the CLI or MCP server, and host-specific behavior still depends on the capabilities of the host and its compatibility with the relevant format or protocol.

## Gaps that remain

- **No hosted marketplace or registry service.** EXTREMIS can publish and consume discovery indexes and install capabilities, but it does not operate a hosted package marketplace.
- **Host compatibility is not universal.** MCP, CLI, SDK, Claude Code, Codex, and portable Agent Skills paths are distinct integration surfaces; support for one does not prove every host feature or approval flow works.
- **Release authenticity is still separate from content integrity.** Hashes detect content drift but do not authenticate the publisher. Signed releases and registry metadata remain future work.
- **Behavioral evaluation remains open work.** Routing fixtures measure selector behavior, not whether a model completes real tasks more accurately with a capability.

See [the architecture assessment](architecture-assessment.md), [host compatibility notes](host-compatibility.md), and [marketplace integration status](marketplace-integration.md) for the boundaries and remaining work.
