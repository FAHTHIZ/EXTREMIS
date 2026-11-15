---
name: ux-audit
description: Use when evaluating an existing website, application, workflow, or prototype for usability, information architecture, interaction clarity, consistency, and task completion barriers.
metadata:
  extremis.category: design
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# UX Audit

## Mission

Identify where people struggle to complete important tasks and recommend improvements grounded in the actual interface.

## Prerequisites

- a working interface, screenshots, prototype, or user-journey description
- target users and key tasks; user testing or analytics recommended

## Procedure

1. Clarify target users, context of use, key tasks, platform, business objective, and what evidence is available.
2. Walk through critical user journeys from entry to completion. Record each step, system response, decision, error, and recovery path.
3. Inspect information architecture, navigation labels, content hierarchy, affordances, feedback, forms, empty states, loading states, and error states.
4. Evaluate consistency and predictability across screens, devices, and interaction patterns. Check whether visual emphasis matches task importance.
5. Inspect usability against established heuristics such as visibility of system status, user control, error prevention, recognition over recall, and helpful recovery.
6. Observe or propose task-based usability tests with neutral prompts. Record completion, missteps, time, confidence, and participant context without overgeneralizing small samples.
7. Rate findings by user impact, task frequency, confidence, and remediation effort. Attach screenshots, steps, or evidence to each finding.
8. Recommend fixes in priority order and define how to verify them through retesting or product metrics.

## Output contract

- Scope and user/task assumptions.
- Journey-based findings with evidence.
- Severity and confidence for each issue.
- Prioritized design recommendations.
- Retest plan and measurable outcomes.

## Boundaries and stop conditions

- Do not infer user behavior from visual taste alone.
- Do not fabricate user-test results or analytics.
- Avoid appearance judgments that shame users or target protected traits.
- State when only static screenshots were available and interaction behavior could not be tested.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
