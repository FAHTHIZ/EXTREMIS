# EXTREMIS

<p align="center"><strong>One intelligence. Endless capabilities.</strong></p>
<p align="center">Plan, load, run and verify reusable agent capabilities, on demand.</p>

<p align="center">
<a href="https://github.com/FAHTHIZ/EXTREMIS/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/FAHTHIZ/EXTREMIS/actions/workflows/ci.yml/badge.svg"></a>
<a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a>
<img alt="Node >= 18.17" src="https://img.shields.io/badge/node-%3E%3D18.17-339933">
<img alt="Zero dependencies" src="https://img.shields.io/badge/dependencies-0-brightgreen">
</p>

EXTREMIS is a catalog of **59 capabilities** (54 skills and 5 multi-step workflows) plus a small runtime that agents reach through MCP, a CLI or a JavaScript SDK. Instead of loading every skill into context, the agent asks EXTREMIS for a plan, loads only the instructions it needs, runs **41 permission-gated tools** for the deterministic parts, and runs **verification checks** before it reports a task as done.

Capabilities are standard [Agent Skills](https://agentskills.io/specification) folders, so they also work without the runtime in any host that reads `SKILL.md`.

## Install

| Host | Command |
|---|---|
| Claude Code (plugin: gateway skill + MCP server) | `/plugin marketplace add FAHTHIZ/EXTREMIS` then `/plugin install extremis@extremis` |
| Any Agent Skills host via [skills CLI](https://github.com/vercel-labs/skills) (Codex, Cursor, Copilot, Gemini CLI, …) | `npx skills add FAHTHIZ/EXTREMIS` |
| Individual capabilities via skills CLI | `npx skills add https://github.com/FAHTHIZ/EXTREMIS/tree/main/capabilities --skill code-review` |
| Any MCP client | `npx -y github:FAHTHIZ/EXTREMIS mcp` (config snippets: `extremis export mcp --host claude\|cursor\|vscode\|codex`) |
| Codex (repo marketplace) | `codex plugin marketplace add FAHTHIZ/EXTREMIS`, then install from the Plugins Directory |
| Node.js project (CLI + SDK) | `npm install github:FAHTHIZ/EXTREMIS` |

The `npx skills add FAHTHIZ/EXTREMIS` route installs the single `extremis` gateway skill, which tells the agent to work through the MCP tools; pair it with the MCP server. To copy capabilities into a project directly, run `npx -y github:FAHTHIZ/EXTREMIS export claude` (`.claude/skills`) or `... export skills` (`.agents/skills`).

The examples below use `npx extremis`, which works after `npm install github:FAHTHIZ/EXTREMIS`. Without installing, use `npx -y github:FAHTHIZ/EXTREMIS <command>`.

The repository also publishes an [Agent Skills discovery index](https://github.com/cloudflare/agent-skills-discovery-rfc) (v0.2.0, with sha256 digests) at `.well-known/agent-skills/index.json`:

```bash
npx extremis install https://raw.githubusercontent.com/FAHTHIZ/EXTREMIS/main/.well-known/agent-skills/index.json --skill release-readiness
```

## How it works

```text
task ─▶ plan ─▶ activate ─▶ run tools ─▶ verify ─▶ done
        choose    load only    permission-   tool checks +
        + order   selected     gated         manual checks
                  instructions
```

```console
$ npx extremis plan "is this build ready to release?"
Plan (workflow: release-readiness, confidence high)
1. [verify] tests (quality-assurance)
    Confirm the test report has no failures or errors
    tools: test.parse_report
2. [plan] compat (api-design) (optional)
    Check API changes for breaking changes and the version bump
    tools: api.openapi_diff
3. [verify] security (secure-code-review)
    Check for new secrets, flagged dependencies and container issues
    tools: security.secret_scan, code.dependency_inventory, container.dockerfile_lint
...

$ npx extremis verify --capability quality-assurance --param test_report=junit.xml
PASSED   No failing or erroring tests in the release candidate
MANUAL   Test coverage follows a stated risk ranking
MANUAL   Known issues are listed with severity and an owner
```

Over MCP the same steps are six gateway tools: `extremis_search`, `extremis_plan`, `extremis_activate`, `extremis_read`, `extremis_run` and `extremis_verify`. Capability instructions are also exposed as MCP resources (`skill://<name>/SKILL.md`).

### Context cost

Measured with the repository's estimator (about 4 characters per token):

| What is in context | Tokens |
|---|---|
| Gateway: 6 MCP tool schemas + gateway skill | ~1,300 |
| All 59 names and descriptions (native skill install) | ~3,250 |
| All 59 `SKILL.md` files loaded in full | ~39,000 |
| One task: plan result | 400–1,300 |
| One task: activated instructions and tool schemas | 1,200–4,800 |

A typical task therefore costs roughly 3,000–7,500 tokens on top of the idle ~1,300, against ~39,000 to load every instruction up front.

## Capabilities

Workflows are in **bold**. `npx extremis list` shows the full catalog, and `registry/catalog.json` is the machine-readable index.

| Domain | Capabilities |
|---|---|
| business | competitive-analysis, market-sizing, process-mapping, procurement-analysis, product-discovery |
| creative-communication | content-writing, localization, presentation-design |
| customer-operations | customer-support |
| data | data-analysis, **data-report**, data-visualization, product-analytics, spreadsheet-analysis |
| design | accessibility-review, design-system, ux-audit |
| education | learning-design, study-coaching |
| engineering | cloud-architecture, incident-management, reliability-analysis, requirements-engineering, systems-engineering, technical-planning |
| finance | financial-modeling, financial-statement-analysis |
| marketing | marketing-strategy, search-optimization |
| meta | skill-authoring |
| productivity | decision-log, knowledge-management, meeting-synthesis, project-management |
| research | literature-review, **research-report**, research-synthesis, source-verification |
| science | experimental-design, scientific-data-analysis |
| security | privacy-impact-review, secure-code-review, **security-assessment**, threat-modeling |
| software-engineering | api-design, backend-engineering, code-review, database-design, debugging, devops-release, **feature-delivery**, frontend-engineering, mobile-engineering, performance-optimization, quality-assurance, **release-readiness**, repository-audit, technical-documentation, test-driven-development |

Each capability has a `SKILL.md` (instructions), a `capability.json` (intents, tools, permissions, phase, verification checks, suggested follow-ups) and routing evals.

### Routing quality

`npm run eval` scores the deterministic BM25F selector on two sets. The authored set (253 positive and 75 negative prompts) was written alongside the capabilities. The hold-out set (66 prompts) is not used for tuning.

| Set | Hit@1 | Hit@5 | MRR | False activation @1 / @5 |
|---|---|---|---|---|
| Hold-out | 92.4% | 100% | 0.952 | — |
| Authored | 49.8% | 89.3% | 0.660 | 6.7% / 21.3% |

These numbers measure retrieval only. They do not show that a model follows a capability correctly.

## CLI

| Command | Purpose |
|---|---|
| `search <query>`, `plan <task>` | rank capabilities; choose and order them with tools and checks |
| `activate <name...>`, `read <name> [file]` | print instructions, tool schemas and bundled files |
| `tools`, `run <tool> k=v`, `verify` | list, run and check with built-in tools (`--allow read,write,network,exec`) |
| `mcp`, `schema <format>` | MCP stdio server; tool schemas for OpenAI, Anthropic, Gemini or MCP |
| `export skills\|claude\|mcp\|agents-md` | write host skill folders, MCP config or an AGENTS.md block |
| `install`, `update`, `remove`, `lock [--verify]`, `scan` | install from GitHub, Git, URLs, archives or well-known indexes, with hashes and a security scan |
| `validate`, `eval`, `build [--check]`, `doctor` | lint, routing quality, regenerate the catalog and discovery index, diagnostics |

### Install external capabilities

```bash
npx extremis install anthropics/skills/skills/pdf            # user scope
npx extremis install anthropics/skills/skills/pdf --project  # project scope
npx extremis lock --verify                                   # detect drift against the lockfile
npx extremis scan ./path/to/capability                       # scan before trusting
```

A dangerous finding blocks installation. A caution result requires an explicit `--accept-risk` after you review the findings; do not use that flag as a routine workaround. `extremis-lock.json` hashes use the same algorithm as the skills CLI's `skills-lock.json` v2 `computedHash`, so both tools agree on whether a folder changed.

Supported sources: local folders, GitHub `owner/repo[/path][#ref]`, HTTPS Git remotes, HTTPS `SKILL.md` URLs, archives and Agent Skills well-known indexes. SSH Git needs `EXTREMIS_ALLOW_SSH_GIT=1`; plain HTTP needs `EXTREMIS_ALLOW_INSECURE_INSTALL=1`.

## MCP configuration

```json
{
  "mcpServers": {
    "extremis": {
      "command": "npx",
      "args": ["-y", "github:FAHTHIZ/EXTREMIS", "mcp"]
    }
  }
}
```

`--expose-tools=dynamic` or `--expose-tools=all` also exposes built-in tools directly; the default six-tool gateway is the safer starting point. MCP support differs between hosts and versions, so check connection, tool discovery, resource reads and permission prompts in the host you use.

## JavaScript SDK

Use the same shared service without starting an MCP process:

```js
import { createExtremis } from "extremis";

const extremis = createExtremis({
  cwd: process.cwd(),
  allow: ["read"]
});

const plan = await extremis.plan("profile a CSV and summarize missing values");
const context = await extremis.activate(plan.capabilities.map((item) => item.name));
console.log(context);
```

Grant only the permissions required by the task. The default allowlist is read-only. Write, network, and subprocess execution require explicit permission.

## Architecture

```text
Agent host
  ├─ MCP server
  ├─ CLI
  └─ JavaScript SDK
        │
        ▼
  Shared EXTREMIS service
        ├─ Catalog and discovery
        ├─ Planning and dependency resolution
        ├─ Progressive activation and resource reads
        ├─ Permission-gated tool runner
        └─ Verification
              │
              ▼
  Capability packages + built-in tools
        └─ Installer, scanner, hashes, and lockfile
```

The host remains responsible for deciding whether a tool should be called and what the user has approved. EXTREMIS validates tool inputs and declared permissions; it does not replace host-side consent or operating-system isolation.

## Security model and limitations

Capabilities are untrusted input until reviewed. The scanner is a static heuristic, not a security certification. The tool runner is permission-gated, but arbitrary third-party scripts are ordinary subprocesses and are **not** an OS sandbox. Do not grant `exec` to untrusted capabilities.

Built-in file operations enforce workspace boundaries and reject symlinked write paths. Network operations reject private-address destinations by default and validate redirect destinations. DNS checks are preflight controls, not guaranteed IP pinning or a replacement for network-level egress restrictions. Use an egress firewall or isolated environment for higher-risk workloads.

Read the [security model](docs/security.md) before installing or executing third-party capabilities.

## Development and quality checks

```bash
npm test
npm run validate
npm run eval
node bin/extremis.mjs build --check
```

The test suite uses Node's built-in test runner. CI exercises supported Node versions across Linux, macOS, and Windows. Routing fixtures measure deterministic retrieval behavior; they do not prove that a model follows a capability correctly. Behavioral evaluations should record the model, host, evaluator, date, dataset, and scoring procedure.

## Comparison

See [docs/COMPARISON.md](docs/COMPARISON.md) for a dated comparison with anthropics/skills, obra/superpowers, vercel-labs/skills and addyosmani/agent-skills.

## Project status and license

EXTREMIS is an actively evolving open-source capability layer. Capability maturity and risk metadata are advisory and should be reviewed before production use. The project is licensed under [Apache-2.0](LICENSE).

## Contributing

Keep changes focused and testable. Add regression tests for security-sensitive behavior, document permission and compatibility changes, and report what was tested—including anything that could not be reproduced locally.
