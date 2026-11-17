# EXTREMIS architectural assessment and roadmap

**Date:** 2026-11-15
**Scope:** the EXTREMIS repository at commit `5ef69bd` (31 commits), the public OASIS repository (read-only), and the open-source agent capability ecosystem.

## 1. What EXTREMIS was

At `5ef69bd` EXTREMIS was a catalogue of 54 instruction-only Agent Skills (about 40 lines each), a dependency-free Python BM25 search script (`scripts/librarian.py`), a structural validator and a routing evaluation script. There was no installable package, no runtime, no executable capability, no host adapter and no license.

### Findings

| Area | Finding | Severity |
| --- | --- | --- |
| Product | The repository describes itself as "not a runtime, not an installer". Nothing in it makes an agent more capable beyond text a host could already load. | High |
| Duplication | Each skill's metadata was stored in five places: `SKILL.md` frontmatter (`metadata.extremis.*`), `registry/skills-index.json`, `registry/domains.json`, `docs/domain-map.md` and the README list. Every change needed manual synchronisation and a validator just to detect drift. | High |
| Capability depth | No skill shipped scripts, references, schemas or tools. Every procedure ended in "report what was verified" without any way to verify. | High |
| Discovery | BM25 over author-written fixtures: Hit@1 49.6 %, Hit@5 83.2 %, negative false activation @5 21.5 %. No stemming, no synonym handling, no document-side intent expansion. | Medium |
| Composition | `compose` returned the top-k with a Jaccard filter. No dependency graph, ordering, permissions or verification plan. | Medium |
| Security | Path-escape check only. No content scanning, integrity hashes, lockfile, permission model or sandboxed execution. | High |
| Integration | No MCP server, no Claude Code/OASIS plugin manifest, no SDK. OASIS could only import the text skills. | High |
| Parsing bug | Both scripts parsed frontmatter line by line with a regex, so a folded (`>`) or multi-line `description` was silently truncated, and `metadata` was ignored. | Medium |
| Parsing bug | `parse_skill_file` treated `---` only when the closing delimiter matched exactly, so trailing whitespace dropped the whole frontmatter. | Low |
| Evaluation | The evaluation set was also the tuning set (descriptions, keywords and `not_for` were written against it). Reported numbers were optimistic by construction. | Medium |
| Licensing | No license file, so nobody could legally reuse the project. | High |

## 2. What EXTREMIS must become

A standalone, host-neutral **capability layer**: the host agent (OASIS first) keeps reasoning, planning and orchestration; EXTREMIS supplies the capabilities and the means to find, activate, combine, run and verify them, with minimal context cost.

### Ecosystem research and what EXTREMIS takes from it

| Project / standard | License | What it provides | EXTREMIS decision |
| --- | --- | --- | --- |
| [Agent Skills specification](https://agentskills.io/specification) | open spec | `SKILL.md` + `scripts/`, `references/`, `assets/`; three-level progressive disclosure | **Adopt as the package format.** Every capability is a valid Agent Skill. EXTREMIS-specific data lives in a sidecar `capability.json`, so other hosts still read the skill unchanged. |
| [MCP Skills extension, SEP-2640](https://modelcontextprotocol.io/extensions/skills/overview) | open spec | `skills/list`, `skills/get`, `skill://` resources with SHA-256 manifests | **Implement in the MCP server** so any compliant host can load EXTREMIS skills natively. |
| [MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog) | open spec | stateless core, `server/discover`, `_meta` per request | **Support both** `server/discover` and the legacy `initialize` handshake used by most current clients (including the OASIS client SDK 2.4). |
| [Claude Code plugins and marketplaces](https://code.claude.com/docs/en/plugins-reference) | docs | `.claude-plugin/plugin.json`, `marketplace.json`, `.mcp.json`, `${CLAUDE_PLUGIN_ROOT}` | **Ship EXTREMIS as a marketplace + plugin at the repository root.** OASIS reads the same format, so `oasis plugin marketplace add FAHTHIZ/EXTREMIS` works without OASIS changes. |
| [Hermes Agent skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) | MIT | `skills_list` / `skill_view` progressive disclosure, Skills Hub, Skills Guard scanning, trust levels, quarantine, well-known discovery | **Adopt the patterns, not the code:** compact listing, on-demand view, static scan with `safe`/`caution`/`dangerous` verdicts, dangerous never overridable, content-hash lock. |
| [Agent Skills discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc) | Apache-2.0 | `/.well-known/agent-skills/index.json` with digests | **Generate the index** so Hermes and other clients can discover EXTREMIS from a URL; the installer also consumes it. |
| [Vercel skills CLI](https://github.com/vercel-labs/skills) | MIT | cross-host installs, `skills-lock.json` v2 `computedHash` | **Use the same hash algorithm** in the EXTREMIS lockfile (test vectors included), so lock entries are comparable across tools. |
| [OpenSkills](https://github.com/numman-ali/openskills) | Apache-2.0 | `AGENTS.md` skill table + `openskills read` | **Offer an AGENTS.md block**, but a gateway one (a few lines) rather than one listing every skill. |
| [skillz](https://github.com/intellectronica/skillz) | MIT | skills exposed as one MCP tool each | **Rejected design:** one tool per skill puts every description into context again. EXTREMIS exposes six meta-tools regardless of catalogue size. |
| [OpenHands skills](https://docs.openhands.dev/overview/skills) | MIT | `.agents/skills/`, keyword triggers | **Export target** (`.agents/skills`). |
| [SkillRouter (arXiv 2603.22455)](https://arxiv.org/abs/2603.22455) | paper | full skill body carries most routing signal | **Index the body** with field weights. |
| [SkillSeek (arXiv 2609.38822)](https://huggingface.co/papers/2609.38822) | paper | plain BM25 matches LLM-mediated skill-selection loops on SkillsBench | **Keep lexical BM25F as the default**; an optional reranker hook exists in the SDK rather than a model dependency. |
| [Toollery](https://www.semanticscholar.org/paper/d2bc17100dc360c03847d3f64b04b85c9c24b21b) | paper | document-side query expansion from generated user intents | **Add authored `intents`** per capability, indexed as their own field (kept separate from evaluation fixtures). |
| LangGraph / LangChain MCP adapters, OpenAI Agents SDK, Goose, Codex, Gemini CLI | various OSS | all consume MCP | **MCP is the universal adapter.** Python hosts get a stdlib MCP client and a LangChain tool adapter instead of a second implementation of the core. |

### Rejected approaches

- **A new agent runtime or orchestrator.** OASIS already has planning, subagents, approvals, goals and verification gates. EXTREMIS returns plans and checks; it never runs a model loop.
- **One MCP tool per skill** (skillz pattern): context cost grows with the catalogue.
- **Embedding models by default:** they add hundreds of MB and a GPU/CPU cost on low-resource hardware, while the research above shows BM25 is competitive at this scale. An SDK reranker hook allows hosts to add one.
- **Python and Node implementations of the core:** duplicated logic drifts. The core is Node (OASIS and Claude Code already require it); Python hosts talk to it over MCP.

## 3. Target architecture

```text
                Host agent (OASIS, Claude Code, Hermes, OpenHands, Codex, LangGraph, ...)
                    │ plugin / MCP stdio / CLI / JS SDK / Python SDK
                    ▼
┌──────────────────────────── EXTREMIS (zero runtime dependencies) ───────────────────────────┐
│ MCP server: extremis_search · extremis_activate · extremis_read · extremis_run ·           │
│             extremis_plan · extremis_verify  +  SEP-2640 skills/list, skills/get, skill:// │
│ CLI and SDK ── same functions                                                              │
│                                                                                            │
│ Catalog loader ── capabilities/ (built in), installed packages, any Agent Skills folder    │
│ Index ── BM25F over name, summary, keywords, intents, description, body; stemming,         │
│          synonym expansion, not_for penalty; cached by content fingerprint                 │
│ Resolver ── requires/suggests/conflicts graph, cycle detection, topological order,         │
│             permission union                                                               │
│ Activation ── level 1 cards · level 2 instructions + tool schemas · level 3 resources      │
│ Planner ── capability selection with coverage, workflows, ordered steps, verify checks     │
│ Tool runner ── JSON-Schema validation, permission gate, path confinement, timeouts,        │
│                output caps, shell-free subprocesses for package scripts                    │
│ Security ── package scanner, integrity digests, lockfile, trust levels                     │
│ Installer ── local, GitHub, git, well-known sources; atomic install; lock; update; verify  │
│ Adapters ── export to host skill folders, MCP config snippets, OpenAI/Anthropic schemas,   │
│             AGENTS.md gateway block, well-known index, Claude Code/OASIS plugin            │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Capability package

```text
capabilities/<name>/
  SKILL.md          Agent Skills standard (name, description, license, metadata)
  capability.json   EXTREMIS manifest: kind, domain, version, summary, keywords, intents,
                    not_for, requires, suggests, tools, permissions, risk, verify, workflow
  references/       optional, read on demand
  scripts/          optional, third-party style tools declared in capability.json
  evals/evals.json  activation and behaviour fixtures
```

Built-in tools live in `src/tools/` (tested once, shared by many capabilities) and are referenced by id from `capability.json`. Third-party packages declare script tools with a command, an input schema and permissions; the runner executes them without a shell, with a scrubbed environment and a timeout.

### Context budget

| Surface | Approximate cost |
| --- | --- |
| Six MCP meta-tools (schemas + descriptions) | ~830 tokens (measured 2026-11-17), constant in catalogue size |
| Gateway skill (`skills/extremis`) | ~490 tokens |
| Search result card | ~40 tokens per capability |
| Activation | the capability body (average ~660 tokens over 59 capabilities) + tool schemas; 1,200–4,800 tokens per task measured on four example tasks |

Compare: listing all 59 names and descriptions in a system prompt costs ~3,250 tokens (measured) and grows linearly; loading every `SKILL.md` costs ~39,000.

## 4. Roadmap and status

| Phase | Deliverable | Status |
| --- | --- | --- |
| 1 | Remove duplicate registries and Python scripts; one source of truth per capability; Apache-2.0 license | done (`8b12653`) |
| 2 | Core: frontmatter parser, catalog, index, search, resolver, activation, JSON Schema validator | done (`8b12653`, `c4f8511`) |
| 3 | Tool runner, permission model, built-in tool library, security scanner | done (`8b12653`, `5d457bc`, `2b5ed14`) |
| 4 | MCP server (tools + SEP-2640 skills), CLI, JS SDK | done (`be5b5d7`) |
| 5 | Installer, lockfile, integrity, export adapters, plugin/marketplace, well-known index | done: installer and lockfile (`2b5ed14`), well-known index (`25f4d9a`), exports and Claude Code plugin (`acc8990`), Codex plugin (`9e98b70`) |
| 6 | Workflows, planner, verification batches | done: planner and verification (`c4f8511`), capability wiring (`1455aa1`), five workflows (`b0c979f`) |
| 7 | Python SDK (MCP client, LangChain adapter) | in progress |
| 8 | Evaluation: routing on fixtures and a held-out set; token budget report; CI | done (`c4f8511`, `25d6cba`; `build --check` in CI since `25f4d9a`) |
| Next | Signed releases (Sigstore), optional embedding reranker package, MCP Tasks for long-running tools, community registry | open |

The status column is updated as each phase lands on `main`; see the commit history for evidence.
