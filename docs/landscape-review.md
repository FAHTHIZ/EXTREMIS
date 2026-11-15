# Capability-library landscape review

**Reviewed:** 2026-11-15  
**Scope:** representative public skill ecosystems and agent capability projects; this is not an exhaustive census or a benchmark of model performance.

## Projects and patterns reviewed

| Project | Useful pattern | Boundary to preserve |
| --- | --- | --- |
| [Agent Skills specification](https://agentskills.io/specification) | Portable skill directory, required `name` and `description`, progressive disclosure, optional references/scripts/assets | The specification does not grant tools, permissions, hooks, memory, or orchestration |
| [Vercel skills CLI](https://github.com/vercel-labs/skills) and [skills.sh](https://skills.sh) | Cross-host discovery, installation, updates, host-specific paths, lockfile integrity, broad ecosystem support | Popularity is not a quality score; Extremis should not optimize for downloads or raw count |
| [Anthropic skills](https://github.com/anthropics/skills) | Focused examples spanning documents, development, design, creative and enterprise workflows | Their skills are examples and product-specific packages; content/license status can vary by directory |
| [Superpowers](https://github.com/obra/superpowers) | Connected development methodology: clarify, plan, TDD, debug, review, verify, and compose workflows | Strong opinions must not be applied blindly to every language, project, or task |
| [Everything Claude Code](https://github.com/affaan-m/everything-claude-code) | Skills alongside agents, hooks, memory conventions, commands, rules, security scanning, and token optimization | Skills, hooks, executable integrations, and runtime features are different artifact classes |
| [gstack](https://github.com/garrytan/gstack) | Specialist role workflows for product framing, specification, design, engineering review, QA, and verification | A role prompt is not an independent agent or an entitlement to spawn subagents |
| [Claude-Mem](https://github.com/thedotmack/claude-mem) | Persistent memory implemented with lifecycle integration, storage, retrieval, and supporting services | Memory requires an explicit runtime and data-governance design; it is not just a Markdown skill |
| [Obsidian skills](https://github.com/obsidianmd/obsidian-skills) | Application-specific procedures for concrete formats and actual CLI capabilities while retaining a portable skill format | Application-specific skills must declare their application and tool prerequisites |

## Design decisions for EXTREMIS

1. **Use the standard, not a proprietary fork.** Keep core skills in the Agent Skills format; host adapters belong outside the portable procedure.
2. **Metadata first, instructions on activation.** Keep discovery light and load references only when the selected skill needs them.
3. **A skill is not a plugin.** Instructions cannot create browser access, API credentials, file-system permissions, databases, memory, or subagents. Those belong to integrations or the host runtime.
4. **Compose workflows from narrow skills.** Keep each skill focused and connect them through explicit dependencies/workflows instead of mega-prompts.
5. **Evaluate behavior.** Each package carries normal, edge, failure, and non-trigger scenarios. These fixtures are test inputs, not proof that a model passed a benchmark; benchmark results must identify model, host, evaluator, date, and scoring method.
6. **Treat provenance and license as first-class.** Write original Extremis content by default. External contributions require source, license compatibility, and required notices. A repository without a selected license must not imply general reuse rights.
7. **Keep automation separate.** Hooks, installers, scripts, memory services, agent dispatch, and permission enforcement need executable code, explicit security boundaries, and host-specific tests.

## What was not done

This review did not exhaustively enumerate every public skill repository, install or run competitors, perform a security audit of their code, or benchmark them head-to-head. The conclusions are an architecture synthesis from public project documentation and repository structures, not claims of measured superiority.


## Additional research findings and implementation implications

1. **Activation is a quality problem.** Skill descriptions are a primary discovery/trigger surface. Test realistic positive and near-miss prompts, not only structural parsing. Every new package in this batch has eight trigger/boundary fixtures.
2. **Progressive disclosure is essential.** Keep activation metadata small, the procedure focused, and supporting references or deterministic scripts separate.
3. **Installation is a separate product layer.** Cross-host CLIs handle source resolution, targeted installs, host paths, project/global scope, updates, and lockfiles. Extremis should remain portable; the host project or marketplace should own native installation and runtime adapters.
4. **Plugins bundle distinct artifact classes.** Plugins may combine skills, sub-agents, hooks, and connectors. Skills must not imply they grant tools or permissions.

## Catalog consistency correction

The domain registry omitted four software-engineering skills already present in the 43-skill index. This update brings the taxonomy into parity and adds automated checks so omissions, duplicate assignments, and category mismatches fail validation.
