---
name: observability-design
description: "Use when designing or improving observability for a service: structured logs, metrics, traces, symptom-based alerting, dashboards, sampling and cost, and on-call runbooks."
license: Apache-2.0
metadata:
  extremis.domain: engineering
  extremis.version: "0.1.0"
---

# Observability Design

## Mission

Design logs, metrics, traces, SLOs and alerts that answer real operational questions.

## Prerequisites

- service architecture and critical user journeys
- current logs, metrics or alert history if they exist

## Procedure

1. List the questions on-call must answer fast: is it broken, for whom, since when, where. Map each critical user journey to an SLI.
2. Instrument the golden signals per service (latency, traffic, errors, saturation) with consistent names, units and bounded label cardinality.
3. Make logs structured with a request or trace id, severity, and stable event names; drop secrets and personal data at the source. Use `logs.summarize` on a sample to see what the logs actually contain.
4. Add distributed tracing with OpenTelemetry and propagate context across queues and async work. Choose head or tail sampling by cost and the need to keep error traces.
5. Alert on user-facing symptoms and burn rate against the service's objectives (see `reliability-analysis` for setting them) rather than raw resource thresholds.
6. Make every page actionable: one owner, a runbook link, and a clear first step. Move everything else to tickets or dashboards.
7. Build one overview dashboard per service and one per journey; review alert volume and cost monthly.

## Output contract

- Signal plan: metrics, log events and spans per service
- Symptom and burn-rate alerts tied to user journeys
- Alert routing with owners and runbook links
- Sampling, retention and cost estimate

## Boundaries and stop conditions

- Do not log secrets, tokens or unnecessary personal data.
- Avoid unbounded labels (user id, URL with ids) on metrics.
- Do not add paging alerts without an owner and a runbook.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
