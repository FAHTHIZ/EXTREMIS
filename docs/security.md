# Security model

EXTREMIS processes capability packages that may contain instructions, references, manifests, resources, and executable tool definitions. Treat third-party capability content as untrusted until reviewed.

## Trust boundaries

1. **Agent host:** owns model interaction, reasoning, user consent, and the decision to call tools.
2. **EXTREMIS service:** discovers and activates capabilities, validates schemas, resolves declared dependencies, and checks requested permissions.
3. **Built-in tools:** execute through the shared runner with an explicit allowlist and workspace-aware file helpers.
4. **Third-party scripts:** execute as ordinary operating-system subprocesses. They are not confined by the JavaScript path helpers and are not an OS sandbox.
5. **External sources:** are subject to source validation, archive limits, scanning, and provenance/integrity records.

## Permission defaults

The default permission set is `read`. The runner recognizes `read`, `write`, `network`, and `exec`. Grant additional permissions only when required and understood. In particular, `exec` lets a capability start a subprocess; a scrubbed environment, disabled shell interpolation, timeout, and output cap do not make arbitrary code safe.

The host must still obtain appropriate user approval. A capability manifest declaring a permission does not grant that permission by itself.

## Installation policy

- HTTPS is the preferred transport for remote downloads and Git sources.
- HTTP requires the explicit `EXTREMIS_ALLOW_INSECURE_INSTALL=1` opt-in.
- SSH Git transport is disabled unless `EXTREMIS_ALLOW_SSH_GIT=1` is set.
- Local `file://` Git sources are accepted only for local-machine paths.
- Embedded username/password credentials in remote URLs are rejected.
- HTTP downloads validate the initial URL and every manually-followed redirect; redirects are limited to five and non-HTTP(S) destinations are rejected.
- Git fetches disable prompts, global/system configuration, credential helpers, hooks, submodule recursion, and HTTP redirects. Only the selected transport is enabled for the fetch.
- Private and special-use IP destinations are blocked by the shared URL validator unless the caller explicitly enables `EXTREMIS_ALLOW_PRIVATE_NETWORK=1` for a controlled local test or trusted environment.

DNS validation is a preflight control. It is not a guarantee that the eventual connection is pinned to the exact address returned by the check. Use host-level egress filtering and isolated build environments when stronger network guarantees are required.

## Scanner behavior

The scanner checks capability content for suspicious instruction overrides, concealment requests, hidden Unicode, dangerous command patterns, credential access/exfiltration patterns, known collection endpoints, embedded secrets, native executables, unusual file types, symlinks, and size limits.

Verdicts are intentionally conservative:

- **safe:** no finding above the low/info thresholds. This is not a security certification.
- **caution:** one or more medium/high findings. Review the report before using the explicit risk-acceptance option.
- **dangerous:** a critical finding. Installation is refused; this verdict is not overridable.

Static scanning has false positives and false negatives. New obfuscation techniques, indirect instructions, and context-dependent behavior can evade pattern matching. Review source and provenance independently.

## Archive and filesystem handling

Archive extraction rejects absolute paths, traversal segments, escaping links, unsupported special members, and configured entry/file/total-size excesses. Internal links are materialized as file copies so installed packages do not retain archive symlinks.

Built-in file writes resolve the nearest existing parent and reject symlinked path components before creating missing directories. This protects against pre-existing symlink escapes; it is not an OS-level race-free filesystem sandbox. For hostile multi-user environments, run the host in a dedicated workspace/container with OS-enforced access controls.

## Lockfiles and integrity

The lockfile records installation source, resolved Git commit or remote digest where available, content hash, scanner summary, and timestamps. `extremis lock --verify` detects modified, missing, or untracked installed capabilities.

A content hash detects changes relative to the recorded installation. It does not prove the original source was trustworthy, nor does it replace signed releases or independent review.

## Reporting

When reporting a suspected vulnerability, include the affected version/commit, the smallest reproducible case, expected behavior, and observed behavior. Avoid publishing secrets or personal data in issue reports.
