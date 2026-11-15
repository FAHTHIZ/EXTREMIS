# Host compatibility

EXTREMIS uses the portable Agent Skills directory convention: a skill directory contains a `SKILL.md` with YAML frontmatter (`name`, `description`) and Markdown instructions. Optional references, scripts, and assets are loaded only when required.

## Portability boundary

The format does not standardize:
- where a host stores or discovers skills;
- whether skills are automatically activated or explicitly invoked;
- tool APIs, tool permissions, or approval UX;
- hooks, memory, subagent spawning, model routing, or persistent state;
- script runtime, sandboxing, or network policy.

A skill must never claim these are available unless the host declares them.

## Authoring rules

- Keep core instructions host-neutral.
- Put host-specific installation and invocation notes in adapter documentation, not in the portable procedure.
- Declare concrete runtime prerequisites in `compatibility` only when necessary.
- Treat `allowed-tools` as experimental and host-dependent; it is not a security boundary.
- Scripts must document runtime/dependencies and be safe to retry.
- Do not execute scripts merely because they exist in a skill package.

## Compatibility status

A host is compatible only after an installation/discovery test and a behavior test have been run on that host. A directory name or successful copy operation is not proof of compatibility.

See the official [Agent Skills specification](https://agentskills.io/specification) for the portable format contract.
