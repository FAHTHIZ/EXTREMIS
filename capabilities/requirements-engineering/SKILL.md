---
name: requirements-engineering
description: "Use when eliciting, structuring, prioritizing, reviewing, or tracing product and system requirements, including functional behavior, quality attributes, constraints, acceptance criteria, and change control."
license: Apache-2.0
metadata:
  extremis.domain: engineering
  extremis.version: "0.1.0"
---

# Requirements Engineering

## Mission
Translate stakeholder needs into clear, testable, traceable requirements that guide design, delivery, and verification.

## Procedure
1. Define the problem, system boundary, stakeholders, users, external actors, and decision owner. Record what is explicitly out of scope.
2. Elicit needs from source material, workflows, standards, support evidence, and operational constraints. Label assumptions and unresolved conflicts.
3. Separate user needs, business goals, functional requirements, quality attributes, interfaces, constraints, and transition requirements.
4. Write each requirement with one testable idea, a unique ID, rationale, source, priority, owner, and verification method. Replace vague words like fast or robust with measurable criteria.
5. Add acceptance criteria with observable preconditions, actions, outcomes, error cases, and boundary conditions. Use examples to remove ambiguity.
6. Check consistency, completeness, feasibility, necessity, non-duplication, and traceability. Identify conflicts and external dependencies.
7. Prioritize by user value, risk, urgency, dependency, and cost of delay. Keep mandatory constraints distinct from preferences.
8. Trace requirements to architecture, implementation, tests, operations, and release criteria. Highlight orphaned requirements and unverified behavior.
9. Manage changes through impact analysis across stakeholders, interfaces, tests, schedules, costs, and approved decisions.
10. Review the baseline with accountable stakeholders and maintain a visible list of decisions, assumptions, and open questions.

## Output contract
- Scope, stakeholders, and context.
- Structured requirements with IDs, rationale, priority, and source.
- Testable acceptance criteria and verification methods.
- Traceability/dependency map.
- Assumptions, conflicts, decisions, and change-impact notes.

## Boundaries
- Do not invent stakeholder agreement or silently resolve contradictory requirements.
- Do not claim compliance with a standard without checking its authoritative text and applicability.
- Escalate safety-critical, regulated, or contractual requirements for qualified review.
- Do not treat implementation details as user needs unless they are genuine constraints.

## Completion
Finish when requirements are understandable, verifiable, traceable, and accepted by the right owner or clearly marked provisional.
