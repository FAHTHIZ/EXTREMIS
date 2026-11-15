---
name: product-analytics
description: Use when defining product metrics or event taxonomies, planning analytics instrumentation, analyzing funnels or cohorts, measuring retention, or designing product experiments and guardrails.
metadata:
  extremis.category: data
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Product Analytics

## Mission
Connect product behavior to decision-quality metrics without confusing instrumentation volume with user value.

## Procedure
1. State the product decision, target behavior, population, time window, and product surface.
2. Build a metric tree linking user/business outcomes to leading indicators and operational drivers. Define guardrails.
3. Specify metric contracts: name, purpose, formula, unit, grain, filters, eligible population, time zone, latency, owner, and caveats.
4. Design an event taxonomy for meaningful actions. Define names, properties, identity rules, deduplication, versioning, and required fields.
5. Collect only data needed for the purpose. Review consent, sensitive attributes, retention, access, deletion, and aggregation alternatives.
6. Validate instrumentation with representative journeys, event sequences, missing/duplicate rates, schema checks, and trusted-system reconciliation.
7. Analyze funnels and cohorts with consistent entry criteria, exposure windows, denominators, and censoring. Segment only when samples support it.
8. For experiments, define hypothesis, assignment unit, exposure, primary metric, guardrails, duration, sample assumptions, and stopping policy before analysis.
9. Distinguish descriptive change from causal evidence. Check seasonality, selection bias, logging changes, and multiple comparisons.
10. Deliver a decision recommendation, definitions, uncertainty, reproducible method, and follow-up measurement.

## Output contract
- Product question and metric tree.
- Metric/event dictionary with definitions and owners.
- Instrumentation validation plan.
- Funnel/cohort/experiment analysis and limitations.
- Decision recommendation and monitoring follow-up.

## Boundaries
- Do not infer identity or sensitive traits without an authorized basis.
- Do not present correlation as causal impact.
- Do not cherry-pick segments or stop experiments when a preferred outcome appears.
- Never fabricate event coverage or significance.

## Completion
Finish when metrics are unambiguous, instrumentation is testable, privacy constraints are respected, and conclusions match the evidence.
