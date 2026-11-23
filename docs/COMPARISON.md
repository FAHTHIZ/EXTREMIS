# How EXTREMIS compares

Checked on 2026-11-17 against each project's README and repository root. Star counts come from the GitHub API on that date. A dash (—) means the feature is not described in that project's README; it does not mean the project cannot do it.

| | [anthropics/skills](https://github.com/anthropics/skills) | [obra/superpowers](https://github.com/obra/superpowers) | [vercel-labs/skills](https://github.com/vercel-labs/skills) | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | EXTREMIS |
|---|---|---|---|---|---|
| What it is | Example and document skills | Skills framework and development methodology | Skills installer CLI | 25 engineering skills | Capability runtime and 59 skills/workflows |
| Stars | 196k | 319k | 39.8k | 118k | — |
| Claude Code plugin marketplace | yes | yes (official and own marketplace) | — | yes | yes (`/plugin marketplace add FAHTHIZ/EXTREMIS`) |
| Codex plugin | — | yes | — | yes | yes (repo marketplace) |
| Installs through `npx skills add` | yes | — | is the installer | yes (documented first) | yes (gateway skill, or any capability through the `capabilities/` subpath) |
| MCP server | — | — | — | — | yes: 7 gateway tools (including a federated skill finder) plus skills as MCP resources |
| Loads instructions on demand through a planner | host does progressive disclosure | host does progressive disclosure, plus a SessionStart hook | — | host does progressive disclosure | `extremis_plan` picks and orders capabilities, then `extremis_activate` loads only those; the Claude Code plugin adds a ~100-token SessionStart reminder (`EXTREMIS_SESSION_HOOK=off` disables it) |
| Multi-step workflows | — | yes (brainstorm, plan, TDD, review, finish) as skill chains | — | lifecycle grouping (define → ship) | 5 declared workflows with step order, optional steps and done criteria |
| Executable verification | — | "verification-before-completion" skill (instructions) | — | — | `verify` checks that run built-in tools with matchers, plus manual statements |
| Built-in tools | — | — | — | — | 41 permission-gated tools (data, code, security, docs, web, API, a11y, SEO, …) |
| Lockfile and content hash | — | — | `skills-lock.json` v2 `computedHash` | — | `extremis-lock.json`; folder hash matches skills 1.9.0's `computedHash` byte for byte |
| Search public skill directories | — | — | `npx skills find` (skills.sh search, names and install counts) | — | `extremis find`: skills.sh + GitHub + `.well-known` indexes, reads and scans each top SKILL.md, re-ranks on the task |
| Install-time security scan | — | — | — | — | static scanner; dangerous findings block install |
| Agent Skills well-known index | — | — | reads them | — | publishes one (`extremis build`) and installs from them |
| Routing evaluation | — | — | — | routing evals (25 case files) | authored and hold-out sets with Hit@k, MRR and false activation |
| Runtime dependencies | n/a | n/a | Node 22 (1.9.0) | n/a | none; Node ≥ 18.17 |

## What the leaders do well, and what EXTREMIS took from them

- **One-line install for each host, in the first screen of the README** (superpowers, addyosmani). EXTREMIS now leads with a per-host install table.
- **`npx skills add` as the universal path** (addyosmani lists it first). EXTREMIS is compatible: `npx skills add FAHTHIZ/EXTREMIS` installs the gateway skill, and `npx skills add https://github.com/FAHTHIZ/EXTREMIS/tree/main/capabilities --skill <name>` installs any of the 59 capabilities. Both were checked live with skills 1.9.0.
- **Plugin manifests for Claude Code and Codex** (superpowers, addyosmani, anthropics). EXTREMIS ships `.claude-plugin/` (validated with `claude plugin validate`, installed in a clean home, MCP server reported connected) and `.codex-plugin/` with a repo marketplace (accepted by `codex plugin marketplace add`).
- **A skills table grouped by phase or domain** (addyosmani). The README lists the catalog by domain.

## Where EXTREMIS is different

The other projects ship instructions and rely on the host to choose and follow them. EXTREMIS adds a runtime layer: a planner that chooses and orders capabilities, permission-gated tools that do the deterministic parts (secret scanning, CSV profiling, OpenAPI diffing and so on), and checks that run those tools to confirm a result before the agent reports it as done. The cost is an extra moving part (a Node process for MCP or the CLI) that pure instruction repositories do not need.

## Gaps that remain

- No hosted marketplace listing or official-marketplace entry yet (superpowers and anthropics/skills are in Anthropic's official marketplace).
- Not published to npm. The registry reports the name `extremis` as unpublished (2026-05-26), so installs use `github:FAHTHIZ/EXTREMIS`.
- Codex plugin installation itself happens in the ChatGPT desktop app; only the marketplace registration was tested from the CLI.
