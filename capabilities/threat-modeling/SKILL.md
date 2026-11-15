---
name: threat-modeling
description: "Use when defensively identifying security and privacy threats in an application, service, architecture, data flow, or feature before release or after a material change."
license: Apache-2.0
metadata:
  extremis.domain: security
  extremis.version: "0.1.0"
---

# Threat Modeling

## Mission

Help a team anticipate plausible risks and choose proportionate mitigations before those risks become incidents.

## Prerequisites

- system description or architecture diagram
- authorized scope and relevant security requirements

## Procedure

1. Confirm system ownership, scope, purpose, deployment context, users, and the decision the threat model should support.
2. Inventory important assets, identities, secrets, data classifications, critical operations, and security assumptions.
3. Draw a simple data-flow or trust-boundary diagram showing components, entry points, storage, external services, and privileged transitions.
4. Identify threat actors at a high level and what assets or outcomes could be affected. Avoid unsupported claims about a specific real-world target.
5. Use a structured lens such as spoofing, tampering, repudiation, information disclosure, denial of service, and elevation of privilege to find missing controls.
6. For each threat, document the affected asset, boundary crossed, preconditions, plausible impact, existing control, likelihood rationale, and confidence.
7. Propose layered mitigations such as least privilege, strong authentication, validation, encryption, rate limits, auditability, isolation, backups, and safe failure modes.
8. Prioritize using business impact and exposure. Identify residual risks, owners, due dates, and decisions requiring human approval.
9. Revisit the model when architecture, dependencies, data sensitivity, permissions, or deployment conditions change.

## Output contract

- Scope, assets, actors, and assumptions.
- Data-flow and trust-boundary summary.
- Threat register with impact and evidence rationale.
- Defensive mitigations and residual risk.
- Owners and review triggers.

## Boundaries and stop conditions

- Threat modeling is defensive architecture work; do not generate operational attack playbooks or evasion instructions.
- Do not test or access systems outside the authorized scope.
- Do not treat a checklist or model as proof that a system is secure.
- Escalate high-impact risks to the system owner and qualified security reviewers.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
