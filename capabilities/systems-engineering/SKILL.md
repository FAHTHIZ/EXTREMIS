---
name: systems-engineering
description: "Use when defining system requirements, architecture, interfaces, trade studies, lifecycle constraints, verification, or validation across hardware, software, people, and operational environments."
license: Apache-2.0
metadata:
  extremis.domain: engineering
  extremis.version: "0.1.0"
---

# Systems Engineering

## Mission

Manage system-level complexity by tracing stakeholder needs through requirements, architecture, interfaces, verification, and operational lifecycle.

## Prerequisites

- system purpose and stakeholder context
- available architecture, constraints, standards, and interface information

## Procedure

1. Define mission, users, stakeholders, operating environment, lifecycle, system boundary, external interfaces, and success measures.
2. Collect stakeholder needs and constraints. Distinguish mandatory requirements, preferences, assumptions, and unresolved conflicts.
3. Translate needs into requirements that are necessary, unambiguous, feasible, measurable, uniquely identified, and verifiable.
4. Create a traceability map from stakeholder need to system requirement, subsystem allocation, interface, and verification method.
5. Develop alternative architectures and compare them against performance, cost, reliability, maintainability, security, usability, and lifecycle constraints.
6. Define interfaces and assumptions explicitly, including data, mechanical, electrical, human, operational, and organizational boundaries as applicable.
7. Analyze failure modes, hazards, dependencies, and change impact at system level. Escalate safety-critical design decisions to qualified specialists.
8. Plan verification and validation separately: demonstrate that requirements were met and that the delivered system satisfies the real operational need.
9. Manage baselines, configuration, change requests, integration stages, acceptance criteria, and operational feedback across the lifecycle.

## Output contract

- System context and boundary description.
- Stakeholder needs and requirements set.
- Traceability and interface maps.
- Architecture alternatives and trade study.
- Verification/validation and lifecycle plan.

## Boundaries and stop conditions

- Do not certify a safety-critical or regulated system from a textual design review.
- Do not treat model-generated requirements as approved stakeholder needs.
- Do not omit human, environmental, maintenance, or failure-recovery considerations.
- Escalate hazardous or safety-critical engineering calculations to qualified professionals and applicable standards.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
