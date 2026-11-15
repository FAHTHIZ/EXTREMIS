---
name: competitive-analysis
description: "Use when comparing products, services, companies, open-source projects, or market alternatives to support positioning, product strategy, procurement, or technical decisions."
license: Apache-2.0
metadata:
  extremis.domain: business
  extremis.version: "0.1.0"
---

# Competitive Analysis

## Mission

Produce a fair comparison that explains which option fits which need, not a marketing-style winner list.

## Prerequisites

- the decision and comparison set
- comparison dimensions, geography, and time horizon

## Procedure

1. Define the decision, target user, use case, geography, time horizon, and alternatives. Include doing nothing or building internally where relevant.
2. Select comparable evaluation criteria: capability, usability, reliability, privacy, extensibility, integration, licensing, cost, support, and operational burden.
3. Gather current primary evidence from product documentation, source repositories, pricing pages, release notes, security notices, and user-facing demos.
4. Record source date, version, plan tier, platform, and test conditions. Separate official claims from observed behavior and independent reports.
5. Compare like with like. Identify missing features, gated capabilities, edition differences, and incompatible assumptions.
6. Evaluate maturity and sustainability: release cadence, issue health, contributor activity, governance, ecosystem, support model, and license obligations.
7. Score only when criteria and weights are explicit. Use qualitative ranges or confidence labels where measurements are unavailable.
8. Identify each option's strongest use case, weaknesses, switching cost, lock-in, and unresolved risks.
9. Recommend a choice only in relation to the user's stated priorities. Explain what evidence would change the recommendation.

## Output contract

- Decision framing and alternatives.
- Consistent comparison matrix.
- Source/version/provenance ledger.
- Strengths, gaps, risks, and fit by use case.
- Conditional recommendation with uncertainty.

## Boundaries and stop conditions

- Do not claim exhaustive market coverage from a sample of competitors.
- Do not present vendor marketing claims as independently verified facts.
- Do not scrape private data or bypass access restrictions.
- Do not copy proprietary code, docs, or skill packages into the project.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
