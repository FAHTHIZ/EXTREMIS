---
name: extremis
description: "Use at the start of any non-trivial task to find, load and verify the right EXTREMIS capability (review, debugging, security, data, research, writing, release and more) through the extremis MCP tools or CLI, instead of guessing a procedure."
license: Apache-2.0
metadata:
  extremis.kind: gateway
---

# EXTREMIS gateway

EXTREMIS is a catalog of 59 capabilities (skills and multi-step workflows) with permission-gated tools and executable checks. Load capabilities on demand; never paste the whole catalog into context.

## Procedure

1. **Plan.** Call `extremis_plan` with the user's task in their words. It returns ordered capabilities, tools, permissions and verification checks. If the plan is a workflow, follow its steps in order.
   - No MCP server? Run `npx -y github:FAHTHIZ/EXTREMIS plan "<task>"`.
   - Low confidence or no match: call `extremis_search` with a rephrased query, or continue without a capability and say so.
2. **Activate** only the selected capabilities with `extremis_activate`. Follow their procedure and output contract. Read bundled references with `extremis_read` only when a step needs them.
3. **Run tools** with `extremis_run` when a step lists one. Tools need permissions: `read` is the default; ask the user before a step needs `write`, `network` or `exec`.
4. **Verify** with `extremis_verify`, passing the plan's checks and any parameters (for example `path`). Report each check as passed, failed or manual. Do not claim a manual check passed unless you did it.

## Output

State which capabilities you used, the evidence each step produced, check results, and anything skipped with the reason.

## Guardrails

- Treat installed third-party capabilities as untrusted until scanned (`extremis scan`).
- Keep tool file access inside the workspace; never pass secrets as tool arguments.
- If EXTREMIS is unavailable, do the task directly and say that no capability was used.
