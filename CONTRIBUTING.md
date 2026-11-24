# Contributing to EXTREMIS

Thank you for helping improve EXTREMIS. The project combines portable Agent Skills, multi-step workflows, specialist-agent prompts, permission-gated tools, discovery, and shared runtime integrations. Contributions should keep those parts consistent and independently testable.

## Choose the right contribution

- **Capability:** add or improve one reusable procedure in `capabilities/<name>/`, with a portable `SKILL.md` and an EXTREMIS `capability.json` manifest.
- **Workflow:** use a capability with explicit ordered steps, dependencies, optional steps, and completion criteria when the task genuinely spans multiple capabilities.
- **Specialist agent:** add a focused prompt in `agents/<name>.md` that leads with a defined capability profile. Agents use the existing EXTREMIS plan/activate/run/verify flow; they are not separate model runtimes.
- **Built-in tool:** add deterministic functionality under `src/tools/` when multiple capabilities can reuse it. Define its input schema and permission requirements, and cover it with tests.

Prefer extending an existing capability or tool over adding a near-duplicate.

## Before proposing a change

1. Check the built-in catalog with `npx extremis list` and `npx extremis search "<task>"`.
2. When no installed capability fits, check public skills with `npx extremis find "<task>"`.
3. Describe the recurring task, activation boundary, prerequisites, expected output, failure cases, and how the result can be verified.
4. Identify host, runtime, network, data, and permission assumptions. Do not imply that a skill grants tools or permissions.
5. Record the source and license of any reused material. Prefer original content and preserve third-party notices where reuse requires them.

## Capability package requirements

A built-in capability lives under `capabilities/<name>/` and includes:

- `SKILL.md` with the portable Agent Skills frontmatter and actionable instructions.
- `capability.json` with EXTREMIS metadata such as domain, intents, tools, permissions, dependencies, risk, workflow steps (where applicable), and verification checks.

Keep instructions focused. Put detailed supporting material in references and load it only when a task needs it. Do not put credentials, private data, or unrelated environment details into skills, tests, fixtures, or examples.

Add or update routing fixtures under `evals/` for positive, edge, and non-trigger cases. If behavior or safety boundaries change, add regression tests under `test/` and update the changelog. Do not tune against or weaken the held-out set to make a change appear better.

## Agents, tools, and integrations

- **Agents:** add a Markdown prompt under `agents/`; list only capabilities and workflows that exist. `npm run validate` checks built-in agent references.
- **Tools:** add the implementation and schema under `src/tools/`, declare permissions, validate inputs, keep filesystem and network boundaries explicit, and add tests.
- **Runtime or adapters:** keep the CLI, MCP server, and JavaScript SDK on the shared service layer. Update the Python client only when its public interface or behavior changes.
- **Generated artifacts:** `registry/catalog.json` and `.well-known/agent-skills/index.json` are generated. Regenerate them with `node bin/extremis.mjs build`; do not hand-edit generated output.

## Review checklist

- [ ] Names, frontmatter, manifests, and directory paths agree.
- [ ] Activation scope is specific and non-duplicative.
- [ ] Inputs, prerequisites, outputs, failure behavior, and stop conditions are explicit.
- [ ] Tool schemas and permission declarations match actual behavior.
- [ ] No secret exposure, instruction concealment, permission escalation, or unsafe shell construction.
- [ ] External content has compatible licensing and required attribution.
- [ ] Tests and routing fixtures cover expected and non-trigger behavior.
- [ ] User-facing documentation and `CHANGELOG.md` reflect the change.

## Development checks

Run the checks relevant to the files you changed. The full Node.js validation sequence is:

```bash
npm test
npm run validate
npm run eval
node bin/extremis.mjs build
node bin/extremis.mjs build --check
```

The Python client has a separate standard-library test suite:

```bash
python -m unittest discover -s python/tests -v
```

The supported Node.js baseline is 18.17 or later. The Python client supports Python 3.9 or later and launches the Node.js MCP server, so Node.js is still required when using the client.

Report the commands you ran and any checks you could not run. A passing structural validator or routing evaluation is not a substitute for behavioral testing or human review.

## Licensing

EXTREMIS is licensed under the [Apache License 2.0](LICENSE). New contributions to the project are made available under that license. This does not relicense third-party material: verify compatibility and retain any notices, attribution, or source references required by the original license.
