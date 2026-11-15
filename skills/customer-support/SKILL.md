---
name: customer-support
description: Use when classifying customer support requests, drafting helpful responses, identifying missing information, routing issues, or summarizing recurring support trends.
metadata:
  extremis.category: customer-operations
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Customer Support Triage

## Mission

Help the customer move toward a reliable resolution while preserving privacy and not promising actions the agent cannot perform.

## Prerequisites

- the customer's message and available product knowledge
- support policies, account tools, and escalation paths if provided

## Procedure

1. Identify the user's stated problem, desired outcome, product area, impact, urgency, and whether the message indicates a safety or security concern.
2. Search the supplied or approved product documentation and known incident information. Prefer current authoritative guidance over memory.
3. Classify the request: how-to, account access, billing, bug, outage, feature request, policy, security/privacy, or other.
4. Ask for only the minimum missing diagnostic information. Do not request passwords, full payment credentials, private keys, or unnecessary personal data.
5. Draft a clear response that acknowledges the issue, explains verified facts, gives safe next steps, and sets realistic expectations.
6. For suspected bugs, collect a concise reproduction path, app/version/environment, expected versus actual result, and relevant redacted logs.
7. Escalate security, privacy, account compromise, payment disputes, safety concerns, and high-impact outages through the defined official channel.
8. Record issue category, severity, status, evidence, owner, and promised follow-up only when supported by the workflow.
9. Review the response for tone, accuracy, unnecessary disclosure, and commitments the agent is not authorized to make.

## Output contract

- Issue classification and impact.
- Evidence or documentation consulted.
- Draft response and minimal diagnostic questions.
- Escalation route and urgency when needed.
- Known unknowns and next owner/action.

## Boundaries and stop conditions

- Never request passwords, one-time codes, full payment details, or private keys.
- Do not claim a refund, account change, repair, or escalation occurred unless the authorized system confirms it.
- Do not disclose another customer's data or internal confidential details.
- Escalate suspected compromise or urgent safety matters using official procedures.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
