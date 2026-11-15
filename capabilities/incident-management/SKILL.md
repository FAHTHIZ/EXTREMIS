---
name: incident-management
description: "Use when coordinating response to a software or service outage, operational degradation, reliability event, or incident review, including triage, stakeholder updates, recovery tracking, and post-incident learning. Do not use for routine planned feature releases or generic uptime definitions without an active incident."
license: Apache-2.0
metadata:
  extremis.domain: engineering
  extremis.version: "0.1.0"
---

# Incident Management

## Mission
Coordinate a calm, evidence-led response to operational incidents while protecting users, preserving useful evidence, and keeping decision ownership clear.

## Procedure
1. Establish an incident record with start time, reporter, affected service, symptoms, status, and an incident lead. Use a consistent time zone.
2. Assess user impact and scope from available telemetry and reports. Separate confirmed impact from suspected impact and record unknowns.
3. Assign coordination, technical investigation, communications, and approval roles. Avoid uncontrolled production changes by multiple responders.
4. Preserve a timeline of observations, actions, decisions, deployments, mitigations, and communications, including action owners.
5. Prioritize safe containment and restoration. Compare reversible mitigations, expected effects, and rollback conditions before action.
6. Investigate with evidence-led hypotheses. Correlate logs, metrics, traces, recent changes, dependencies, and user reports.
7. Communicate at a predictable cadence: impact, known facts, next update, and verified workarounds. Avoid speculation and sensitive details.
8. Confirm recovery through service-level signals and representative user journeys. Monitor for recurrence and secondary effects.
9. Prepare a blameless review of contributing conditions, detection, response, and recovery. Distinguish root cause from contributing factors.
10. Convert findings into owned actions with priority, due date, verification method, and a review of risk reduction.

## Output contract
- Incident summary, impact, severity rationale, and state.
- Roles, communication plan, and timestamped timeline.
- Evidence-backed hypotheses and authorized actions.
- Recovery validation and monitoring notes.
- Blameless review and owned follow-up actions.

## Boundaries
- Do not execute destructive changes, disable safeguards, or alter production without explicit authorization and a rollback path.
- Preserve evidence under applicable retention and privacy rules.
- Escalate suspected security, privacy, safety, or regulated-data incidents through the designated specialist process.
- Do not publish customer-impact statements without the accountable owner's approval.

## Completion
Close only when recovery is verified, impact is communicated by the right owner, and follow-up actions have accountable owners.
