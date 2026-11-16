# EXTREMIS

<p align="center"><strong>One intelligence. Endless capabilities.</strong></p>
<p align="center">A portable capability runtime and supply-chain toolkit for AI agents.</p>

EXTREMIS gives compatible agent hosts a shared way to discover, activate, compose, run, and verify reusable capabilities. It combines the open Agent Skills directory convention with a Node.js service layer, permission-gated tools, an MCP server, CLI, JavaScript SDK, installer, lockfile, and static security scanner.

It is designed to work independently and integrate with different agent runtimes. EXTREMIS is not a model or an agent host: the host remains responsible for reasoning, user approval, and the final conversation.

## What is included

- **Capability catalog:** built-in and user-installed skills, workflows, manifests, references, and dependencies.
- **Progressive activation:** compact discovery cards first, full instructions and tool schemas when activated, and individual resources on demand.
- **Task composition:** capability planning, dependency closure, phase ordering, and verification checklists.
- **Tool runtime:** schema validation, explicit permission checks, workspace-aware built-in file operations, timeouts, and output limits.
- **Integrations:** a shared JavaScript service, MCP server, CLI, and SDK.
- **Distribution controls:** Git/URL/local installation, project or user scope, content hashes, lockfile drift detection, updates, removal, archive validation, and security scanning.
- **Quality checks:** offline routing fixtures, capability linting, and diagnostics.

## Requirements

- Node.js 18.17 or newer.
- Git for installing Git-backed sources.
- No runtime third-party dependencies are required by the core package.

## Install

Add EXTREMIS to an existing Node.js project:

```bash
npm install github:FAHTHIZ/EXTREMIS
```

Or clone the repository for development:

```bash
git clone https://github.com/FAHTHIZ/EXTREMIS.git
cd EXTREMIS
npm test
npm run validate
npm run eval
```

Check the environment and catalog:

```bash
npx extremis doctor
npx extremis list
npx extremis tools
```

## CLI quick start

Discover capabilities and compose a task plan:

```bash
npx extremis search "review a TypeScript repository"
npx extremis plan "audit a Node.js API for reliability and security"
npx extremis activate repository-audit debugging
```

Inspect and run a built-in tool (the caller must have the required permission):

```bash
npx extremis tools
npx extremis tool data.profile
npx extremis run data.profile path=./data/sales.csv
```

Validate the catalog, inspect routing quality, and diagnose the runtime:

```bash
npx extremis validate
npx extremis eval
npx extremis doctor
```

### Install external capabilities

Install from a GitHub repository or subdirectory:

```bash
npx extremis install anthropics/skills/skills/pdf
```

Install into the current project instead of the user profile:

```bash
npx extremis install anthropics/skills/skills/pdf --project
```

Inspect installed capabilities and verify their lockfile hashes:

```bash
npx extremis lock
npx extremis lock --verify
npx extremis update
npx extremis remove pdf
```

Scan a capability directory before trusting it:

```bash
npx extremis scan ./path/to/capability
```

A dangerous finding blocks installation. A caution result requires explicit `--accept-risk` after reviewing the findings. Do not use that flag as a routine workaround.

Supported sources include local capability folders, GitHub repository/subdirectory references, HTTPS Git remotes, HTTPS `SKILL.md` URLs, archives, and Agent Skills well-known indexes. Local `file://` Git sources are intended for local repositories. SSH Git transport is disabled by default and requires the explicit `EXTREMIS_ALLOW_SSH_GIT=1` opt-in. Plain HTTP downloads and Git remotes require `EXTREMIS_ALLOW_INSECURE_INSTALL=1`; prefer HTTPS.

## MCP integration

Start the stdio server:

```bash
npx extremis mcp
```

The gateway exposes six stable tools:

- `extremis_search`
- `extremis_plan`
- `extremis_activate`
- `extremis_read`
- `extremis_run`
- `extremis_verify`

The server also exposes capability instructions and resources through the Agent Skills-over-MCP extension. Optional direct tool exposure is available with `--expose-tools=dynamic` or `--expose-tools=all`. The default gateway is the safer starting point.

Example host configuration when the package is installed in the current project:

```json
{
  "mcpServers": {
    "extremis": {
      "command": "node",
      "args": ["./node_modules/extremis/bin/extremis.mjs", "mcp"]
    }
  }
}
```

MCP compatibility depends on the target host and client version. Verify connection, tool discovery, resource reads, and permission behavior in the actual host.

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
```

The test suite uses Node's built-in test runner. CI exercises supported Node versions across Linux, macOS, and Windows. Routing fixtures measure deterministic retrieval behavior; they do not prove that a model follows a capability correctly. Behavioral evaluations should record the model, host, evaluator, date, dataset, and scoring procedure.

## Project status and license

EXTREMIS is an actively evolving open-source capability layer. Capability maturity and risk metadata are advisory and should be reviewed before production use. The project is licensed under [Apache-2.0](LICENSE).

## Contributing

Keep changes focused and testable. Add regression tests for security-sensitive behavior, document permission and compatibility changes, and report what was tested—including anything that could not be reproduced locally.
