# Agents

EXTREMIS ships ten specialist agents in [`agents/`](../agents/). An agent is a system prompt bound to the capabilities, permissions and (optionally) workflow it leads with. Agents do not add a new runtime: they work through the same plan, activate, run and verify loop as everything else, so their tool use stays permission-gated and their results stay checkable.

| Agent | Leads with | Permissions |
|---|---|---|
| `skill-scout` | skill-authoring, source-verification, `extremis_find` | read, network |
| `code-reviewer` | code-review, secure-code-review, test-driven-development, quality-assurance | read |
| `security-auditor` | security-assessment (workflow), threat-modeling, secure-code-review, ci-pipeline-hardening, infrastructure-as-code, privacy-impact-review | read |
| `debugger` | debugging, performance-optimization, incident-management, test-driven-development | read |
| `release-captain` | release-readiness (workflow), devops-release, quality-assurance, dependency-upgrade, reliability-analysis | read |
| `research-analyst` | research-report (workflow), literature-review, source-verification, research-synthesis | read, network |
| `data-analyst` | data-report (workflow), data-analysis, data-visualization, spreadsheet-analysis, experimental-design, product-analytics | read |
| `ai-engineer` | llm-feature-launch (workflow), agent-orchestration, prompt-engineering, rag-engineering, llm-evaluation, threat-modeling | read |
| `architect` | technical-planning, systems-engineering, cloud-architecture, api-design, database-design, codebase-onboarding | read |
| `product-strategist` | product-discovery, market-sizing, competitive-analysis, requirements-engineering, product-analytics, marketing-strategy | read |

## Using agents

| Surface | How |
|---|---|
| CLI | `extremis agents` lists them; `extremis agent <name> "<task>"` prints the system prompt, the plan and the capabilities to activate (`--json` for the full brief) |
| MCP | `prompts/list` returns every agent; `prompts/get` with `{"name": "debugger", "arguments": {"task": "..."}}` returns a ready-to-send message |
| Claude Code | The plugin's `agents/` folder is discovered automatically. Without the plugin, `extremis export subagents` writes `.claude/agents/<name>.md` (add `--user` for `~/.claude/agents`, `--agent a,b` to pick) |
| JavaScript | `await extremis.agents()` and `await extremis.agent('security-auditor', task)` |
| Python | `client.list_prompts()`, `client.agent('code-reviewer', task)` |

### The brief

`extremis agent <name> <task>` (and `Extremis#agent`) returns:

- `system_prompt`: the agent's Markdown body.
- `plan`: the normal `extremis_plan` result for the task.
- `activate`: the agent's workflow (if any), then the planned capabilities that are in the agent's profile. If none are, the agent's first two capabilities.
- `outside_profile`: capabilities the plan selected that the agent does not lead with. Use them, but it is a hint that another agent may fit better.

## Writing an agent

Add a Markdown file to `.extremis/agents/` (project) or `~/.extremis/agents/` (user). A file with the same name as a built-in agent replaces it.

```markdown
---
name: migration-planner            # lowercase, hyphenated
description: "Use to plan a database or service migration with reversible steps and rollback points."
model: inherit                     # Claude Code fields pass through on export
color: cyan
extremis:
  capabilities:                    # must exist in the catalog
    - technical-planning
    - database-design
  permissions:                     # read, write, network, exec
    - read
  workflow: feature-delivery       # optional; must be a workflow
---

# Migration Planner

You are ... (role, procedure, output format, guardrails)
```

`extremis validate` checks every built-in agent: name format, description, non-empty prompt, known permissions, and that every capability and workflow it names exists. The `extremis:` block is removed when exporting to Claude Code; Claude Code ignores it either way.

## Design notes

- **Agents are prompts, not processes.** The host decides when to delegate and runs the subagent. EXTREMIS supplies what the agent should know and which capabilities to load.
- **Profiles bias, they do not restrict.** An agent's capability list decides what it activates first; the plan can still bring in other capabilities, reported as `outside_profile`.
- **Permissions are advisory to the host and enforced by the runner.** The tool runner still enforces the allowlist you pass (`--allow`, `EXTREMIS_ALLOW`); an agent declaring `network` does not grant it.
