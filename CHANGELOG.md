# Changelog

## 0.3.0 — 2026-11-23

### Added
- `extremis find <task>`: federated skill finder. Searches the local catalog, the skills.sh directory, GitHub (`agent-skills` repositories, and `SKILL.md` code search with `GITHUB_TOKEN`) and Agent Skills `.well-known` indexes in parallel; reads and security-scans the top SKILL.md files; ranks by BM25F relevance, term coverage, popularity and publisher; `--install [rank]` installs through the scanned, lockfile-recorded path. See [docs/skill-finder.md](docs/skill-finder.md).
- `extremis_find` MCP gateway tool (seven gateway tools in total), `Extremis#find()` and `find()` in the JavaScript SDK, `ExtremisClient.find()` in Python.
- `extremis_plan` returns a `discover` hint when no installed capability fits with high confidence; the gateway skill tells agents when to use the finder.
- Issue forms, pull request template, Dependabot for GitHub Actions, CITATION.cff.

## 0.2.0 — 2026-11-17

- 54 skills and 5 workflows, 41 permission-gated tools, MCP gateway with Agent Skills resources, Claude Code and Codex plugins, Python client and LangChain adapter, install/update/lock with static scanning, Agent Skills discovery index.
