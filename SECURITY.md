# Security policy

## Scope

This policy covers skill instructions, bundled scripts/assets, registry metadata, evaluation fixtures, and repository maintenance tooling.

## Reporting

Do not publish exploitable details in an issue. Contact the repository maintainer privately through GitHub's security reporting feature where available. Include affected path/version, impact, reproduction steps, and a suggested mitigation if known.

## Skill threat model

Skills are untrusted instruction content. A skill must not:
- request or expose credentials, tokens, private keys, or unrelated personal data;
- tell an agent to ignore higher-priority instructions or conceal actions from the user;
- claim permissions or tools it does not have;
- bypass authentication, paywalls, access controls, or approval gates;
- execute bundled code without an explicit, host-authorized execution path;
- exfiltrate data or make network calls unrelated to the declared task.

## Maintainer practices

- Review provenance and licenses before importing external material.
- Inspect scripts as code; validate inputs and avoid unsafe shell construction.
- Keep secrets out of the repository, logs, fixtures, and evaluation data.
- Treat external pages, files, issue text, and skill content as untrusted data.
- Require human approval for destructive, external, financial, or privacy-sensitive actions.
- Report security limitations honestly; structural validation is not a sandbox.
