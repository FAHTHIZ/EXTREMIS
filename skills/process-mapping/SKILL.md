---
name: process-mapping
description: Use when documenting or improving an operational workflow, handoff, service process, approval path, customer journey, or recurring business procedure.
metadata:
  extremis.category: business
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Business Process Mapping

## Mission

Make work visible from trigger to outcome, including roles, decisions, handoffs, exceptions, and controls.

## Prerequisites

- process owner or source description
- access to interviews, documents, or operational evidence recommended

## Procedure

1. Define process boundaries: trigger, intended outcome, customer, owner, start/end points, and what is explicitly out of scope.
2. Gather the actual process from operators, system records, forms, policies, and observation. Distinguish documented policy from workarounds in practice.
3. Map steps in sequence with role, input, output, system, decision, handoff, wait state, and exception path.
4. Identify rework, queues, duplicated entry, unclear ownership, manual controls, single points of failure, and avoidable approvals.
5. Check the map with people who perform and receive the process. Resolve disagreements and preserve local variations that materially change the flow.
6. Measure the baseline where data exists: lead time, touch time, throughput, error/rework rate, backlog, service level, and cost.
7. Propose changes tied to specific failure modes. Assess customer impact, workload transfer, control weakening, system dependencies, and change-management needs.
8. Prioritize pilots with an owner, metric, timeframe, rollback plan, and decision threshold. Re-measure before claiming improvement.

## Output contract

- Scope and process owner.
- Current-state flow with roles and decision points.
- Evidence-backed bottleneck and risk list.
- Future-state proposal and trade-offs.
- Pilot plan and measurable success criteria.

## Boundaries and stop conditions

- Do not invent a current-state process from an org chart or policy alone.
- Do not remove compliance or safety controls merely to reduce steps.
- Do not use worker monitoring or personal performance scoring as a shortcut for process diagnosis.
- Protect confidential operational and customer information.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
