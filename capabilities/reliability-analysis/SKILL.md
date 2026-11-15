---
name: reliability-analysis
description: "Use when assessing reliability, availability, maintainability, failure patterns, service resilience, maintenance intervals, or operational risks in a technical system."
license: Apache-2.0
metadata:
  extremis.domain: engineering
  extremis.version: "0.1.0"
---

# Reliability Analysis

## Mission

Understand how a system may fail and how reliability can be measured and improved without implying a safety certification.

## Prerequisites

- system boundary and operating context
- failure, maintenance, incident, or usage data when available

## Procedure

1. Define the system boundary, operating conditions, duty cycle, service expectations, critical functions, and what counts as failure.
2. Collect incident history, maintenance records, component specifications, environmental conditions, and data quality limitations.
3. Classify failure modes, effects, causes, detection methods, and current controls. Separate observed incidents from plausible scenarios.
4. Estimate reliability and availability metrics only when data and assumptions support them. State censoring, exposure time, sample size, and uncertainty.
5. Prioritize risks using transparent severity, likelihood, detectability, and consequence criteria. Do not let a single numerical score hide catastrophic outcomes.
6. Identify mitigations such as design simplification, monitoring, redundancy, graceful degradation, spare capacity, maintainability, or operator procedures.
7. Evaluate common-cause failures, dependencies, single points of failure, recovery time, and maintenance-induced faults.
8. Define measurable reliability objectives and monitoring signals. Establish how field evidence will update assumptions and maintenance plans.
9. Review recommendations with domain specialists for safety-critical, regulated, or physically hazardous systems before operational use.

## Output contract

- System boundary and failure definition.
- Evidence-backed failure-mode register.
- Metric definitions and uncertainty.
- Mitigation and maintenance recommendations.
- Monitoring plan and review requirements.

## Boundaries and stop conditions

- Do not claim a system is safe or certified based on a lightweight analysis.
- Do not provide operational procedures that expose people to hazardous equipment or environments.
- Do not invent failure rates or extrapolate tiny samples as precise predictions.
- Prioritize severe consequences explicitly even when probability estimates are uncertain.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
