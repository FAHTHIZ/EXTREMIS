# EXTREMIS

<p align="center">
  <img src="./assets/extremis-hero.svg" alt="EXTREMIS — an animated agent capability engine showing task planning, selective activation, permission-gated tools and verification" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/FAHTHIZ/EXTREMIS/actions/workflows/ci.yml"><img src="https://github.com/FAHTHIZ/EXTREMIS/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/FAHTHIZ/EXTREMIS/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-9b83db?style=flat-square" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18.17-65b88a?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 18.17 or later" />
  <img src="https://img.shields.io/badge/Python-%3E%3D3.9-3776ab?style=flat-square&logo=python&logoColor=white" alt="Python 3.9 or later client" />
  <img src="https://img.shields.io/badge/runtime-dependency--free-f2a66d?style=flat-square" alt="Zero runtime dependencies" />
  <a href="#find-any-skill"><img src="https://img.shields.io/badge/skill%20finder-skills.sh%20%C2%B7%20GitHub%20%C2%B7%20indexes-e89b77?style=flat-square" alt="Federated skill finder across skills.sh, GitHub and Agent Skills indexes" /></a>
  <img src="https://img.shields.io/badge/MCP-7%20gateway%20tools-8d78a7?style=flat-square" alt="Seven MCP gateway tools" />
  <a href="https://github.com/FAHTHIZ/EXTREMIS"><img src="https://img.shields.io/github/stars/FAHTHIZ/EXTREMIS?style=social" alt="GitHub stars" /></a>
</p>

<p align="center">
  <strong>One intelligence. Endless capabilities.</strong>
  <br />
  <sub>Plan, load, run and verify reusable agent capabilities — and find any public skill when the built-in ones are not enough.</sub>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="#find-any-skill">Find any skill</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#capability-library">Capability library</a> ·
  <a href="#integrations">Integrations</a> ·
  <a href="#security-boundaries">Security</a> ·
  <a href="#documentation">Documentation</a>
</p>

---

## What is EXTREMIS?

**EXTREMIS is a portable capability layer for AI agents.** It gives an agent a structured way to discover the right capability, compose a plan, load only the instructions it needs, run deterministic tools behind explicit permission gates, and verify the result before calling the task complete.

It is not another model, agent host, or giant prompt. The host keeps control of reasoning and user consent. EXTREMIS supplies the capability catalog, progressive activation, tool execution, and verification layer.

The repository contains:

<kbd>54</kbd> Agent Skills · <kbd>5</kbd> multi-step workflows · <kbd>41</kbd> permission-gated tools · <kbd>4</kbd> integration paths · <kbd>1</kbd> federated finder for public skills

Every capability is a standard Agent Skills folder with a SKILL.md, so the instruction packages can also be used independently in any host that reads the format.

## See the workflow

<p align="center">
  <img src="./assets/extremis-terminal.svg" alt="Animated terminal preview showing EXTREMIS planning a release-readiness workflow and verifying test results" width="96%" />
</p>

A task moves through a deliberate sequence:

~~~text
task  →  discover  →  plan  →  activate  →  run tools  →  verify  →  result
~~~

**The important part is progressive activation:** the agent does not need every instruction in context before it begins. It discovers lightweight metadata, selects the relevant capabilities, and loads the full instructions only for the chosen work.

## Why progressive activation?

Loading an entire skill library into every conversation wastes context and makes it harder to keep the task focused. EXTREMIS separates discovery from activation.

| Context loaded | Approx. tokens |
|---|---:|
| Gateway skill + seven MCP gateway tool schemas | ~1,500 |
| Names and descriptions for all 59 capabilities | ~3,250 |
| All 59 SKILL.md files loaded in full | ~39,000 |
| Typical task: plan, selected instructions and tool schemas | ~3,000–7,500 |

<sub>Estimates use the repository's context estimator at approximately four characters per token. Actual tokenization varies by model and host.</sub>

## Quickstart

Choose the integration that matches your agent host or application.

| Host / use case | Install |
|---|---|
| **Claude Code plugin** — gateway skill + MCP server | <code>/plugin marketplace add FAHTHIZ/EXTREMIS</code>, then <code>/plugin install extremis@extremis</code> |
| **Agent Skills hosts** — Codex, Cursor, Copilot, Gemini CLI and others | <code>npx skills add FAHTHIZ/EXTREMIS</code> |
| **One capability only** | <code>npx skills add https://github.com/FAHTHIZ/EXTREMIS/tree/main/capabilities --skill code-review</code> |
| **Any MCP client** | <code>npx -y github:FAHTHIZ/EXTREMIS mcp</code> |
| **Codex plugin marketplace** | <code>codex plugin marketplace add FAHTHIZ/EXTREMIS</code>, then install from the Plugins Directory |
| **Node.js project** — CLI + JavaScript SDK | <code>npm install github:FAHTHIZ/EXTREMIS</code> |
| **Python project** — stdlib client, optional LangChain tools | <code>pip install "git+https://github.com/FAHTHIZ/EXTREMIS.git#subdirectory=python"</code> |

The Claude Code plugin also registers a SessionStart hook that adds a ~100-token reminder to plan with EXTREMIS; set <code>EXTREMIS_SESSION_HOOK=off</code> to disable it.

The skills CLI route installs the single EXTREMIS gateway skill, which tells the agent to work through the MCP tools; pair it with the MCP server. To copy capabilities directly into a project, use:

~~~bash
npx -y github:FAHTHIZ/EXTREMIS export claude   # .claude/skills
npx -y github:FAHTHIZ/EXTREMIS export skills   # .agents/skills
~~~

The examples below use <code>npx extremis</code>, available after installing the GitHub package. Without installing, use <code>npx -y github:FAHTHIZ/EXTREMIS</code> before the command.

EXTREMIS also publishes an [Agent Skills discovery index](https://github.com/cloudflare/agent-skills-discovery-rfc) (v0.2.0, with SHA-256 digests) at <code>.well-known/agent-skills/index.json</code>:

~~~bash
npx extremis install https://raw.githubusercontent.com/FAHTHIZ/EXTREMIS/main/.well-known/agent-skills/index.json --skill release-readiness
~~~

### Try the CLI

Ask EXTREMIS to plan a task:

~~~bash
npx extremis plan "is this build ready to release?"
~~~

Then run verification for a selected capability:

~~~bash
npx extremis verify --capability quality-assurance --param test_report=junit.xml
~~~

The CLI reports passed checks and any manual checks that still need human review. A completed tool run is not automatically proof that every acceptance criterion has been met.

## Find any skill

The built-in catalog covers common work. When it does not fit, <code>extremis find</code> searches public skill directories for you, the way <code>npx skills find</code> does, and then reads what it found before recommending anything.

~~~bash
npx extremis find "deploy a next.js app to cloudflare"
~~~

~~~text
 1. cloudflare/skills/nextjs-on-cloudflare
    official · 65,778 installs · scan safe · high match
    Build, migrate, and deploy Next.js apps on Cloudflare Workers with vinext.
    extremis install cloudflare/skills --skill nextjs-on-cloudflare
 2. cloudflare/skills/cloudflare-app-bootstrap
    official · 13,655 installs · scan safe · high match
    ...
~~~

How a search runs:

| Step | What happens |
|---|---|
| **1. Query planning** | The task becomes several short queries (keyword pairs and single keywords), because directory search engines match short queries better than sentences |
| **2. Federated search** | The local catalog, the [skills.sh](https://skills.sh) directory, GitHub repositories tagged <code>agent-skills</code>, GitHub code search for <code>SKILL.md</code> files (with <code>GITHUB_TOKEN</code>), and any Agent Skills <code>.well-known</code> index you pass with <code>--index</code> are searched in parallel |
| **3. Merge** | Results are deduplicated by <code>owner/repo/skill</code>; a skill found by several sources ranks higher |
| **4. Read** | The SKILL.md of the top candidates is downloaded and its frontmatter description and body are indexed |
| **5. Scan** | Every downloaded skill goes through the same scanner as <code>extremis install</code>; dangerous skills drop down the list and show their findings |
| **6. Rank** | BM25 relevance on name, description and body, coverage of your terms, install count or stars, and an official-publisher boost. Popularity only counts in proportion to relevance, so a famous but unrelated skill does not win |

Useful options: <code>--official</code> (vendor-maintained skills only), <code>--owner &lt;org&gt;</code>, <code>--min-installs &lt;n&gt;</code>, <code>--source local,skills.sh,github,index</code>, <code>--no-deep</code> (skip reading), <code>--json</code>, and <code>--install [rank]</code> to install a result through the normal scanned, lockfile-recorded install path. Agents get the same search through the <code>extremis_find</code> MCP tool, and <code>extremis_plan</code> suggests it when nothing installed fits. Queries go to the public services listed above; set <code>EXTREMIS_OFFLINE=1</code> to keep everything local. Details: [docs/skill-finder.md](docs/skill-finder.md).

## How it works

~~~mermaid
flowchart LR
  T["Task"] --> S["Search catalog"]
  S --> P["Plan + order"]
  P --> A["Activate selected skills"]
  A --> R["Run permission-gated tools"]
  R --> V["Verify checks"]
  V --> D["Report result"]
  A -. "load only selected SKILL.md" .-> C["Task-scoped context"]
  classDef stage fill:#1c1a27,stroke:#8d78a7,color:#f1eaff
  classDef focus fill:#30212d,stroke:#e89b77,color:#fff0e5
  class T,S,P,A,R,V,D stage
  class C focus
~~~

### The seven MCP gateway tools

The MCP server exposes a compact gateway:

| Tool | Purpose |
|---|---|
| <code>extremis_search</code> | Discover capabilities relevant to a task |
| <code>extremis_find</code> | Search skills.sh, GitHub and skill indexes; read, scan and rank public skills |
| <code>extremis_plan</code> | Select, order and compose capabilities into a plan |
| <code>extremis_activate</code> | Load the selected capability instructions |
| <code>extremis_read</code> | Read a capability's SKILL.md or bundled resource |
| <code>extremis_run</code> | Execute a built-in tool subject to its permission gate |
| <code>extremis_verify</code> | Run declared checks and separate passed results from manual review |

Capability instructions are also available as MCP resources using <code>skill://&lt;name&gt;/SKILL.md</code>.

### Context efficiency is only part of the story

Progressive disclosure keeps irrelevant instructions out of the active context. The tool layer handles deterministic work, while verification checks make completion criteria explicit. The host model still decides what to call and how to interpret the outcome.

## Capability library

EXTREMIS currently ships **59 catalog entries: 54 skills and 5 multi-step workflows**. The machine-readable index lives at <code>registry/catalog.json</code>; run <code>npx extremis list</code> to see the complete catalog.

Workflows are marked in **bold**.

| Domain | Capabilities |
|---|---|
| Business | competitive-analysis, market-sizing, process-mapping, procurement-analysis, product-discovery |
| Creative communication | content-writing, localization, presentation-design |
| Customer operations | customer-support |
| Data | data-analysis, **data-report**, data-visualization, product-analytics, spreadsheet-analysis |
| Design | accessibility-review, design-system, ux-audit |
| Education | learning-design, study-coaching |
| Engineering | cloud-architecture, incident-management, reliability-analysis, requirements-engineering, systems-engineering, technical-planning |
| Finance | financial-modeling, financial-statement-analysis |
| Marketing | marketing-strategy, search-optimization |
| Meta | skill-authoring |
| Productivity | decision-log, knowledge-management, meeting-synthesis, project-management |
| Research | literature-review, **research-report**, research-synthesis, source-verification |
| Science | experimental-design, scientific-data-analysis |
| Security | privacy-impact-review, secure-code-review, **security-assessment**, threat-modeling |
| Software engineering | api-design, backend-engineering, code-review, database-design, debugging, devops-release, **feature-delivery**, frontend-engineering, mobile-engineering, performance-optimization, quality-assurance, **release-readiness**, repository-audit, technical-documentation, test-driven-development |

Each capability has:

- <code>SKILL.md</code> — portable task instructions.
- <code>capability.json</code> — intents, tools, permissions, dependencies, workflow phase, verification checks and suggested follow-ups.
- Routing evaluation fixtures — prompts that test when a capability should or should not be selected.

## Routing quality

The deterministic BM25F selector is evaluated against an authored set and a separate hold-out set.

| Evaluation set | Hit@1 | Hit@5 | MRR | False activation @1 / @5 |
|---|---:|---:|---:|---:|
| Hold-out (66 prompts) | **92.4%** | **100%** | **0.952** | — |
| Authored (253 positive + 75 negative prompts) | 49.8% | 89.3% | 0.660 | 6.7% / 21.3% |

These are retrieval metrics, not model-performance or instruction-following benchmarks. They do not prove that an agent will execute a capability correctly.

## Integrations

### Claude Code

Install from the repository's plugin marketplace:

~~~text
/plugin marketplace add FAHTHIZ/EXTREMIS
/plugin install extremis@extremis
~~~

### Skills CLI and portable hosts

Install the gateway skill:

~~~bash
npx skills add FAHTHIZ/EXTREMIS
~~~

Or install one selected skill directly:

~~~bash
npx skills add https://github.com/FAHTHIZ/EXTREMIS/tree/main/capabilities --skill code-review
~~~

### MCP

Use this configuration in an MCP-compatible host:

~~~json
{
  "mcpServers": {
    "extremis": {
      "command": "npx",
      "args": ["-y", "github:FAHTHIZ/EXTREMIS", "mcp"]
    }
  }
}
~~~

<code>--expose-tools=dynamic</code> or <code>--expose-tools=all</code> can expose built-in tools directly. The default seven-tool gateway is the safer starting point. MCP support differs between hosts and versions; verify connection, tool discovery, resource reads and permission prompts in the host you use.

### JavaScript SDK

Use the same shared service without starting an MCP process:

~~~js
import { createExtremis } from "extremis";

const extremis = createExtremis({
  cwd: process.cwd(),
  allow: ["read"]
});

const plan = await extremis.plan("profile a CSV and summarize missing values");
const context = await extremis.activate(plan.capabilities.map((item) => item.name));
console.log(context);
~~~

### Python client

The <code>python/</code> package is a dependency-free Python client. It starts <code>extremis mcp</code> (Node.js 18.17+ required) and calls the same seven gateway tools. Install it from the repository:

~~~bash
pip install "git+https://github.com/FAHTHIZ/EXTREMIS.git#subdirectory=python"
~~~

Use the shared service from Python:

~~~python
from extremis import ExtremisClient

with ExtremisClient(cwd=".", allow=["read"]) as x:
    plan = x.plan("is this build ready to release?")
    chosen = [c["name"] for c in plan["capabilities"] if c.get("selected")]
    context = x.activate(chosen)
    print(context)
    print(x.verify(capability="quality-assurance", params={"test_report": "junit.xml"}))
~~~

For the optional LangChain adapter, install the <code>langchain</code> extra:

~~~bash
pip install "extremis-client[langchain] @ git+https://github.com/FAHTHIZ/EXTREMIS.git#subdirectory=python"
~~~

Then use <code>extremis.langchain.as_langchain_tools()</code> to expose the gateway tools as LangChain StructuredTools. See the [Python client guide](python/README.md).

### Agent Skills discovery index

Install a capability directly from the published discovery index:

~~~bash
npx extremis install https://raw.githubusercontent.com/FAHTHIZ/EXTREMIS/main/.well-known/agent-skills/index.json --skill release-readiness
~~~

## Install and manage external capabilities

~~~bash
npx extremis install anthropics/skills/skills/pdf
npx extremis install anthropics/skills/skills/pdf --project
npx extremis lock --verify
npx extremis scan ./path/to/capability
~~~

Supported sources include local folders, GitHub repositories and subdirectories, HTTPS Git remotes, HTTPS SKILL.md URLs, supported archives, and Agent Skills well-known indexes. SSH Git requires <code>EXTREMIS_ALLOW_SSH_GIT=1</code>; plain HTTP requires <code>EXTREMIS_ALLOW_INSECURE_INSTALL=1</code>.

A dangerous scanner finding blocks installation. A caution result requires explicit <code>--accept-risk</code> after review; do not use it as a routine workaround. The lockfile records source identity, resolved commit or digest where available, content hash, scan summary and timestamps. Its content hash is compatible with the skills CLI's v2 <code>computedHash</code>.

## CLI reference

| Command | What it does |
|---|---|
| <code>search &lt;query&gt;</code>, <code>plan &lt;task&gt;</code> | Rank and compose capabilities |
| <code>find &lt;task&gt;</code> | Search public skill directories, read and scan the top SKILL.md files, rank and optionally install |
| <code>activate &lt;name...&gt;</code>, <code>read &lt;name&gt; [file]</code> | Load selected instructions and resources |
| <code>tools</code>, <code>run &lt;tool&gt; k=v</code>, <code>verify</code> | Inspect, execute and verify built-in tools |
| <code>mcp</code>, <code>schema &lt;format&gt;</code> | Start MCP stdio server or export tool schemas |
| <code>export skills\|claude\|mcp\|agents-md</code> | Export host skill folders, MCP config or AGENTS.md |
| <code>install</code>, <code>update</code>, <code>remove</code>, <code>lock</code>, <code>scan</code> | Manage external capabilities and integrity |
| <code>validate</code>, <code>eval</code>, <code>build</code>, <code>doctor</code> | Validate, evaluate, rebuild the catalog and diagnose |

## Architecture

~~~text
Agent host
  ├─ Model reasoning, tool decisions and user consent
  └─ EXTREMIS integration
       ├─ MCP server
       ├─ CLI
       ├─ JavaScript SDK
       └─ Python client
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
         └─ Installer, scanner, hashes and lockfile
~~~

The host remains responsible for deciding whether a tool should be called and what the user has approved. EXTREMIS validates tool inputs and declared permissions; it does not replace host-side consent or operating-system isolation.

## Security boundaries

EXTREMIS processes third-party instructions, manifests, references, resources and possible scripts. Treat external capability content as untrusted until reviewed.

- **Default permission is read-only.** The runner recognizes read, write, network and exec. A manifest declaring a permission does not grant it.
- **The host owns consent.** The agent host remains responsible for user approval and the decision to call a tool.
- **Scanning is not certification.** The static scanner can produce false positives and false negatives. A safe result is not a security guarantee.
- **Dangerous findings are blocked.** Caution findings need explicit risk acceptance after review; dangerous findings cannot be overridden.
- **Subprocesses are not sandboxed.** The exec permission can start ordinary operating-system processes. Do not grant it to untrusted capabilities.
- **Network checks have limits.** Private and special-use destinations are blocked by default, and redirects are validated. DNS preflight is not IP pinning; use host-level egress restrictions for higher-risk environments.
- **Filesystem checks have limits.** Built-in write helpers enforce workspace boundaries and reject symlinked paths, but are not a race-free OS sandbox.

Read the full [security model](docs/security.md) and [security policy](SECURITY.md) before installing or executing third-party capabilities.

## Development and quality checks

~~~bash
npm test
npm run validate
npm run eval
node bin/extremis.mjs build --check
~~~

The test suite uses Node's built-in test runner. CI exercises supported Node versions across Linux, macOS and Windows. The Python client has its own tests in <code>python/tests</code>; see [python/README.md](python/README.md).

Routing fixtures measure deterministic retrieval behavior. They do not prove that a model follows a capability correctly. Behavioral evaluations should record the model, host, evaluator, date, dataset and scoring procedure.

## Documentation

| Topic | Documentation |
|---|---|
| **Skill finder** | [How <code>extremis find</code> searches and ranks](docs/skill-finder.md) |
| **Architecture** | [Architecture assessment and roadmap](docs/architecture-assessment.md) · [Comparison](docs/COMPARISON.md) |
| **Security and trust** | [Security model](docs/security.md) · [Security policy](SECURITY.md) |
| **Host support** | [Host compatibility](docs/host-compatibility.md) · [Marketplace integration](docs/marketplace-integration.md) |
| **Capability quality** | [Skill quality](docs/skill-quality.md) · [Librarian](docs/librarian.md) · [Landscape review](docs/landscape-review.md) |
| **Python client** | [Python README](python/README.md) |
| **Contributing** | [Contribution guide](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) |

## Project status

EXTREMIS is an actively evolving open-source capability layer. Capability maturity and risk metadata are advisory; review them before production use. EXTREMIS does not operate a hosted marketplace and does not provide a completed native adapter for every agent host. The portable capability format and the generic MCP, CLI, JavaScript SDK and Python client interfaces are available now.

## Contributing

Keep changes focused and testable. Add regression tests for security-sensitive behavior, document permission and compatibility changes, and report what was tested—including anything that could not be reproduced locally. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

EXTREMIS is licensed under the [Apache License 2.0](LICENSE).
