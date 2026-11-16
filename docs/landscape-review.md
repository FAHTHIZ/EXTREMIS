# Capability ecosystem landscape review

**Reviewed:** 2026-11-16  
**Scope:** representative public skill ecosystems and agent-capability projects. This is an architecture comparison, not an exhaustive census, security audit, or benchmark of model performance.

## Projects and patterns reviewed

| Project | Useful pattern | Boundary to preserve |
| --- | --- | --- |
| [Agent Skills specification](https://agentskills.io/specification) | Portable skill directory, required `name` and `description`, progressive disclosure, optional references/scripts/assets | The format does not grant tools, permissions, hooks, memory, or orchestration |
| [Vercel Skills CLI](https://github.com/vercel-labs/skills) and [skills.sh](https://skills.sh) | Cross-host discovery, installation, updates, host-specific paths, and lockfile integrity | Popularity is not a quality score; raw package count is not capability quality |
| [Anthropic skills](https://github.com/anthropics/skills) | Focused examples spanning documents, development, design, creative, and enterprise workflows | Skill content and licenses can vary by directory; review before reuse |
| [Superpowers](https://github.com/obra/superpowers) | Connected development methodology: clarify, plan, TDD, debug, review, verify, and compose workflows | Strong opinions must not be applied blindly to every language, project, or task |
| [Everything Claude Code](https://github.com/affaan-m/everything-claude-code) | Skills alongside agents, hooks, memory conventions, commands, rules, security scanning, and token optimization | Skills, hooks, executable integrations, and runtime features are different artifact classes |
| [gstack](https://github.com/garrytan/gstack) | Specialist role workflows for product framing, specification, design, engineering review, QA, and verification | A role prompt is not an independent agent or an entitlement to spawn subagents |
| [Claude-Mem](https://github.com/thedotmack/claude-mem) | Persistent memory implemented with lifecycle integration, storage, retrieval, and supporting services | Memory requires explicit runtime and data-governance design; it is not just a Markdown skill |
| [Obsidian skills](https://github.com/obsidianmd/obsidian-skills) | Application-specific procedures for concrete formats and actual CLI capabilities while retaining a portable format | Application-specific skills must declare application and tool prerequisites |

## Design decisions for EXTREMIS

1. **Use the standard, not a proprietary fork.** Keep portable instructions in the Agent Skills format; host-specific adapters belong outside the capability procedure.
2. **Metadata first, instructions on activation.** Keep discovery light and load references only when a selected capability needs them.
3. **A skill is not a plugin.** Instructions cannot create browser access, API credentials, file-system permissions, databases, memory, or subagents. Those belong to integrations or the host runtime.
4. **Compose focused capabilities.** Use explicit dependencies and workflows instead of turning every procedure into one large prompt.
5. **Evaluate behavior.** Fixtures should include normal, edge, failure, and non-trigger cases. They are test inputs, not proof that a model passed a benchmark.
6. **Treat provenance and license as first-class.** Write original EXTREMIS content by default. External contributions require source, license compatibility, and required notices.
7. **Separate automation from instructions.** Hooks, scripts, memory services, agent dispatch, and permission enforcement need executable code, explicit boundaries, and host-specific tests.
8. **Keep the host in control.** EXTREMIS can expose plans and tools, but the host decides whether to call them and what the user has approved.

## Retrieval and evaluation patterns

| Project/research | Useful pattern | EXTREMIS implication |
| --- | --- | --- |
| [Anthropic Skill Creator](https://claude.com/plugins/skill-creator) | Create, Eval, Improve, and Benchmark workflow; separate execution, grading, comparison, and analysis | Separate fixture design, routing tests, live execution, grading, and version comparison |
| [NVIDIA SkillEvaluator](https://github.com/NVIDIA/SkillEvaluator) | Tiered deterministic validation, security/quality checks, semantic overlap analysis, eval generation, and sandboxed live evaluation | Keep keyless checks fast in CI; make model- or sandbox-based evaluation optional and explicit |
| [Vercel Skills CLI](https://github.com/vercel-labs/skills) | Per-skill source hashes, lockfile restore, update checks, installation modes, and drift detection | Package lifecycle should preserve source identity, integrity, and recoverability |
| [SkillRouter paper](https://arxiv.org/abs/2603.22455) | Two-stage retrieval/reranking for large skill pools; full skill text can carry important routing signal | Keep full instruction text searchable and evaluate rerankers against a held-out set |

## Current EXTREMIS implementation

- `src/catalog.mjs` loads built-in, project, user, and configured external capability roots. `SKILL.md` is the portable source of truth; `capability.json` adds optional runtime metadata.
- `src/search.mjs` provides deterministic field-weighted BM25F over capability metadata and complete instruction bodies, with conservative synonym expansion and `not_for` penalties. Hosts may supply an optional reranker.
- `src/plan.mjs` selects an appropriate workflow when one clearly matches; otherwise it composes a bounded capability set, resolves dependencies, orders phases, and merges verification checks.
- `src/service.mjs` is shared by the MCP server, CLI, and JavaScript SDK so the integrations use the same discovery and execution behavior.
- `src/install.mjs`, `src/scan.mjs`, and `src/archive.mjs` provide installation, static scanning, archive validation, lockfile integrity, updates, and removal.
- `evals/` and `npx extremis eval` provide authored and holdout routing fixtures with deterministic retrieval metrics.

The lexical routing report is a retrieval diagnostic. It is not a model-behavior benchmark, quality certification, or proof that a selected capability improves task success.

## What was not done

This review did not exhaustively enumerate every public skill repository, install or run competitors, perform a security audit of their code, or benchmark them head-to-head. The conclusions are an architecture synthesis from public project documentation and repository structures, not claims of measured superiority.

## Implementation implications

1. **Activation is a quality problem.** Test realistic positive and near-miss prompts, not only structural parsing. Keep activation descriptions precise.
2. **Progressive disclosure matters.** Keep activation metadata compact, the procedure focused, and supporting references separate.
3. **Installation is a separate product layer.** EXTREMIS now manages capability installation and lifecycle locally; native host installation and hosted marketplace services remain separate integration work.
4. **Plugins bundle distinct artifact classes.** Plugins may combine skills, subagents, hooks, and connectors. Skill instructions must not imply they grant these capabilities.
5. **Integrity is not authenticity.** A content hash detects drift from a recorded state; publisher signing and independent provenance review are separate controls.
6. **Static scanning is not sandboxing.** The scanner is heuristic, and third-party scripts remain ordinary subprocesses unless the host provides OS-level isolation.

## Next research priorities

1. Compare optional semantic reranking against the current BM25F baseline using a human-reviewed holdout dataset.
2. Test MCP compatibility and SDK behavior across real host/client versions.
3. Measure behavioral task outcomes in isolated, permission-limited environments.
4. Review publisher signing, registry metadata, and revocation workflows before operating a public marketplace.
