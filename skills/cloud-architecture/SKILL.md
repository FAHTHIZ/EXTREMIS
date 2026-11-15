---
name: cloud-architecture
description: Use when designing or reviewing cloud infrastructure, deployment topology, platform architecture, cloud migration, service boundaries, or resilience and cost trade-offs across cloud environments.
metadata:
  extremis.category: engineering
  extremis.version: "0.1.0"
  extremis.risk: high
---

# Cloud Architecture

## Mission
Design cloud architectures around workload needs, explicit trade-offs, and operational ownership rather than provider fashions.

## Procedure
1. Define workload boundaries, users, data flows, trust boundaries, critical dependencies, environments, and expected growth. Record assumptions.
2. Establish drivers: availability, latency, throughput, recovery objectives, data residency, compliance, team skills, delivery speed, and total cost.
3. Compare compute, storage, networking, identity, messaging, and managed-service options. Prefer the simplest design that satisfies requirements.
4. Map failure domains, dependency chains, capacity limits, backups, restoration paths, and degraded modes. Look for common-cause failures.
5. Design least-privilege identity, workload authentication, secret handling, network boundaries, encryption, auditability, and controlled change.
6. Model lifecycle cost including baseline/peak usage, transfer, storage, observability, backups, support, and exit costs.
7. Specify infrastructure as code, environment separation, configuration management, drift detection, and safe deployment/rollback.
8. Define observability, service objectives, alert ownership, incident escalation, and runbooks.
9. Evaluate portability and lock-in as explicit business trade-offs. Document proprietary dependencies and exit costs.
10. Produce an architecture decision record and validate with threat, failure, cost, and operational reviews.

## Output contract
- Workload requirements and assumptions.
- Architecture diagram or structured component/data-flow description.
- Security, resilience, operations, and cost trade-offs.
- Decision record, alternatives, and validation plan.

## Boundaries
- Do not claim compliance, certification, or availability guarantees from a sketch.
- Do not change live infrastructure without authorization and rollback planning.
- Verify current provider prices, limits, and regional availability.
- Escalate regulated or safety-critical decisions to qualified reviewers.

## Completion
Finish when the architecture is traceable to requirements, trade-offs are explicit, and validation gaps are visible.
