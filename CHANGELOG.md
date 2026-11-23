# Changelog

## 0.4.0 — 2026-11-23

### Added
- **Ten specialist agents** in `agents/`: skill-scout, code-reviewer, security-auditor, debugger, release-captain, research-analyst, data-analyst, ai-engineer, architect and product-strategist. Each is a system prompt bound to its capabilities, permissions and workflow. Available as `extremis agents` / `extremis agent <name> [task]`, MCP prompts (`prompts/list`, `prompts/get`), Claude Code subagents (plugin, or `extremis export subagents`), `Extremis#agents()` / `#agent()` and `ExtremisClient.list_prompts()` / `.agent()`. Custom agents load from `.extremis/agents/` and `~/.extremis/agents/`. See [docs/agents.md](docs/agents.md).
- **Four tools** (45 in total): `ci.workflow_lint` (GitHub Actions script injection, pwn requests, permissions, SHA pinning, secrets, curl-pipe-shell, self-hosted runners, timeouts), `iac.terraform_lint` (open ingress, public buckets and databases, encryption, hard-coded credentials, IAM wildcards, IMDSv1, unpinned providers and modules), `prompt.lint` (0–100 score, delimiter and injection checks, conflicting rules) and `eval.score` (exact, normalized, token F1, classification metrics with confusion matrix, groups, bootstrap CI).
- **Ten skills and one workflow** (70 capabilities): a new AI engineering domain with prompt-engineering, llm-evaluation, agent-orchestration, rag-engineering and the **llm-feature-launch** workflow; plus ci-pipeline-hardening, infrastructure-as-code, observability-design, data-pipeline-engineering, dependency-upgrade and codebase-onboarding.
- `extremis validate` checks agents; README artwork is generated from repository facts by `scripts/readme-assets.py`.

### Changed
- Routing: authored Hit@1 49.8% → 51.2%, false activation @1 6.7% → 4.7%; hold-out Hit@1 unchanged at 92.4% (Hit@5 100%). One hold-out prompt ("overview of this codebase I just inherited") now also accepts codebase-onboarding, which did not exist before.
- CI jobs have `timeout-minutes` (flagged by the new `ci.workflow_lint`).

## 0.3.0 — 2026-11-23

### Added
- `extremis find <task>`: federated skill finder. Searches the local catalog, the skills.sh directory, GitHub (`agent-skills` repositories, and `SKILL.md` code search with `GITHUB_TOKEN`) and Agent Skills `.well-known` indexes in parallel; reads and security-scans the top SKILL.md files; ranks by BM25F relevance, term coverage, popularity and publisher; `--install [rank]` installs through the scanned, lockfile-recorded path. See [docs/skill-finder.md](docs/skill-finder.md).
- `extremis_find` MCP gateway tool (seven gateway tools in total), `Extremis#find()` and `find()` in the JavaScript SDK, `ExtremisClient.find()` in Python.
- `extremis_plan` returns a `discover` hint when no installed capability fits with high confidence; the gateway skill tells agents when to use the finder.
- Issue forms, pull request template, Dependabot for GitHub Actions, CITATION.cff.

## 0.2.0 — 2026-11-17

- 54 skills and 5 workflows, 41 permission-gated tools, MCP gateway with Agent Skills resources, Claude Code and Codex plugins, Python client and LangChain adapter, install/update/lock with static scanning, Agent Skills discovery index.
